/**
 * Notebook file service: read/write/list .ipynb files inside a gated project
 * root. Reads parse nbformat 4 and normalize cells (source joined to a
 * string, stable ids); writes serialize back with an mtime conflict check.
 * @module dsh-jupyter/host/notebook-service
 */

import { readFile, readdir, realpath, stat, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import type { Dirent } from 'node:fs'
import type { NbCell, NbOutput, NotebookView, JupyterError } from '../core/types.ts'
import { isPathInside, type GateVerdict, type WorkspaceGate } from './gate.ts'

/** Notebook size cap (parse budget for the panel). */
const NOTEBOOK_CAP_BYTES = 32 << 20

/** Recursive listing caps for notebook discovery. */
const LIST_SCAN_CAP = 20_000
const LIST_HIT_CAP = 500
/** Directories skipped by the recursive notebook listing. */
const LIST_SKIP_DIRS = new Set(['.git', 'node_modules'])

/**
 * Resolve a workspace-relative path against the canonical root, refusing to
 * escape it (realpath check on the nearest existing ancestor, so a symlink
 * cannot smuggle the operation outside the root).
 */
async function resolveInsideRoot(root: string, rel: string): Promise<{ ok: true; abs: string } | { ok: false; error: JupyterError }> {
  if (rel.includes('\0')) return { ok: false, error: { code: 'path-outside-root', message: 'invalid path' } }
  const abs = join(root, rel)
  if (!isPathInside(root, abs)) {
    return { ok: false, error: { code: 'path-outside-root', message: `path escapes root: ${rel}` } }
  }
  let probe = abs
  for (let hop = 0; hop < 32; hop += 1) {
    let real: string
    try {
      real = await realpath(probe)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') return { ok: true, abs }
      const parent = dirname(probe)
      if (parent === probe) return { ok: true, abs }
      probe = parent
      continue
    }
    if (!isPathInside(root, real)) {
      return { ok: false, error: { code: 'path-outside-root', message: `path resolves outside root: ${rel}` } }
    }
    return { ok: true, abs }
  }
  return { ok: false, error: { code: 'path-outside-root', message: 'path cannot be resolved' } }
}

/** True when the relative path passes through a .git component. */
function isGitPath(rel: string): boolean {
  return rel.split('/').some((part) => part.toLowerCase() === '.git')
}

/** Derive a mime type from a file extension (image focus, like the panel). */
function mimeOf(rel: string): string {
  const ext = rel.split('.').pop()?.toLowerCase() ?? ''
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

/** Parse and normalize a notebook JSON value into the panel's view. */
export function parseNotebook(value: unknown): { cells: NbCell[]; metadata: Record<string, unknown> } | JupyterError {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { code: 'not-notebook', message: 'notebook must be a JSON object' }
  }
  const nb = value as Record<string, unknown>
  if (nb.nbformat !== 4) {
    return { code: 'not-notebook', message: 'only nbformat 4 notebooks are supported' }
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

/**
 * Notebook file service: gated read/write/list of .ipynb files.
 * @param gate - the workspace gate.
 */
export class NotebookService {
  constructor(private readonly gate: WorkspaceGate) {}

  /** Verify a root (used by the kernel layer before opening a session). */
  verify(root: string): Promise<GateVerdict> {
    return this.gate(root)
  }

  /**
   * Read one workspace file's raw bytes (markdown image srcs in cells).
   * Gated and traversal-guarded; the bytes go out with the derived mime so
   * an <img> can load them.
   */
  async readRaw(root: string, rel: string): Promise<{ data: Buffer; mime: string; size: number } | JupyterError> {
    const gated = await this.gate(root)
    if (!gated.ok) return gated.error
    if (isGitPath(rel)) return { code: 'path-outside-root', message: 'refusing to read .git' }
    const resolved = await resolveInsideRoot(gated.canonical, rel)
    if (!resolved.ok) return resolved.error
    let data: Buffer
    let info: Awaited<ReturnType<typeof stat>>
    try {
      info = await stat(resolved.abs)
    } catch {
      return { code: 'not-found', message: `cannot read ${rel}` }
    }
    if (info.isDirectory()) return { code: 'not-found', message: `${rel} is a directory` }
    try {
      data = await readFile(resolved.abs)
    } catch {
      return { code: 'not-found', message: `cannot read ${rel}` }
    }
    return { data, mime: mimeOf(rel), size: data.length }
  }

  /** Read and parse one notebook file. */
  async read(root: string, rel: string): Promise<NotebookView | JupyterError> {
    const gated = await this.gate(root)
    if (!gated.ok) return gated.error
    if (isGitPath(rel)) return { code: 'path-outside-root', message: 'refusing to read .git' }
    const resolved = await resolveInsideRoot(gated.canonical, rel)
    if (!resolved.ok) return resolved.error
    let data: Buffer
    let info: Awaited<ReturnType<typeof stat>>
    try {
      info = await stat(resolved.abs)
    } catch {
      return { code: 'not-found', message: `cannot stat ${rel}` }
    }
    if (info.isDirectory()) return { code: 'not-found', message: `${rel} is a directory` }
    if (info.size > NOTEBOOK_CAP_BYTES) return { code: 'not-notebook', message: 'notebook exceeds read cap' }
    try {
      data = await readFile(resolved.abs)
    } catch {
      return { code: 'not-found', message: `cannot read ${rel}` }
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(data.toString('utf8')) as unknown
    } catch {
      return { code: 'not-notebook', message: `${rel} is not valid JSON` }
    }
    const result = parseNotebook(parsed)
    if ('code' in result) return result
    return {
      path: rel,
      cells: result.cells.map((cell) => ({ ...cell, path: rel })),
      metadata: result.metadata,
      mtime: info.mtimeMs,
    }
  }

  /** Write the notebook back, refusing when the file moved on disk. */
  async write(
    root: string,
    rel: string,
    value: unknown,
    baseMtime?: number,
  ): Promise<{ mtime: number } | JupyterError> {
    const gated = await this.gate(root)
    if (!gated.ok) return gated.error
    if (isGitPath(rel)) return { code: 'path-outside-root', message: 'refusing to touch .git' }
    const resolved = await resolveInsideRoot(gated.canonical, rel)
    if (!resolved.ok) return resolved.error
    const parsed = parseNotebook(value)
    if ('code' in parsed) return parsed
    const payload = serializeNotebook({ cells: parsed.cells, metadata: parsed.metadata })
    try {
      let current: Awaited<ReturnType<typeof stat>>
      try {
        current = await stat(resolved.abs)
      } catch {
        current = { mtimeMs: 0 } as Awaited<ReturnType<typeof stat>>
      }
      if (baseMtime !== undefined && Number(current.mtimeMs) !== 0 && Math.abs(Number(current.mtimeMs) - baseMtime) > 1) {
        return { code: 'write-conflict', message: 'file changed on disk since it was loaded' }
      }
      await mkdir(dirname(resolved.abs), { recursive: true })
      await writeFile(resolved.abs, JSON.stringify(payload, null, 1) + '\n', 'utf8')
      const info = await stat(resolved.abs)
      return { mtime: info.mtimeMs }
    } catch {
      return { code: 'write-failed', message: `cannot write ${rel}` }
    }
  }

  /** Recursively list *.ipynb files under the root (pruned at noise dirs). */
  async listNotebooks(root: string): Promise<{ path: string; name: string }[] | JupyterError> {
    const gated = await this.gate(root)
    if (!gated.ok) return gated.error
    const hits: { path: string; name: string }[] = []
    let scanned = 0
    let truncated = false
    const walk = async (rel: string, depth: number): Promise<void> => {
      if (truncated) return
      const resolved = await resolveInsideRoot(gated.canonical, rel)
      if (!resolved.ok) return
      let dirents: Dirent[]
      try {
        dirents = await readdir(resolved.abs, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of dirents) {
        if (scanned >= LIST_SCAN_CAP) {
          truncated = true
          return
        }
        scanned += 1
        const entryName = entry.name
        const path = rel === '' ? entryName : `${rel}/${entryName}`
        if (entry.isDirectory()) {
          if (LIST_SKIP_DIRS.has(entryName)) continue
          if (depth < 24 && !truncated) await walk(path, depth + 1)
          continue
        }
        if (entryName.toLowerCase().endsWith('.ipynb')) {
          if (hits.length >= LIST_HIT_CAP) {
            truncated = true
            return
          }
          hits.push({ path, name: entryName })
        }
      }
    }
    try {
      await walk('', 0)
    } catch {
      return { code: 'internal', message: 'listing walk failed' }
    }
    hits.sort((a, b) => (a.path < b.path ? -1 : 1))
    return hits
  }
}
