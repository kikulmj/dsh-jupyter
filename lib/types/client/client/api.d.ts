/**
 * Browser API client for the /dsh-jupyter routes. All calls POST JSON and
 * decode the shared envelope; execute streams NDJSON lines through a reader.
 * @module dsh-jupyter/client/api
 */
import type { JupyterError, NotebookView, NbCell, NbOutput } from '../core/types.ts';
/** One notebook listing row. */
export interface NotebookRow {
    path: string;
    name: string;
}
/** The typed API surface the panel drives. */
export declare class JupyterApi {
    /** Read and parse a notebook file. */
    read(root: string, path: string): Promise<{
        ok: true;
        value: NotebookView;
    } | {
        ok: false;
        error: JupyterError;
    }>;
    /** Write the notebook back (with the mtime conflict check). */
    write(root: string, path: string, notebook: {
        cells: NbCell[];
        metadata: Record<string, unknown>;
    }, baseMtime: number): Promise<{
        ok: true;
        value: {
            mtime: number;
        };
    } | {
        ok: false;
        error: JupyterError;
    }>;
    /** List *.ipynb files under the root. */
    list(root: string): Promise<{
        ok: true;
        value: NotebookRow[];
    } | {
        ok: false;
        error: JupyterError;
    }>;
    /** Interrupt the running cell (no-op when idle). */
    interrupt(root: string, path: string): Promise<{
        ok: true;
        value: {
            ok: boolean;
        };
    } | {
        ok: false;
        error: JupyterError;
    }>;
    /** Restart the kernel (fresh state). */
    restart(root: string, path: string): Promise<{
        ok: true;
        value: {
            ok: boolean;
        };
    } | {
        ok: false;
        error: JupyterError;
    }>;
    /**
     * Execute one cell, streaming output events.
     * @returns a promise resolving with the done event; rejects on transport failure.
     */
    execute(root: string, path: string, cellId: string, code: string, onOutput: (output: NbOutput) => void): Promise<{
        executionCount: number | null;
        status: 'ok' | 'error';
    }>;
}
