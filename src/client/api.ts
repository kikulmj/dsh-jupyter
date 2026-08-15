/**
 * Browser API client for the /dsh-jupyter routes. All calls POST JSON and
 * decode the shared envelope; execute streams NDJSON lines through a reader.
 * @module dsh-jupyter/client/api
 */

import type { ExecuteEvent, JupyterError, NotebookView, NbCell, NbOutput } from '../core/types.ts'

/** Transport failure (fetch threw or the response was not readable). */
const TRANSPORT_ERROR: JupyterError = { code: 'internal', message: 'jupyter route unavailable' }

/** POST one JSON payload and decode the envelope; never throws. */
async function post<T>(path: string, payload: unknown): Promise<{ ok: true; value: T } | { ok: false; error: JupyterError }> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
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

/** One notebook listing row. */
export interface NotebookRow {
  path: string
  name: string
}

/** The typed API surface the panel drives. */
export class JupyterApi {
  /** Read and parse a notebook file. */
  read(root: string, path: string): Promise<{ ok: true; value: NotebookView } | { ok: false; error: JupyterError }> {
    return post<NotebookView>('/dsh-jupyter/read', { root, path })
  }

  /** Write the notebook back (with the mtime conflict check). */
  write(
    root: string,
    path: string,
    notebook: { cells: NbCell[]; metadata: Record<string, unknown> },
    baseMtime: number,
  ): Promise<{ ok: true; value: { mtime: number } } | { ok: false; error: JupyterError }> {
    return post<{ mtime: number }>('/dsh-jupyter/write', { root, path, notebook, baseMtime })
  }

  /** List *.ipynb files under the root. */
  list(root: string): Promise<{ ok: true; value: NotebookRow[] } | { ok: false; error: JupyterError }> {
    return post<NotebookRow[]>('/dsh-jupyter/list', { root })
  }

  /** Interrupt the running cell (no-op when idle). */
  interrupt(root: string, path: string): Promise<{ ok: true; value: { ok: boolean } } | { ok: false; error: JupyterError }> {
    return post<{ ok: boolean }>('/dsh-jupyter/interrupt', { root, path })
  }

  /** Restart the kernel (fresh state). */
  restart(root: string, path: string): Promise<{ ok: true; value: { ok: boolean } } | { ok: false; error: JupyterError }> {
    return post<{ ok: boolean }>('/dsh-jupyter/restart', { root, path })
  }

  /**
   * Execute one cell, streaming output events.
   * @returns a promise resolving with the done event; rejects on transport failure.
   */
  async execute(
    root: string,
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
        body: JSON.stringify({ root, path, cellId, code }),
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
