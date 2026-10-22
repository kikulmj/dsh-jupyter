/**
 * /dsh-jupyter/* route layer: JSON envelope (ok/error with stable codes) for
 * notebook read/write and kernel control, a raw GET for images referenced by
 * markdown cells, and an NDJSON stream for cell execution.
 * @module dsh-jupyter/host/routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { ExecuteEvent, JupyterEnvelope, JupyterError } from '../core/types.ts'
import type { NotebookService } from './notebook-service.ts'
import type { KernelSessionManager } from './kernel.ts'
import { resolveScope, type NotebookScope } from './scope.ts'

const OK = (value: unknown): JupyterEnvelope<unknown> => ({ ok: true, value })
const FAIL = (error: JupyterError): JupyterEnvelope<never> => ({ ok: false, error })

/** Structural request failure. */
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

/** Optional string field. */
function optionalStr(payload: unknown, key: string): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** Write one JSON envelope response. */
function json(res: ServerResponse, envelope: JupyterEnvelope<unknown>, status = 200): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(envelope))
}

/** Write one NDJSON event line. */
function ndjson(res: ServerResponse, event: ExecuteEvent): void {
  if (res.writableEnded) return
  res.write(JSON.stringify(event) + '\n')
}

/** Resolve the Session scope for a request payload, or answer and return undefined. */
async function scopeOf(ctx: Context, res: ServerResponse, sessionId: string | null): Promise<NotebookScope | undefined> {
  if (sessionId === null) {
    json(res, FAIL(BAD_REQUEST))
    return undefined
  }
  const scope = await resolveScope(ctx, sessionId)
  if (!scope.ok) {
    json(res, FAIL(scope.error))
    return undefined
  }
  return scope.scope
}

/**
 * Register the /dsh-jupyter routes.
 * @param ctx - context carrying webServer, fs, and sessions.
 * @param notebooks - the notebook file service.
 * @param kernels - the kernel session registry.
 * @returns the route disposer.
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
        const scope = await scopeOf(ctx, res, url.searchParams.get('sessionId'))
        if (scope === undefined) return
        const path = url.searchParams.get('path')
        if (path === null || path === '') {
          json(res, FAIL(BAD_REQUEST), 400)
          return
        }
        const result = await notebooks.readRaw(scope, path)
        if (!('data' in result)) {
          json(res, FAIL(result), result.code === 'path-outside-root' ? 403 : 404)
          return
        }
        res.writeHead(200, {
          'content-type': result.mime,
          'content-length': result.data.byteLength,
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
    const sessionId = strField(payload, 'sessionId')
    const scope = await scopeOf(ctx, res, sessionId)
    if (scope === undefined) return
    const path = strField(payload, 'path')
    if (path === null) {
      json(res, FAIL(BAD_REQUEST))
      return
    }

    switch (pathname) {
      case '/dsh-jupyter/read': {
        const result = await notebooks.read(scope, path)
        json(res, 'cells' in result ? OK(result) : FAIL(result))
        return
      }
      case '/dsh-jupyter/create': {
        const overwrite = (payload as Record<string, unknown>).overwrite === true
        const result = await notebooks.create(scope, path, overwrite)
        json(res, 'cells' in result ? OK(result) : FAIL(result))
        return
      }
      case '/dsh-jupyter/write': {
        const rawNotebook = (payload as Record<string, unknown>).notebook
        if (rawNotebook === undefined) {
          json(res, FAIL(BAD_REQUEST))
          return
        }
        const result = await notebooks.write(scope, path, rawNotebook, optionalStr(payload, 'baseVersion'))
        json(res, 'version' in result ? OK(result) : FAIL(result))
        return
      }
      case '/dsh-jupyter/execute': {
        const code = strField(payload, 'code')
        const cellId = strField(payload, 'cellId')
        if (code === null || cellId === null) {
          json(res, FAIL(BAD_REQUEST))
          return
        }
        res.writeHead(200, {
          'content-type': 'application/x-ndjson; charset=utf-8',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        })
        const session = kernels.session(scope, path)
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
      case '/dsh-jupyter/text-read': {
        const result = await notebooks.readTextFile(scope, path)
        json(res, 'text' in result ? OK(result) : FAIL(result))
        return
      }
      case '/dsh-jupyter/text-write': {
        const text = (payload as Record<string, unknown>).text
        if (typeof text !== 'string') {
          json(res, FAIL(BAD_REQUEST))
          return
        }
        const result = await notebooks.writeTextFile(scope, path, text, optionalStr(payload, 'baseVersion'))
        json(res, 'version' in result ? OK(result) : FAIL(result))
        return
      }
      case '/dsh-jupyter/interrupt': {
        kernels.existingSession(scope, path)?.interrupt()
        json(res, OK({ ok: true }))
        return
      }
      case '/dsh-jupyter/restart': {
        kernels.existingSession(scope, path)?.restart()
        json(res, OK({ ok: true }))
        return
      }
      case '/dsh-jupyter/dispose-session': {
        kernels.disposeSession(scope, path)
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
