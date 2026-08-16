/**
 * Panel view mounting (mirrors the dsh-ssh mount pattern).
 *
 * The `conversation` slot is single-occupant (ui-conversation) and external
 * plugins cannot declare slots, so the panel takes over the center column at
 * the DOM level: a container is appended inside the `[data-pane="conversation"]`
 * grid item (an extra trailing child React never manages), and a stylesheet
 * rule hides the conversation content while the panel is active. Toggling is
 * a data attribute on <html> — no React involvement, so the conversation
 * subtree underneath stays mounted and stateful.
 *
 * Cross-plugin exclusivity (ssh / task board): opening this panel evicts the
 * siblings both by removing their activation attributes and by dispatching
 * the shared `dsh-panel-activate` event; when a sibling activates, this panel
 * closes.
 * @module dsh-jupyter/client/terminal/mount
 */

import { createRoot, type Root } from 'react-dom/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { TerminalApi } from './api.ts'
import type { TerminalController } from './controller.ts'
import { TerminalPanel } from './panel.tsx'

/** The injected panel container (kept in the DOM, hidden when inactive). */
export const PANEL_VIEW_SELECTOR = '[data-dsh-terminal-view]'

const CONVERSATION_COLUMN_SELECTOR = '[data-pane="conversation"]'
const ACTIVE_ATTR = 'data-dsh-terminal-active'
/** Sibling panels' activation attributes (ssh + task board), removed when this panel opens. */
const OTHER_ACTIVE_ATTRS = ['data-dsh-taskboard-active', 'data-dsh-ssh-active']
/** Cross-plugin activation event; detail is the activating panel name. */
const ACTIVATE_EVENT = 'dsh-panel-activate'
const PANEL_NAME = 'terminal'

/** The active session's cwd becomes the spawn root ('' when none). */
function projectRootOf(ctx: ClientContext): string {
  const snapshot = ctx.sessions.list.getSnapshot()
  const sessionId = snapshot.current as string | undefined
  const cwd = sessionId === undefined ? undefined : (snapshot.byId as Record<string, { cwd?: string } | undefined>)[sessionId]?.cwd
  return typeof cwd === 'string' && cwd !== '' ? cwd : ''
}

/** Find the center column, or undefined while the frame is not mounted. */
function conversationColumn(): HTMLElement | undefined {
  return document.querySelector<HTMLElement>(CONVERSATION_COLUMN_SELECTOR) ?? undefined
}

/**
 * Mount the panel React tree into the center column and bind its visibility
 * to the controller's panelOpen state.
 * @param ctx - client root context (sessions for the project root).
 * @param controller - the panel state owner.
 * @param api - the terminal API client.
 * @returns disposer unmounting the tree and restoring the column.
 */
export function mountPanel(ctx: ClientContext, controller: TerminalController, api: TerminalApi): () => void {
  let root: Root | undefined
  let container: HTMLDivElement | undefined
  let currentRoot = projectRootOf(ctx)

  // Follow the project root: a not-yet-created session spawns in the new cwd.
  const unsubscribeSessions = ctx.sessions.list.subscribe(() => {
    const next = projectRootOf(ctx)
    if (next === currentRoot) return
    currentRoot = next
    root?.render(<TerminalPanel controller={controller} api={api} root={currentRoot} />)
  })

  const ensure = (): void => {
    if (container !== undefined) {
      if (container.isConnected) return
      // The conversation pane was replaced; drop the stale tree and remount.
      root?.unmount()
      root = undefined
      container.remove()
      container = undefined
    }
    const column = conversationColumn()
    if (column === undefined) return
    container = document.createElement('div')
    container.dataset.dshTerminalView = ''
    container.className = 'dst-view'
    column.appendChild(container)
    root = createRoot(container)
    root.render(<TerminalPanel controller={controller} api={api} root={currentRoot} />)
  }

  // The frame mounts after boot settlement; watch for the column's arrival.
  const waitObserver = new MutationObserver(() => { ensure() })
  waitObserver.observe(document.body, { childList: true, subtree: true })

  const applyActive = (): void => {
    if (controller.getSnapshot().panelOpen) {
      // Single-occupant center column: opening this panel must evict the
      // sibling panels (task board, ssh), both their html attributes and
      // their controller state, otherwise the panels' visibility rules fight
      // and the second click appears dead.
      for (const attr of OTHER_ACTIVE_ATTRS) document.documentElement.removeAttribute(attr)
      document.documentElement.setAttribute(ACTIVE_ATTR, '')
      document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: PANEL_NAME }))
    } else {
      document.documentElement.removeAttribute(ACTIVE_ATTR)
    }
  }
  const onOtherActivate = (event: Event): void => {
    const detail = (event as CustomEvent).detail
    if (detail !== PANEL_NAME && controller.getSnapshot().panelOpen) {
      controller.close()
    }
  }
  // Jump out on sidebar context clicks: clicking a session/workspace row
  // hands the center column back to the conversation. Capture phase, so the
  // panel closes before the shell processes the click.
  const SIDEBAR_ROW_SELECTOR = '[class*="sessionRow"], [class*="projectRow"], [class*="searchResultRow"], [class*="searchResultWorkspace"], [class*="newSession"]'
  const onClickSidebarRow = (event: MouseEvent): void => {
    if (!controller.getSnapshot().panelOpen) return
    const target = event.target as HTMLElement | null
    if (target === null) return
    if (target.closest(SIDEBAR_ROW_SELECTOR) !== null) controller.close()
  }
  document.addEventListener('click', onClickSidebarRow, true)
  document.addEventListener(ACTIVATE_EVENT, onOtherActivate)
  const unsubscribe = controller.subscribe(applyActive)
  applyActive()
  ensure()

  return () => {
    document.removeEventListener('click', onClickSidebarRow, true)
    document.removeEventListener(ACTIVATE_EVENT, onOtherActivate)
    waitObserver.disconnect()
    unsubscribeSessions()
    unsubscribe()
    document.documentElement.removeAttribute(ACTIVE_ATTR)
    root?.unmount()
    root = undefined
    container?.remove()
    container = undefined
  }
}
