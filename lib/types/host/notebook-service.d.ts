/**
 * Notebook file service: read/write/list .ipynb files inside a gated project
 * root. Reads parse nbformat 4 and normalize cells (source joined to a
 * string, stable ids); writes serialize back with an mtime conflict check.
 * @module dsh-jupyter/host/notebook-service
 */
import type { NbCell, NotebookView, JupyterError } from '../core/types.ts';
import { type GateVerdict, type WorkspaceGate } from './gate.ts';
/** Parse and normalize a notebook JSON value into the panel's view. */
export declare function parseNotebook(value: unknown): {
    cells: NbCell[];
    metadata: Record<string, unknown>;
} | JupyterError;
/** Serialize the panel's view back to an nbformat 4 notebook value. */
export declare function serializeNotebook(view: Pick<NotebookView, 'cells' | 'metadata'>): unknown;
/**
 * Notebook file service: gated read/write/list of .ipynb files.
 * @param gate - the workspace gate.
 */
export declare class NotebookService {
    private readonly gate;
    constructor(gate: WorkspaceGate);
    /** Verify a root (used by the kernel layer before opening a session). */
    verify(root: string): Promise<GateVerdict>;
    /**
     * Read one workspace file's raw bytes (markdown image srcs in cells).
     * Gated and traversal-guarded; the bytes go out with the derived mime so
     * an <img> can load them.
     */
    readRaw(root: string, rel: string): Promise<{
        data: Buffer;
        mime: string;
        size: number;
    } | JupyterError>;
    /** Read and parse one notebook file. */
    read(root: string, rel: string): Promise<NotebookView | JupyterError>;
    /** Write the notebook back, refusing when the file moved on disk. */
    write(root: string, rel: string, value: unknown, baseMtime?: number): Promise<{
        mtime: number;
    } | JupyterError>;
    /** Recursively list *.ipynb files under the root (pruned at noise dirs). */
    listNotebooks(root: string): Promise<{
        path: string;
        name: string;
    }[] | JupyterError>;
}
