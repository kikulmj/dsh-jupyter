/**
 * Notebook file service: parse/serialize nbformat 4 notebooks and move their
 * bytes through the composed filesystem (`ctx.fs`), with the version guard
 * supplied by the backend. Workspace confinement comes from `scope.ts`.
 * @module dsh-jupyter/host/notebook-service
 */

import type { Context } from '@deepseek-ai/cordis'
import type { FsTarget, FsVersion } from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-fs'
import type { NbCell, NbOutput, NotebookView, JupyterError, TextFileView } from '../core/types.ts'
import { resolveFile, type NotebookScope } from './scope.ts'

/** Notebook size cap (parse budget for the panel). */
const NOTEBOOK_CAP_BYTES = 32 << 20

/** Cap on an image or related file served beside the notebook. */
const RAW_CAP_BYTES = 32 << 20

/** Cap on a plain text file opened in the editor. */
const TEXT_CAP_BYTES = 8 << 20

/** An empty nbformat 4 view with one ready-to-type code cell. */
function emptyNotebook(path: string, version: string): NotebookView {
  return {
    path,
    cells: [{
      id: 'cell-0',
      cell_type: 'code',
      source: '',
      execution_count: null,
      outputs: [],
      metadata: {},
      path,
    }],
    metadata: {
      kernelspec: { name: 'python3', display_name: 'Python 3', language: 'python' },
      language_info: { name: 'python' },
    },
    version,
  }
}

/** Derive a mime type from a file extension. */
function mimeOf(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const byExt: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon', avif: 'image/avif',
    bmp: 'image/bmp', pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown',
    csv: 'text/csv', json: 'application/json', html: 'text/html',
  }
  return byExt[ext] ?? 'application/octet-stream'
}

/** Join a cell source that may be a string or an array of lines. */
function sourceToString(source: unknown): string {
  if (typeof source === 'string') return source
  if (Array.isArray(source)) return source.map((line) => (typeof line === 'string' ? line : '')).join('')
  return ''
}

/**
 * Parse and normalize a notebook JSON value into the panel's view.
 * @param value - the parsed notebook, or the panel's write payload.
 * @param requireFormat - require an explicit `nbformat: 4` (reads); write
 *   payloads carry only cells and metadata.
 */
export function parseNotebook(
  value: unknown,
  requireFormat = true,
): { cells: NbCell[]; metadata: Record<string, unknown> } | JupyterError {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { code: 'not-notebook', message: 'notebook must be a JSON object' }
  }
  const nb = value as Record<string, unknown>
  if (nb.nbformat !== undefined && nb.nbformat !== 4) {
    return { code: 'not-notebook', message: 'only nbformat 4 notebooks are supported' }
  }
  if (requireFormat && nb.nbformat === undefined) {
    return { code: 'not-notebook', message: 'notebook is missing nbformat 4' }
  }
  const rawCells = Array.isArray(nb.cells) ? nb.cells : []
  const cells: NbCell[] = []
  for (const raw of rawCells) {
    if (typeof raw !== 'object' || raw === null) continue
    const cell = raw as Record<string, unknown>
    const cellType = cell.cell_type
    if (cellType !== 'code' && cellType !== 'markdown' && cellType !== 'raw') continue
    const id = typeof cell.id === 'string' && cell.id !== '' ? cell.id : `cell-${cells.length}-${Date.now().toString(36)}`
    const outputs: NbOutput[] = []
    if (Array.isArray(cell.outputs)) {
      for (const out of cell.outputs) {
        if (typeof out !== 'object' || out === null) continue
        const parsed = parseOutput(out as Record<string, unknown>)
        if (parsed !== null) outputs.push(parsed)
      }
    }
    cells.push({
      id,
      cell_type: cellType,
      source: sourceToString(cell.source),
      execution_count: typeof cell.execution_count === 'number' ? cell.execution_count : null,
      outputs,
      metadata: typeof cell.metadata === 'object' && cell.metadata !== null && !Array.isArray(cell.metadata)
        ? cell.metadata as Record<string, unknown>
        : {},
      path: '',
    })
  }
  const metadata = typeof nb.metadata === 'object' && nb.metadata !== null && !Array.isArray(nb.metadata)
    ? nb.metadata as Record<string, unknown>
    : {}
  return { cells, metadata }
}

/** Parse one raw output object into the typed union (null when unknown). */
function parseOutput(raw: Record<string, unknown>): NbOutput | null {
  const type = raw.output_type
  if (type === 'stream') {
    return {
      output_type: 'stream',
      name: typeof raw.name === 'string' ? raw.name : 'stdout',
      text: typeof raw.text === 'string' ? raw.text : String(raw.text ?? ''),
    }
  }
  if (type === 'execute_result' || type === 'display_data') {
    return {
      output_type: type,
      execution_count: typeof raw.execution_count === 'number' ? raw.execution_count : null,
      data: typeof raw.data === 'object' && raw.data !== null ? raw.data as Record<string, unknown> : {},
      metadata: typeof raw.metadata === 'object' && raw.metadata !== null ? raw.metadata as Record<string, unknown> : {},
    }
  }
  if (type === 'error') {
    return {
      output_type: 'error',
      ename: typeof raw.ename === 'string' ? raw.ename : 'Error',
      evalue: typeof raw.evalue === 'string' ? raw.evalue : '',
      traceback: Array.isArray(raw.traceback) ? raw.traceback.filter((l): l is string => typeof l === 'string') : [],
    }
  }
  return null
}

/** Serialize the panel's view back to an nbformat 4 notebook value. */
export function serializeNotebook(view: Pick<NotebookView, 'cells' | 'metadata'>): unknown {
  const cells = view.cells.map((cell) => ({
    id: cell.id,
    cell_type: cell.cell_type,
    source: cell.source,
    execution_count: cell.cell_type === 'code' ? cell.execution_count : null,
    outputs: cell.cell_type === 'code' ? cell.outputs : [],
    metadata: cell.metadata,
  }))
  return {
    cells,
    metadata: view.metadata,
    nbformat: 4,
    nbformat_minor: 5,
  }
}

/** Stable fs error code, when the thrown value is an FsError. */
function fsCodeOf(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined
}

/** Map a filesystem failure onto the route vocabulary. */
function fsFailure(error: unknown, fallback: JupyterError): JupyterError {
  const code = fsCodeOf(error)
  if (code === 'FS_NOT_FOUND' || code === 'FS_NOT_REGULAR_FILE' || code === 'FS_NOT_DIRECTORY') {
    return { code: 'not-found', message: fallback.message }
  }
  if (code === 'FS_STALE_VERSION') return { code: 'write-conflict', message: 'file changed on disk since it was loaded' }
  if (code === 'FS_TOO_LARGE') return { code: 'not-notebook', message: 'file exceeds the size cap' }
  if (code === 'FS_NOT_TEXT') return { code: 'not-text', message: 'file is not UTF-8 text' }
  if (code === 'FS_SANDBOX_DENIED') {
    return { code: 'write-failed', message: `${fallback.message}: denied by the session sandbox policy` }
  }
  if (code === 'FS_PERMISSION_DENIED') {
    return { code: 'write-failed', message: `${fallback.message}: permission denied` }
  }
  return fallback
}

/**
 * Notebook file service over the Session workspace.
 * @param ctx - context carrying the filesystem service.
 */
export class NotebookService {
  constructor(private readonly ctx: Context) {}

  /** Resolve a notebook path and read its parsed view. */
  async read(scope: NotebookScope, path: string): Promise<NotebookView | JupyterError> {
    const resolved = await resolveFile(this.ctx, scope, path)
    if (!resolved.ok) return resolved.error
    try {
      const info = await this.ctx.fs.stat(resolved.target)
      if (info === undefined || info.type !== 'file') return { code: 'not-found', message: `not a file: ${path}` }
      if (info.size !== undefined && info.size > NOTEBOOK_CAP_BYTES) {
        return { code: 'not-notebook', message: 'notebook exceeds read cap' }
      }
      const raw = await this.ctx.fs.readText(resolved.target)
      // A UTF-8 BOM survives some editors; JSON.parse rejects it.
      const text = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw
      // An empty/whitespace file is a new notebook, not a parse failure.
      if (text.trim() === '') return emptyNotebook(path, String(info.version))
      let parsed: unknown
      try {
        parsed = JSON.parse(text) as unknown
      } catch {
        return { code: 'not-notebook', message: `${path} is not valid JSON` }
      }
      const result = parseNotebook(parsed)
      if ('code' in result) return result
      return {
        path,
        cells: result.cells.map((cell) => ({ ...cell, path })),
        metadata: result.metadata,
        version: String(info.version),
      }
    } catch (error) {
      return fsFailure(error, { code: 'not-found', message: `cannot read ${path}` })
    }
  }

  /** Serialize the notebook and write it with the version guard. */
  async write(
    scope: NotebookScope,
    path: string,
    value: unknown,
    baseVersion: string | undefined,
  ): Promise<{ version: string } | JupyterError> {
    const resolved = await resolveFile(this.ctx, scope, path)
    if (!resolved.ok) return resolved.error
    const parsed = parseNotebook(value, false)
    if ('code' in parsed) return parsed
    const payload = serializeNotebook({ cells: parsed.cells, metadata: parsed.metadata })
    const text = JSON.stringify(payload, null, 1) + '\n'
    try {
      const outcome = await this.ctx.fs.writeText(
        resolved.target,
        text,
        baseVersion === undefined || baseVersion === ''
          ? undefined
          : { kind: 'replaceIfVersion', version: baseVersion as FsVersion },
        undefined,
        scope.policy,
      )
      return { version: String(outcome.version) }
    } catch (error) {
      return fsFailure(error, { code: 'write-failed', message: `cannot write ${path}` })
    }
  }

  /**
   * Replace a file with a fresh one-cell notebook. Used when a `.ipynb` is
   * not parseable and the user explicitly chooses to start over.
   */
  async create(scope: NotebookScope, path: string, overwrite: boolean): Promise<NotebookView | JupyterError> {
    const resolved = await resolveFile(this.ctx, scope, path)
    if (!resolved.ok) return resolved.error
    const view = emptyNotebook(path, '')
    const payload = serializeNotebook({ cells: view.cells, metadata: view.metadata })
    const text = JSON.stringify(payload, null, 1) + '\n'
    try {
      const outcome = await this.ctx.fs.writeText(
        resolved.target,
        text,
        overwrite ? undefined : { kind: 'createIfAbsent' },
        undefined,
        scope.policy,
      )
      return { ...view, version: String(outcome.version) }
    } catch (error) {
      return fsFailure(error, { code: 'write-failed', message: `cannot create ${path}` })
    }
  }

  /** Read a plain UTF-8 file for the text editor. */
  async readTextFile(scope: NotebookScope, path: string): Promise<TextFileView | JupyterError> {
    const resolved = await resolveFile(this.ctx, scope, path)
    if (!resolved.ok) return resolved.error
    try {
      const info = await this.ctx.fs.stat(resolved.target)
      if (info === undefined || info.type !== 'file') return { code: 'not-found', message: `not a file: ${path}` }
      if (info.size !== undefined && info.size > TEXT_CAP_BYTES) {
        return { code: 'not-text', message: 'file exceeds the text editor size cap' }
      }
      const raw = await this.ctx.fs.readText(resolved.target)
      const text = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw
      return { path, text, version: String(info.version) }
    } catch (error) {
      return fsFailure(error, { code: 'not-found', message: `cannot read ${path}` })
    }
  }

  /** Write a plain UTF-8 file with the version guard and Session policy. */
  async writeTextFile(
    scope: NotebookScope,
    path: string,
    text: string,
    baseVersion: string | undefined,
  ): Promise<{ version: string } | JupyterError> {
    if (text.length > TEXT_CAP_BYTES) return { code: 'not-text', message: 'file exceeds the text editor size cap' }
    const resolved = await resolveFile(this.ctx, scope, path)
    if (!resolved.ok) return resolved.error
    try {
      const outcome = await this.ctx.fs.writeText(
        resolved.target,
        text,
        baseVersion === undefined || baseVersion === ''
          ? undefined
          : { kind: 'replaceIfVersion', version: baseVersion as FsVersion },
        undefined,
        scope.policy,
      )
      return { version: String(outcome.version) }
    } catch (error) {
      return fsFailure(error, { code: 'write-failed', message: `cannot write ${path}` })
    }
  }

  /** Read raw bytes beside the notebook (markdown images). */
  async readRaw(scope: NotebookScope, path: string): Promise<{ data: Uint8Array; mime: string } | JupyterError> {
    const resolved = await resolveFile(this.ctx, scope, path)
    if (!resolved.ok) return resolved.error
    try {
      const info = await this.ctx.fs.stat(resolved.target)
      if (info === undefined || info.type !== 'file') return { code: 'not-found', message: `not a file: ${path}` }
      if (info.size !== undefined && info.size > RAW_CAP_BYTES) {
        return { code: 'not-found', message: 'file exceeds the size cap' }
      }
      const data = await this.ctx.fs.readBytes(resolved.target, undefined, RAW_CAP_BYTES)
      return { data, mime: mimeOf(path) }
    } catch (error) {
      return fsFailure(error, { code: 'not-found', message: `cannot read ${path}` })
    }
  }
}
