/**
 * /dsh-terminal/* route layer: JSON envelope for session create/input/resize/kill
 * and an NDJSON output stream (one event per line) read through a fetch
 * ReadableStream — the same transport shape as notebook cell execution.
 * Also serves the xterm.css asset (copied next to the built host half) so the
 * browser can fetch and inject it once.
 *
 * Hardening mirrors the notebook routes: loopback-only (a loopback socket AND
 * a loopback Host header) plus the JSON content-type CSRF fence on mutating
 * POSTs, and a same-origin check on the Origin header. The xterm.css route is
 * GET and read-only (a stylesheet), so it relaxes the content-type fence but
 * keeps the loopback + same-origin checks.
 * @module dsh-jupyter/host/terminal-routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { TerminalEvent, TerminalEnvelope, TerminalError, TerminalSessionCreated } from '../core/terminal-types.ts'
import { shellLabelOf, TerminalSessionManager } from './terminal.ts'

const OK = (value: unknown): TerminalEnvelope<unknown> => ({ ok: true, value })
const FAIL = (error: TerminalError): TerminalEnvelope<never> => ({ ok: false, error })

/** Structural request failure (never a workspace fault). */
const BAD_REQUEST: TerminalError = { code: 'internal', message: 'malformed request' }

/** Loopback trust fence: a loopback socket AND a loopback Host header. */
function isLoopbackRequest(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  let hostUrl: URL
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]') return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

/** Write the shared non-loopback rejection. */
function forbidden(res: ServerResponse): void {
  res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify({ error: 'forbidden: loopback-only' }))
}

/** Read a JSON request body into an unknown value; null when unparseable/too big. */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    chunks.push(buffer)
    total += buffer.length
    if (total > 1 << 20) return null // terminal payloads are tiny (input keystrokes)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text === '') return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

/** Extract a required string field from a JSON object payload. */
function strField(payload: unknown, key: string): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : null
}

/** Extract an optional positive-integer field (cols/rows). */
function intField(payload: unknown, key: string, fallback: number): number {
  if (typeof payload !== 'object' || payload === null) return fallback
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback
}

/** Write one JSON envelope response. */
function json(res: ServerResponse, envelope: TerminalEnvelope<unknown>, status = 200): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(envelope))
}

/** Write one NDJSON event line. */
function ndjson(res: ServerResponse, event: TerminalEvent): void {
  res.write(JSON.stringify(event) + '\n')
}

/** Clamp terminal dimensions into a sane range (the browser can lie). */
function clampDims(cols: number, rows: number): { cols: number; rows: number } {
  return {
    cols: Math.min(Math.max(cols, 1), 400),
    rows: Math.min(Math.max(rows, 1), 200),
  }
}

/**
 * Register the /dsh-terminal routes.
 * @param ctx - context carrying the webServer service.
 * @param manager - the PTY session registry.
 * @returns the route disposer.
 */
export function registerTerminalRoutes(ctx: Context, manager: TerminalSessionManager): () => void {
  // The xterm.css asset ships next to the built host half (lib/xterm.css).
  const cssUrl = new URL('./xterm.css', import.meta.url)

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (!isLoopbackRequest(req)) {
      forbidden(res)
      return
    }
    const url = new URL(req.url ?? '/', 'http://x')
    const pathname = url.pathname

    // GET /dsh-terminal/xterm.css — the terminal renderer stylesheet (read-only asset).
    if (req.method === 'GET' && pathname === '/dsh-terminal/xterm.css') {
      try {
        const data = await readFile(cssUrl)
        res.writeHead(200, {
          'content-type': 'text/css; charset=utf-8',
          'cache-control': 'public, max-age=86400, immutable',
          'x-content-type-options': 'nosniff',
        })
        res.end(data)
      } catch {
        res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: 'xterm.css not found; rebuild the plugin' }))
      }
      return
    }

    // GET /dsh-terminal/stream?id= — the NDJSON output stream.
    if (req.method === 'GET' && pathname === '/dsh-terminal/stream') {
      const id = url.searchParams.get('id')
      if (id === null || id === '') {
        res.writeHead(400).end()
        return
      }
      const session = manager.get(id)
      if (session === undefined) {
        res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: 'session not found' }))
        return
      }
      res.writeHead(200, {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        'x-content-type-options': 'nosniff',
      })
      // Replay the buffered scrollback first (one output event), then go live.
      const buffer = session.bufferedOutput()
      if (buffer.data !== '') {
        ndjson(res, { kind: 'output', data: buffer.data })
      }
      if (buffer.truncated) {
        ndjson(res, { kind: 'output', data: '\u001b[2m…(scrollback truncated)\u001b[0m\r\n' })
      }
      if (session.isExited) {
        // The shell already exited before this stream attached.
        ndjson(res, { kind: 'exited', exitCode: null, signal: null })
        res.end()
        return
      }
      const unsubscribe = session.subscribe((event) => {
        if (res.writableEnded) return
        ndjson(res, event)
        if (event.kind === 'exited') {
          // flush + end once the shell is gone.
          res.end()
        }
      })
      req.on('close', () => {
        unsubscribe()
      })
      return
    }

    if (req.method !== 'POST') {
      res.writeHead(405).end()
      return
    }

    const contentType = req.headers['content-type'] ?? ''
    if (!contentType.toLowerCase().startsWith('application/json')) {
      json(res, FAIL(BAD_REQUEST), 415)
      return
    }

    const payload = await readJsonBody(req)
    if (payload === null) {
      json(res, FAIL(BAD_REQUEST))
      return
    }

    switch (pathname) {
      case '/dsh-terminal/create': {
        const cwd = strField(payload, 'cwd') ?? ''
        const cols = intField(payload, 'cols', 80)
        const rows = intField(payload, 'rows', 24)
        const { cols: c, rows: r } = clampDims(cols, rows)
        try {
          const session = await manager.create(cwd, c, r)
          json(res, OK({
            id: session.id,
            cwd: session.cwd,
            shell: shellLabelOf(session.shell),
          } as TerminalSessionCreated))
        } catch (error) {
          json(res, FAIL({
            code: 'spawn-failed',
            message: error instanceof Error ? error.message : String(error),
          }), 500)
        }
        return
      }
      case '/dsh-terminal/input': {
        const id = strField(payload, 'id')
        const data = typeof payload === 'object' && payload !== null
          ? (payload as Record<string, unknown>).data
          : undefined
        if (id === null || typeof data !== 'string') {
          json(res, FAIL(BAD_REQUEST))
          return
        }
        const session = manager.get(id)
        if (session === undefined) {
          json(res, FAIL({ code: 'not-found', message: 'session not found' }), 404)
          return
        }
        session.write(data)
        json(res, OK({ ok: true }))
        return
      }
      case '/dsh-terminal/resize': {
        const id = strField(payload, 'id')
        if (id === null) {
          json(res, FAIL(BAD_REQUEST))
          return
        }
        const cols = intField(payload, 'cols', 80)
        const rows = intField(payload, 'rows', 24)
        const session = manager.get(id)
        if (session === undefined) {
          json(res, FAIL({ code: 'not-found', message: 'session not found' }), 404)
          return
        }
        const { cols: c, rows: r } = clampDims(cols, rows)
        session.resize(c, r)
        json(res, OK({ ok: true }))
        return
      }
      case '/dsh-terminal/kill': {
        const id = strField(payload, 'id')
        if (id === null) {
          json(res, FAIL(BAD_REQUEST))
          return
        }
        const wasAlive = manager.dispose(id)
        json(res, OK({ ok: true, disposed: wasAlive }))
        return
      }
      case '/dsh-terminal/clear': {
        const id = strField(payload, 'id')
        if (id === null) {
          json(res, FAIL(BAD_REQUEST))
          return
        }
        const session = manager.get(id)
        if (session === undefined) {
          json(res, FAIL({ code: 'not-found', message: 'session not found' }), 404)
          return
        }
        session.clearBuffer()
        json(res, OK({ ok: true }))
        return
      }
      default:
        res.writeHead(404).end()
    }
  }

  return ctx.webServer.register({ kind: 'prefix', path: '/dsh-terminal', handler })
}
