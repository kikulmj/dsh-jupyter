/**
 * Shared wire types for the dsh-jupyter plugin (host <-> browser).
 * @module dsh-jupyter/core/types
 */

/** One notebook cell in the panel's normalized view (nbformat 4 shape). */
export interface NbCell {
  id: string
  cell_type: 'code' | 'markdown' | 'raw'
  source: string
  execution_count: number | null
  outputs: NbOutput[]
  metadata: Record<string, unknown>
  /** The notebook's workspace-relative path (markdown image base). */
  path: string
}

/** A notebook output in nbformat 4 shape (subset the renderer understands). */
export type NbOutput =
  | { output_type: 'stream'; name: string; text: string }
  | { output_type: 'execute_result' | 'display_data'; execution_count: number | null; data: Record<string, unknown>; metadata: Record<string, unknown> }
  | { output_type: 'error'; ename: string; evalue: string; traceback: string[] }

/** The panel's view of a loaded notebook. */
export interface NotebookView {
  /** Workspace-relative path of the notebook file. */
  path: string
  /** Parsed cells (normalized: source joined to a string). */
  cells: NbCell[]
  /** Notebook-level metadata (kernelspec etc.), kept as-is on save. */
  metadata: Record<string, unknown>
  /** File mtime at load, for the save conflict check. */
  mtime: number
}

/** One JSON envelope over the /dsh-jupyter routes. */
export type JupyterEnvelope<T> = { ok: true; value: T } | { ok: false; error: JupyterError }

/** Stable error codes for the wire (mirrors aionui-panel's panel errors). */
export interface JupyterError {
  code: 'workspace-unknown' | 'path-outside-root' | 'not-found' | 'not-notebook'
    | 'write-conflict' | 'write-failed' | 'kernel-unavailable' | 'kernel-busy' | 'internal'
  message: string
}

/** Streaming execute event (one per NDJSON line). */
export type ExecuteEvent =
  | { kind: 'output'; cellId: string; output: NbOutput }
  | { kind: 'done'; cellId: string; executionCount: number | null; status: 'ok' | 'error' }
  | { kind: 'error'; message: string }
