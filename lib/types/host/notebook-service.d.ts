/**
 * Notebook file service: parse/serialize nbformat 4 notebooks and move their
 * bytes through the composed filesystem (`ctx.fs`), with the version guard
 * supplied by the backend. Workspace confinement comes from `scope.ts`.
 * @module dsh-jupyter/host/notebook-service
 */
import type { Context } from '@deepseek-ai/cordis';
import type { NbCell, NotebookView, JupyterError, TextFileView } from '../core/types.ts';
import { type NotebookScope } from './scope.ts';
/**
 * Parse and normalize a notebook JSON value into the panel's view.
 * @param value - the parsed notebook, or the panel's write payload.
 * @param requireFormat - require an explicit `nbformat: 4` (reads); write
 *   payloads carry only cells and metadata.
 */
export declare function parseNotebook(value: unknown, requireFormat?: boolean): {
    cells: NbCell[];
    metadata: Record<string, unknown>;
} | JupyterError;
/** Serialize the panel's view back to an nbformat 4 notebook value. */
export declare function serializeNotebook(view: Pick<NotebookView, 'cells' | 'metadata'>): unknown;
/**
 * Notebook file service over the Session workspace.
 * @param ctx - context carrying the filesystem service.
 */
export declare class NotebookService {
    private readonly ctx;
    constructor(ctx: Context);
    /** Resolve a notebook path and read its parsed view. */
    read(scope: NotebookScope, path: string): Promise<NotebookView | JupyterError>;
    /** Serialize the notebook and write it with the version guard. */
    write(scope: NotebookScope, path: string, value: unknown, baseVersion: string | undefined): Promise<{
        version: string;
    } | JupyterError>;
    /**
     * Replace a file with a fresh one-cell notebook. Used when a `.ipynb` is
     * not parseable and the user explicitly chooses to start over.
     */
    create(scope: NotebookScope, path: string, overwrite: boolean): Promise<NotebookView | JupyterError>;
    /** Read a plain UTF-8 file for the text editor. */
    readTextFile(scope: NotebookScope, path: string): Promise<TextFileView | JupyterError>;
    /** Write a plain UTF-8 file with the version guard and Session policy. */
    writeTextFile(scope: NotebookScope, path: string, text: string, baseVersion: string | undefined): Promise<{
        version: string;
    } | JupyterError>;
    /** Read raw bytes beside the notebook (markdown images). */
    readRaw(scope: NotebookScope, path: string): Promise<{
        data: Uint8Array;
        mime: string;
    } | JupyterError>;
}
