/**
 * Browser-half entry for the dsh-jupyter plugin — runs inside the dsh web GUI.
 *
 * Registers the locale dictionaries and mounts the notebook editor INTO the
 * built-in preview column (aionui-panel): when the active preview tab is a
 * .ipynb, the editor overlays the tab's content container — the tab strip,
 * width drag, collapse and dark theme stay the built-in ones. Failure policy:
 * DOM mounting problems are logged, never thrown — the web shell fails the
 * whole boot when a plugin apply throws.
 *
 * Export discipline (packages/client rule): the /client surface carries what
 * cordis loading needs plus types only — all value exports stay internal.
 * @module dsh-jupyter/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the LocaleNamespaceMap merge table.
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { JupyterApi } from './api.ts'
import { NS, dictionaries, setLanguage, type JupyterKey } from './locales.ts'
import { mountPanel } from './mount.tsx'
import { TerminalApi } from './terminal/api.ts'
import { TerminalController } from './terminal/controller.ts'
import { mountPanel as mountTerminalPanel } from './terminal/mount.tsx'
import { mountSidebarEntry } from './terminal/sidebar-entry.tsx'
import { injectTerminalPanelCss } from './terminal/styles.ts'

/** Locale namespace this plugin owns. */
const NS_LOCAL = NS

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** dsh-jupyter surface copy. */
    'dsh-jupyter': JupyterKey
  }
}

/** Required services: sessions (project root) and locale (copy). */
export const inject = ['sessions', 'locale']

/** Type-only surface (export discipline: no value exports beyond the plugin contract). */
export type { NotebookPanel } from './panel.tsx'
export type { TerminalPanel } from './terminal/panel.tsx'

/**
 * Mount the notebook editor into the built-in preview column, and the
 * terminal (sidebar entry + center-column panel, dsh-ssh style).
 * @param ctx - client root context (sessions + locale services).
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS_LOCAL, dictionaries), 'dsh-jupyter: dictionaries')

  const api = new JupyterApi()
  let disposeMount: (() => void) | undefined
  try {
    disposeMount = mountPanel(ctx, api)
  } catch (error) {
    // DOM failures degrade the notebook editor, never the GUI.
    console.warn('[dsh-jupyter] mount failed:', error)
  }

  const terminalApi = new TerminalApi()
  const terminalController = new TerminalController()
  const disposers: Array<() => void> = []
  try {
    injectTerminalPanelCss()
    disposers.push(mountSidebarEntry(terminalController))
    disposers.push(mountTerminalPanel(ctx, terminalController, terminalApi))
  } catch (error) {
    // DOM failures degrade the terminal panel, never the GUI.
    console.warn('[dsh-jupyter] terminal mount failed:', error)
  }
  // Language mirroring (the shell owns <html lang>; the dictionary follows).
  let langObserver: MutationObserver | undefined
  const syncLanguage = (): void => {
    setLanguage(document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en')
  }
  langObserver = new MutationObserver(syncLanguage)
  langObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
  syncLanguage()

  ctx.effect(() => () => {
    langObserver?.disconnect()
    disposeMount?.()
    for (const dispose of disposers.splice(0)) dispose()
  }, 'dsh-jupyter: ui mounts')
}
