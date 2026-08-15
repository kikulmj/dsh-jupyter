/**
 * Browser API client for the /dsh-terminal routes. Mutating calls POST JSON
 * and decode the shared envelope; the output stream is an NDJSON ReadableStream
 * (one event per line) cancelled through an AbortController.
 * @module dsh-jupyter/client/terminal/api
 */

import type { TerminalEnvelope, TerminalError, TerminalEvent, TerminalSessionCreated } from '../../core/terminal-types.ts'

/** Transport failure (fetch threw or the response was not readable). */
const TRANSPORT_ERROR: TerminalError = { code: 'internal', message: 'terminal route unavailable' }

/** POST one JSON payload and decode the envelope; never throws. */
async function post<T>(path: string, payload: unknown): Promise<{ ok: true; value: T } | { ok: false; error: TerminalError }> {
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
    const envelope = await response.json() as { ok?: boolean; value?: T; error?: TerminalError }
    if (envelope.ok === true) return { ok: true, value: envelope.value as T }
    return { ok: false, error: envelope.error ?? TRANSPORT_ERROR }
  } catch {
    return { ok: false, error: TRANSPORT_ERROR }
  }
}

/** A handle to one live output stream (cancel() aborts the fetch). */
export interface TerminalStream {
  /** Whether the underlying fetch is still reading. */
  readonly active: boolean
  /** Abort the stream and stop reading. */
  cancel(): void
}

/** The typed API surface the dock drives. */
export class TerminalApi {
  /** Create a new PTY session at the given cwd (empty string = host default). */
  create(cwd: string, cols: number, rows: number): Promise<{ ok: true; value: TerminalSessionCreated } | { ok: false; error: TerminalError }> {
    return post<TerminalSessionCreated>('/dsh-terminal/create', { cwd, cols, rows })
  }

  /** Write input (keystrokes) to the session's PTY. */
  input(id: string, data: string): Promise<{ ok: true; value: { ok: boolean } } | { ok: false; error: TerminalError }> {
    return post<{ ok: boolean }>('/dsh-terminal/input', { id, data })
  }

  /** Resize the PTY (propagate new cols/rows). */
  resize(id: string, cols: number, rows: number): Promise<{ ok: true; value: { ok: boolean } } | { ok: false; error: TerminalError }> {
    return post<{ ok: boolean }>('/dsh-terminal/resize', { id, cols, rows })
  }

  /** Kill the PTY and dispose the session. */
  kill(id: string): Promise<{ ok: true; value: { ok: boolean; disposed: boolean } } | { ok: false; error: TerminalError }> {
    return post<{ ok: boolean; disposed: boolean }>('/dsh-terminal/kill', { id })
  }

  /** Clear the host scrollback buffer (input/history in the shell is untouched). */
  clear(id: string): Promise<{ ok: true; value: { ok: boolean } } | { ok: false; error: TerminalError }> {
    return post<{ ok: boolean }>('/dsh-terminal/clear', { id })
  }

  /**
   * Open the NDJSON output stream and pump events to the callback until the
   * shell exits or cancel() is called.
   * @param id - session id.
   * @param onEvent - one event per NDJSON line.
   * @returns a stream handle (call cancel() to abort).
   */
  async stream(id: string, onEvent: (event: TerminalEvent) => void): Promise<TerminalStream> {
    const controller = new AbortController()
    let active = true
    const read = async (): Promise<void> => {
      let response: Response
      try {
        response = await fetch(`/dsh-terminal/stream?id=${encodeURIComponent(id)}`, { signal: controller.signal })
      } catch {
        active = false
        return
      }
      if (!response.ok || response.body === null) {
        active = false
        return
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      try {
        for (;;) {
          const { value, done: streamDone } = await reader.read()
          if (value !== undefined) buffer += decoder.decode(value, { stream: !streamDone })
          let index: number
          while ((index = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, index)
            buffer = buffer.slice(index + 1)
            if (line === '') continue
            let event: TerminalEvent
            try {
              event = JSON.parse(line) as TerminalEvent
            } catch {
              continue
            }
            onEvent(event)
            if (event.kind === 'exited' || event.kind === 'error') {
              active = false
              return
            }
          }
          if (streamDone) break
        }
      } catch {
        // aborted or transport dropped; the panel treats this as a soft close
      }
      active = false
    }
    void read()
    return {
      get active() { return active },
      cancel() { controller.abort() },
    }
  }
}
