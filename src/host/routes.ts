/**
 * /dsh-jupyter/* route layer: JSON envelope (ok/error with stable codes) for
 * notebook read/write/list and kernel control, plus an NDJSON stream for cell
 * execution (output events stream while the cell runs, a done event finishes
 * it). Loopback-only + JSON content-type fences, mirroring the aionui-panel
 * route hardening.
 * @module dsh-jupyter/host/routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { ExecuteEvent, JupyterEnvelope, JupyterError } from '../core/types.ts'
import type { NotebookService } from './notebook-service.ts'
import type { KernelSessionManager } from './kernel.ts'

const OK = (value: unknown): JupyterEnvelope<unknown> => ({ ok: true, value })
const FAIL = (error: JupyterError): JupyterEnvelope<never> => ({ ok: false, error })

/** Structural request failure (never a workspace fault). */
const BAD_REQUEST: JupyterError = { code: 'internal', message: 'malformed request' }

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
    if (total > 8 << 20) return null
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text === '') return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

/** Extract the required string field from a JSON object payload. */
function strField(payload: unknown, key: string): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'string' && value !== '' ? value : null
}

/** Write one JSON envelope response. */
function json(res: ServerResponse, envelope: JupyterEnvelope<unknown>, status = 200): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(envelope))
}

/** Write one NDJSON event line. */
function ndjson(res: ServerResponse, event: ExecuteEvent): void {
  res.write(JSON.stringify(event) + '\n')
}

/** Extract the kernel name from a notebook's kernelspec metadata (default python3). */
export function kernelNameOf(metadata: Record<string, unknown>): string {
  const spec = metadata.kernelspec
  if (typeof spec === 'object' && spec !== null) {
    const name = (spec as Record<string, unknown>).name
    if (typeof name === 'string' && name !== '') return name
  }
  const language = metadata.language_info
  if (typeof language === 'object' && language !== null) {
    const name = (language as Record<string, unknown>).name
    if (typeof name === 'string' && name.toLowerCase() === 'javascript') return 'node'
  }
  return 'python3'
}

/**
 * Register the /dsh-jupyter routes.
 * @param ctx - context carrying the webServer service.
 * @param notebooks - the gated notebook file service.
 * @param kernels - the kernel session registry.
 * @returns the route disposers.
 */
export function registerJupyterRoutes(ctx: Context, notebooks: NotebookService, kernels: KernelSessionManager): () => void {
  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (!isLoopbackRequest(req)) {
      forbidden(res)
      return
    }
    if (req.method === 'GET') {
      const url = new URL(req.url ?? '/', 'http://x')
      if (url.pathname === '/dsh-jupyter/raw') {
        const root = url.searchParams.get('root')
        const path = url.searchParams.get('path')
        if (root === null || root === '' || path === null || path === '') {
          json(res, FAIL(BAD_REQUEST), 400)
          return
        }
        const result = await notebooks.readRaw(root, path)
        if (!('data' in result)) {
          json(res, FAIL(result), result.code === 'path-outside-root' ? 403 : 404)
          return
        }
        res.writeHead(200, {
          'content-type': result.mime,
          'content-length': result.size,
          'cache-control': 'no-cache',
          'x-content-type-options': 'nosniff',
        })
        res.end(result.data)
        return
      }
      res.writeHead(405)
      res.end()
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end()
      return
    }
    const contentType = req.headers['content-type'] ?? ''
    if (!contentType.toLowerCase().startsWith('application/json')) {
      json(res, FAIL(BAD_REQUEST), 415)
      return
    }
    const pathname = new URL(req.url ?? '/', 'http://x').pathname
    const payload = await readJsonBody(req)
    if (payload === null) {
      json(res, FAIL(BAD_REQUEST))
      return
    }
    const root = strField(payload, 'root')
    if (root === null) {
      json(res, FAIL(BAD_REQUEST))
      return
    }

    switch (pathname) {
      case '/dsh-jupyter/read': {
        const path = strField(payload, 'path')
        if (path === null) {
          json(res, FAIL(BAD_REQUEST))
          return
        }
        const result = await notebooks.read(root, path)
        json(res, 'path' in result ? OK(result) : FAIL(result))
        return
      }
      case '/dsh-jupyter/write': {
        const path = strField(payload, 'path')
        const rawNotebook = typeof payload === 'object' && payload !== null
          ? (payload as Record<string, unknown>).notebook
          : undefined
        if (path === null || rawNotebook === undefined) {
          json(res, FAIL(BAD_REQUEST))
          return
        }
        const rawBase = typeof payload === 'object' && payload !== null
          ? (payload as Record<string, unknown>).baseMtime
          : undefined
        const baseMtime = typeof rawBase === 'number' && Number.isFinite(rawBase) ? rawBase : undefined
        const result = await notebooks.write(root, path, rawNotebook, baseMtime)
        json(res, 'mtime' in result ? OK(result) : FAIL(result))
        return
      }
      case '/dsh-jupyter/list': {
        const result = await notebooks.listNotebooks(root)
        json(res, Array.isArray(result) ? OK(result) : FAIL(result))
        return
      }
      case '/dsh-jupyter/execute': {
        const path = strField(payload, 'path')
        const code = strField(payload, 'code')
        const cellId = strField(payload, 'cellId')
        if (path === null || code === null || cellId === null) {
          json(res, FAIL(BAD_REQUEST))
          return
        }
        // Verify the root before opening any kernel.
        const gated = await notebooks.verify(root)
        if (!gated.ok) {
          json(res, FAIL(gated.error))
          return
        }
        res.writeHead(200, {
          'content-type': 'application/x-ndjson; charset=utf-8',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        })
        const session = await kernels.session(root, path)
        try {
          const result = await session.execute(code, (output) => {
            ndjson(res, { kind: 'output', cellId, output })
          })
          ndjson(res, { kind: 'done', cellId, executionCount: result.executionCount, status: result.status })
        } catch (error) {
          ndjson(res, { kind: 'error', message: error instanceof Error ? error.message : String(error) })
        }
        res.end()
        return
      }
      case '/dsh-jupyter/interrupt': {
        const path = strField(payload, 'path')
        if (path === null) {
          json(res, FAIL(BAD_REQUEST))
          return
        }
        kernels.existingSession(root, path)?.interrupt()
        json(res, OK({ ok: true }))
        return
      }
      case '/dsh-jupyter/restart': {
        const path = strField(payload, 'path')
        if (path === null) {
          json(res, FAIL(BAD_REQUEST))
          return
        }
        kernels.existingSession(root, path)?.restart()
        json(res, OK({ ok: true }))
        return
      }
      case '/dsh-jupyter/dispose-session': {
        const path = strField(payload, 'path')
        if (path === null) {
          json(res, FAIL(BAD_REQUEST))
          return
        }
        kernels.disposeSession(root, path)
        json(res, OK({ ok: true }))
        return
      }
      default:
        res.writeHead(404)
        res.end()
    }
  }

  return ctx.webServer.register({ kind: 'prefix', path: '/dsh-jupyter', handler })
}
