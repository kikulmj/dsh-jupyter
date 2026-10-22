/**
 * Browser API client for the /dsh-jupyter routes. All calls POST JSON and
 * decode the shared envelope; execute streams NDJSON lines through a reader.
 * @module dsh-jupyter/client/api
 */

import type { ExecuteEvent, JupyterError, NotebookView, NbCell, NbOutput, TextFileView } from '../core/types.ts'

/** Transport failure (fetch threw or the response was not readable). */
const TRANSPORT_ERROR: JupyterError = { code: 'internal', message: 'jupyter route unavailable' }

/** POST one JSON payload and decode the envelope; never throws. */
async function post<T>(path: string, payload: unknown, signal?: AbortSignal): Promise<{ ok: true; value: T } | { ok: false; error: JupyterError }> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    })
  } catch {
    return { ok: false, error: TRANSPORT_ERROR }
  }
  try {
    const envelope = await response.json() as { ok?: boolean; value?: T; error?: JupyterError }
    if (envelope.ok === true) return { ok: true, value: envelope.value as T }
    return { ok: false, error: envelope.error ?? TRANSPORT_ERROR }
  } catch {
    return { ok: false, error: TRANSPORT_ERROR }
  }
}

/** The typed API surface the panel drives. */
export class JupyterApi {
  /** Read and parse a notebook file. */
  read(sessionId: string, path: string, signal?: AbortSignal): Promise<{ ok: true; value: NotebookView } | { ok: false; error: JupyterError }> {
    return post<NotebookView>('/dsh-jupyter/read', { sessionId, path }, signal)
  }

  /** Replace a non-notebook file with a fresh one-cell notebook. */
  create(sessionId: string, path: string, overwrite: boolean): Promise<{ ok: true; value: NotebookView } | { ok: false; error: JupyterError }> {
    return post<NotebookView>('/dsh-jupyter/create', { sessionId, path, overwrite })
  }

  /** Write the notebook back (with the filesystem version guard). */
  write(
    sessionId: string,
    path: string,
    notebook: { cells: NbCell[]; metadata: Record<string, unknown> },
    baseVersion: string,
  ): Promise<{ ok: true; value: { version: string } } | { ok: false; error: JupyterError }> {
    return post<{ version: string }>('/dsh-jupyter/write', { sessionId, path, notebook, baseVersion })
  }

  /** Interrupt the running cell (no-op when idle). */
  interrupt(sessionId: string, path: string): Promise<{ ok: true; value: { ok: boolean } } | { ok: false; error: JupyterError }> {
    return post<{ ok: boolean }>('/dsh-jupyter/interrupt', { sessionId, path })
  }

  /** Restart the kernel (fresh state). */
  restart(sessionId: string, path: string): Promise<{ ok: true; value: { ok: boolean } } | { ok: false; error: JupyterError }> {
    return post<{ ok: boolean }>('/dsh-jupyter/restart', { sessionId, path })
  }

  /** Dispose the notebook's kernel session (tab closed). */
  dispose(sessionId: string, path: string): Promise<{ ok: true; value: { ok: boolean } } | { ok: false; error: JupyterError }> {
    return post<{ ok: boolean }>('/dsh-jupyter/dispose-session', { sessionId, path })
  }

  /** Read a plain UTF-8 file for the text editor. */
  readText(sessionId: string, path: string, signal?: AbortSignal): Promise<{ ok: true; value: TextFileView } | { ok: false; error: JupyterError }> {
    return post<TextFileView>('/dsh-jupyter/text-read', { sessionId, path }, signal)
  }

  /** Write a plain UTF-8 file with the filesystem version guard. */
  writeText(
    sessionId: string,
    path: string,
    text: string,
    baseVersion: string,
  ): Promise<{ ok: true; value: { version: string } } | { ok: false; error: JupyterError }> {
    return post<{ version: string }>('/dsh-jupyter/text-write', { sessionId, path, text, baseVersion })
  }

  /** URL for a file referenced beside the notebook (markdown images). */
  rawUrl(sessionId: string, path: string, suffix: string): string {
    return `/dsh-jupyter/raw?sessionId=${encodeURIComponent(sessionId)}&path=${encodeURIComponent(path)}${suffix}`
  }

  /**
   * Execute one cell, streaming output events.
   * @returns a promise resolving with the done event; rejects on transport failure.
   */
  async execute(
    sessionId: string,
    path: string,
    cellId: string,
    code: string,
    onOutput: (output: NbOutput) => void,
  ): Promise<{ executionCount: number | null; status: 'ok' | 'error' }> {
    let response: Response
    try {
      response = await fetch('/dsh-jupyter/execute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, path, cellId, code }),
      })
    } catch {
      throw new Error('jupyter route unavailable')
    }
    if (!response.ok || response.body === null) {
      throw new Error(`execute failed: HTTP ${response.status}`)
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let done: { executionCount: number | null; status: 'ok' | 'error' } | undefined
    let fatal: Error | undefined
    for (;;) {
      const { value, done: streamDone } = await reader.read()
      if (value !== undefined) buffer += decoder.decode(value, { stream: !streamDone })
      let index: number
      while ((index = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 1)
        if (line === '') continue
        let event: ExecuteEvent
        try {
          event = JSON.parse(line) as ExecuteEvent
        } catch {
          continue
        }
        if (event.kind === 'output') onOutput(event.output)
        else if (event.kind === 'done') done = { executionCount: event.executionCount, status: event.status }
        else if (event.kind === 'error') fatal = new Error(event.message)
      }
      if (streamDone) break
    }
    if (fatal !== undefined) throw fatal
    if (done === undefined) throw new Error('execute stream ended without a done event')
    return done
  }
}
