/**
 * Terminal panel (mirrors the dsh-ssh panel + terminal-tab design).
 *
 * The panel shell is a header (title + shell badge + actions) above the
 * terminal body; the xterm view is one PTY session spawned on first open.
 * The panel lives inside the center-column takeover container and stays
 * mounted across open/close (visibility is html-attribute driven by mount.tsx),
 * so a closed panel keeps its shell, scrollback and stream alive — the shell
 * only ends on an explicit restart, `exit`, or panel unmount.
 *
 * xterm's stylesheet ships as an embedded string (xterm.css.ts, generated at
 * build time — the ?raw suffix is not resolvable by the tsdown pipeline, same
 * approach as dsh-ssh) and is injected once per page load.
 * @module dsh-jupyter/client/terminal/panel
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { TerminalApi, TerminalStream } from './api.ts'
import type { TerminalController } from './controller.ts'
import type { TerminalSessionCreated } from '../../core/terminal-types.ts'
import { XTERM_CSS } from './xterm.css.ts'

/** Connection state shown by the status line. */
type Status = 'idle' | 'connecting' | 'live' | 'exited'

/** Panel props (controller + api + spawn root). */
export interface TerminalPanelProps {
  controller: TerminalController
  api: TerminalApi
  /** The current project root (session cwd) to spawn the shell in ('' = host default). */
  root: string
}

/** 16px inline SVG glyphs (stroke style matches the shell's nav icons). */
const icon = (paths: string, extra = ''): string =>
  `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${extra}${paths}</svg>`

/** Terminal prompt glyph (title + sidebar entry share it). */
const TERMINAL_ICON = icon('<rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M4.5 5.5l2.5 2.5-2.5 2.5"/><path d="M8.5 10.5h3"/>')
/** Clear screen: trash can. */
const CLEAR_ICON = icon('<path d="M3 4.5h10"/><path d="M6 4.5V3.5a1 1 0 011-1h2a1 1 0 011 1v1"/><path d="M4.6 4.5l.6 8a1 1 0 001 1h3.6a1 1 0 001-1l.6-8"/><path d="M6.8 7.2v3.6"/><path d="M9.2 7.2v3.6"/>')
/** Restart: circular arrow. */
const RESTART_ICON = icon('<path d="M13.5 8a5.5 5.5 0 11-1.6-3.9"/><path d="M13.6 2.6v2.9h-2.9"/>')
/** Close panel: X. */
const CLOSE_ICON = icon('<path d="M4.5 4.5l7 7"/><path d="M11.5 4.5l-7 7"/>')

/** Injected-once guard for the xterm stylesheet (one tag per page load). */
let xtermCssInjected = false
function ensureXtermCss(): void {
  if (xtermCssInjected || typeof document === 'undefined') return
  xtermCssInjected = true
  if (document.querySelector('style[data-dsh-terminal-xterm]') !== null) return
  const style = document.createElement('style')
  style.dataset.dshTerminalXterm = ''
  style.textContent = XTERM_CSS
  document.head.appendChild(style)
}

/** The terminal panel view. */
export function TerminalPanel({ controller, api, root }: TerminalPanelProps) {
  const [status, setStatus] = useState<Status>('idle')
  const [shellLabel, setShellLabel] = useState<string>('shell')
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const streamRef = useRef<TerminalStream | null>(null)
  const dimsRef = useRef<{ cols: number; rows: number }>({ cols: 80, rows: 24 })

  useEffect(() => { ensureXtermCss() }, [])

  /** Propagate current xterm cols/rows to the host when they actually changed. */
  const syncDims = useCallback(() => {
    const term = termRef.current
    const id = sessionIdRef.current
    if (term === null || id === null) return
    if (term.cols !== dimsRef.current.cols || term.rows !== dimsRef.current.rows) {
      dimsRef.current = { cols: term.cols, rows: term.rows }
      void api.resize(id, term.cols, term.rows)
    }
  }, [api])

  /**
   * Tear down the current session: abort the stream, kill the PTY, dispose
   * xterm. Safe to call when nothing is live.
   */
  const teardown = useCallback(async () => {
    streamRef.current?.cancel()
    streamRef.current = null
    if (sessionIdRef.current !== null) {
      await api.kill(sessionIdRef.current).catch(() => {})
      sessionIdRef.current = null
    }
    termRef.current?.dispose()
    termRef.current = null
    fitRef.current = null
  }, [api])

  /**
   * Spin up a fresh session: create the xterm Terminal, open it, fit, create
   * the host PTY, open the stream, wire input. Idempotent skip when a session
   * already exists.
   */
  const ensureSession = useCallback(async () => {
    if (termRef.current !== null || containerRef.current === null) return
    const term = new Terminal({
      fontFamily: 'Menlo, Consolas, "Liberation Mono", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 5000,
      theme: {
        // Transparent: the frosted-glass pane shows through (xterm canvases
        // are forced transparent by the panel stylesheet).
        background: 'transparent',
        foreground: '#d8dee9',
        cursor: '#a3b8d0',
        selectionBackground: '#264f78aa',
        black: '#3b4252',
        red: '#bf616a',
        green: '#a3be8c',
        yellow: '#ebcb8b',
        blue: '#81a1c1',
        magenta: '#b48ead',
        cyan: '#88c0d0',
        white: '#e5e9f0',
        brightBlack: '#4c566a',
        brightRed: '#bf616a',
        brightGreen: '#a3be8c',
        brightYellow: '#ebcb8b',
        brightBlue: '#81a1c1',
        brightMagenta: '#b48ead',
        brightCyan: '#8fbcbb',
        brightWhite: '#eceff4',
      },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    try {
      // Clear any previous xterm DOM (restart re-opens on the same container).
      containerRef.current.textContent = ''
      term.open(containerRef.current)
      fit.fit()
    } catch (error) {
      console.warn('[dsh-jupyter] xterm open failed:', error)
      term.dispose()
      return
    }
    termRef.current = term
    fitRef.current = fit
    setStatus('connecting')

    const created = await api.create(root, term.cols, term.rows)
    if (!created.ok) {
      term.writeln(`\x1b[31mfailed to start terminal: ${created.error.message}\x1b[0m`)
      setStatus('exited')
      return
    }
    const session: TerminalSessionCreated = created.value
    sessionIdRef.current = session.id
    setShellLabel(session.shell)
    setStatus('live')

    term.onData((data) => {
      const id = sessionIdRef.current
      if (id !== null) void api.input(id, data)
    })

    const stream = await api.stream(session.id, (event) => {
      if (event.kind === 'output') {
        term.write(event.data)
      } else if (event.kind === 'exited') {
        setStatus('exited')
        term.writeln(`\x1b[2m[process exited]\x1b[0m`)
      } else if (event.kind === 'error') {
        setStatus('exited')
        term.writeln(`\x1b[31m${event.message}\x1b[0m`)
      }
    })
    streamRef.current = stream
  }, [api, root])

  // Spawn on first open; keep alive across close/open (never teardown on close).
  useEffect(() => {
    const unsubscribe = controller.subscribe(() => {
      if (controller.getSnapshot().panelOpen) void ensureSession()
    })
    return unsubscribe
  }, [controller, ensureSession])

  // Unmount-only teardown (idempotent).
  useEffect(() => {
    return () => { void teardown() }
  }, [teardown])

  // Refit + propagate dims on container size changes (panel open/close or window resize).
  useEffect(() => {
    const container = containerRef.current
    const fit = fitRef.current
    const term = termRef.current
    if (container === null || fit === null || term === null) return
    const observer = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        return
      }
      syncDims()
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [syncDims])

  /** Clear screen: reset xterm + the host scrollback. */
  const handleClear = useCallback(() => {
    termRef.current?.clear()
    const id = sessionIdRef.current
    if (id !== null) void api.clear(id).catch(() => {})
  }, [api])

  /** Restart: tear down the session, then spin up a fresh one. */
  const handleRestart = useCallback(async () => {
    await teardown()
    setStatus('connecting')
    // re-create on next paint (the term container stays mounted)
    requestAnimationFrame(() => { void ensureSession() })
  }, [teardown, ensureSession])

  const statusText =
    status === 'connecting' ? '正在连接…'
      : status === 'live' ? '运行中'
        : status === 'exited' ? '会话已结束' : '未连接'

  return (
    <div className="dst-panel">
      <div className="dst-panel-header">
        <span className="dst-title-icon" dangerouslySetInnerHTML={{ __html: TERMINAL_ICON }} />
        <h2 className="dst-panel-title">终端</h2>
        <span className="dst-shell-badge">{shellLabel}</span>
        <span className="dst-status" data-status={status}>
          <span className="dst-status-dot" />
          {statusText}
        </span>
        <div className="dst-toolbar-spacer" />
        <button type="button" className="dst-icon-btn" title="清屏" aria-label="Clear" onClick={handleClear} dangerouslySetInnerHTML={{ __html: CLEAR_ICON }} />
        <button type="button" className="dst-icon-btn" title="重启会话" aria-label="Restart" onClick={handleRestart} dangerouslySetInnerHTML={{ __html: RESTART_ICON }} />
        <button type="button" className="dst-icon-btn" data-danger="true" title="关闭面板" aria-label="Close" onClick={() => { controller.close() }} dangerouslySetInnerHTML={{ __html: CLOSE_ICON }} />
      </div>
      <div className="dst-term-body">
        <div className="dst-term-wrap">
          <div ref={containerRef} className="dst-term-container" />
          {status === 'idle' && (
            <div className="dst-term-placeholder">打开面板后自动连接本机 shell…</div>
          )}
        </div>
      </div>
    </div>
  )
}
