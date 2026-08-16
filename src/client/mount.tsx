/**
 * Preview-column injection: the notebook editor mounts INSIDE the built-in
 * preview column (aionui-panel). Clicking a .ipynb in the explorer opens a
 * preview tab whose content is an "unsupported" placeholder (the panel's
 * content-type table is hardcoded and has no extension point); this plugin
 * detects the active .ipynb tab and overlays the notebook editor on the
 * column's content area. The tab strip, width drag, collapse and dark theme
 * all stay the built-in ones.
 *
 * Injection placement (important): the editor host is appended as a direct
 * child of the preview COLUMN, not of the React-managed content container.
 * The column is plain DOM created by aionui-panel's layout controller, so
 * React reconciliation never touches the host — no re-inject loop, no DOM
 * churn during handle drags. The host covers the content region (below the
 * tab bar + toolbar) via absolute positioning and follows the column size
 * with a ResizeObserver.
 *
 * Side-effect discipline: nothing observes document.body once the column is
 * found; a cheap interval syncs the editor with the active tab. Dragging the
 * built-in handles mutates frame/body styles, never the column's subtree, so
 * it never wakes this plugin.
 * @module dsh-jupyter/client/mount
 */

import { createRoot, type Root } from 'react-dom/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { JupyterApi } from './api.ts'
import { NotebookPanel } from './panel.tsx'
import { injectPanelCss } from './styles.ts'

/** The built-in preview column (aionui-panel stamps this attribute). */
const PREVIEW_COL_SELECTOR = '[data-aionui-preview-col]'

/** Poll interval once the column is found (tab switches land within one tick). */
const POLL_MS = 300

/** The active session's cwd becomes the project root ('' when none). */
function projectRootOf(ctx: ClientContext): string {
  const snapshot = ctx.sessions.list.getSnapshot()
  const sessionId = snapshot.current as string | undefined
  const cwd = sessionId === undefined ? undefined : (snapshot.byId as Record<string, { cwd?: string } | undefined>)[sessionId]?.cwd
  return typeof cwd === 'string' && cwd !== '' ? cwd : ''
}

/** Find the active preview tab's workspace-relative path, or null. */
function activeTabPath(col: HTMLElement): string | null {
  // The active tab carries title={tab.path}; the css-module class keeps the
  // `tabActive` local name, so [class*="tabActive"] matches it.
  const tab = col.querySelector<HTMLElement>('[class*="tabActive"][title]')
  if (tab === null) return null
  const path = tab.getAttribute('title')
  return typeof path === 'string' && path !== '' ? path : null
}

/** The injected editor state (host lives on the column, not in React). */
interface EditorBinding {
  root: Root
  host: HTMLDivElement
  col: HTMLElement
  lastPath: string | null
}

/** Hide the built-in toolbar while a notebook tab is active (our editor has its own). */
function setToolbarHidden(col: HTMLElement, hidden: boolean): void {
  const toolbar = col.querySelector<HTMLElement>('[class*="toolbar"]')
  if (toolbar === null) return
  const next = hidden ? 'none' : ''
  if (toolbar.style.display !== next) toolbar.style.display = next
}

/** The vertical offset of the content region (tab bar + toolbar, px). */
function contentTop(col: HTMLElement): number {
  let top = 0
  const tabBar = col.querySelector<HTMLElement>('[class*="tabBar"]')
  if (tabBar !== null) top += tabBar.offsetHeight
  const toolbar = col.querySelector<HTMLElement>('[class*="toolbar"]')
  if (toolbar !== null && toolbar.style.display !== 'none') top += toolbar.offsetHeight
  return top
}

/**
 * Mount the notebook editor into the built-in preview column.
 * @param ctx - client root context (sessions for the project root).
 * @param api - the /dsh-jupyter API client.
 * @returns disposer removing the observer and any injected tree.
 */
export function mountPanel(ctx: ClientContext, api: JupyterApi): () => void {
  injectPanelCss()

  let binding: EditorBinding | undefined
  let currentRoot = projectRootOf(ctx)
  let pollTimer: ReturnType<typeof setInterval> | undefined
  let waitingObserver: MutationObserver | undefined
  let resizeObserver: ResizeObserver | undefined

  const unsubscribeSessions = ctx.sessions.list.subscribe(() => {
    const next = projectRootOf(ctx)
    if (next === currentRoot) return
    currentRoot = next
    // Root change: the next poll re-renders (or clears) the editor.
  })

  /** Reposition/size the host to cover the content region below the bars. */
  const layoutHost = (): void => {
    if (binding === undefined) return
    const col = binding.col
    const top = contentTop(col)
    binding.host.style.top = `${top}px`
    binding.host.style.height = `${Math.max(0, col.clientHeight - top)}px`
  }

  /** Insert the editor host as a direct child of the preview column. */
  const bindEditor = (col: HTMLElement): void => {
    if (binding !== undefined && binding.col === col && binding.host.isConnected) return
    clearBinding()
    const host = document.createElement('div')
    host.dataset.dshjView = ''
    host.style.cssText = 'position:absolute;left:0;right:0;z-index:5;display:flex;flex-direction:column;min-height:0;overflow:hidden;'
    // The column is the positioning context (it is a grid item with
    // position static — make it a containing block; this does not disturb
    // the shell layout).
    if (getComputedStyle(col).position === 'static') {
      col.style.position = 'relative'
    }
    col.appendChild(host)
    binding = { root: createRoot(host), host, col, lastPath: null }
    // Follow the column size so the editor fills the content region.
    resizeObserver = new ResizeObserver(() => layoutHost())
    resizeObserver.observe(col)
    layoutHost()
  }

  /** Render the editor for `path` (bind first if needed); clear when null. */
  const renderFor = (col: HTMLElement, path: string | null): void => {
    bindEditor(col)
    if (binding === undefined) return
    if (binding.lastPath === path) return
    binding.lastPath = path
    binding.root.render(
      <NotebookPanel
        root={currentRoot}
        api={api}
        path={path}
      />,
    )
    layoutHost()
  }

  /** Remove the editor host. */
  const clearBinding = (): void => {
    if (binding === undefined) return
    binding.root.unmount()
    binding.host.remove()
    resizeObserver?.disconnect()
    resizeObserver = undefined
    binding = undefined
  }

  /** One poll tick: sync the editor with the active tab. */
  const tick = (): void => {
    const col = document.querySelector<HTMLElement>(PREVIEW_COL_SELECTOR)
    if (col === null) {
      clearBinding()
      return
    }
    const path = activeTabPath(col)
    if (path !== null && path.toLowerCase().endsWith('.ipynb')) {
      setToolbarHidden(col, true)
      renderFor(col, path)
    } else {
      setToolbarHidden(col, false)
      clearBinding()
      if (resizeObserver !== undefined) {
        resizeObserver.disconnect()
        resizeObserver = undefined
      }
    }
  }

  /** Start the interval once the column exists. */
  const startPolling = (): void => {
    if (pollTimer !== undefined) return
    pollTimer = setInterval(tick, POLL_MS)
    tick()
  }

  // Boot wait: observe ONLY until the column appears, then switch to the
  // interval and drop the observer entirely — nothing watches the document
  // at large afterwards, so built-in handle drags (frame/body style
  // mutations) never wake this plugin.
  waitingObserver = new MutationObserver(() => {
    if (document.querySelector(PREVIEW_COL_SELECTOR) !== null) {
      waitingObserver?.disconnect()
      waitingObserver = undefined
      startPolling()
    }
  })
  waitingObserver.observe(document.body, { childList: true, subtree: true })
  if (document.querySelector(PREVIEW_COL_SELECTOR) !== null) {
    waitingObserver.disconnect()
    waitingObserver = undefined
    startPolling()
  }

  return () => {
    waitingObserver?.disconnect()
    if (pollTimer !== undefined) clearInterval(pollTimer)
    unsubscribeSessions()
    clearBinding()
  }
}
