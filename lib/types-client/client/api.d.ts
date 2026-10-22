/**
 * Browser API client for the /dsh-jupyter routes. All calls POST JSON and
 * decode the shared envelope; execute streams NDJSON lines through a reader.
 * @module dsh-jupyter/client/api
 */
import type { InterpreterOption, JupyterError, NotebookView, NbCell, NbOutput, TextFileView } from '../core/types.ts';
/** The typed API surface the panel drives. */
export declare class JupyterApi {
    /** List the Python interpreters the kernel picker offers. */
    interpreters(signal?: AbortSignal): Promise<{
        ok: true;
        value: InterpreterOption[];
    } | {
        ok: false;
        error: JupyterError;
    }>;
    /** Read and parse a notebook file. */
    read(sessionId: string, path: string, signal?: AbortSignal): Promise<{
        ok: true;
        value: NotebookView;
    } | {
        ok: false;
        error: JupyterError;
    }>;
    /** Replace a non-notebook file with a fresh one-cell notebook. */
    create(sessionId: string, path: string, overwrite: boolean): Promise<{
        ok: true;
        value: NotebookView;
    } | {
        ok: false;
        error: JupyterError;
    }>;
    /** Write the notebook back (with the filesystem version guard). */
    write(sessionId: string, path: string, notebook: {
        cells: NbCell[];
        metadata: Record<string, unknown>;
    }, baseVersion: string): Promise<{
        ok: true;
        value: {
            version: string;
        };
    } | {
        ok: false;
        error: JupyterError;
    }>;
    /** Interrupt the running cell (no-op when idle). */
    interrupt(sessionId: string, path: string): Promise<{
        ok: true;
        value: {
            ok: boolean;
        };
    } | {
        ok: false;
        error: JupyterError;
    }>;
    /** Restart the kernel (fresh state). */
    restart(sessionId: string, path: string): Promise<{
        ok: true;
        value: {
            ok: boolean;
        };
    } | {
        ok: false;
        error: JupyterError;
    }>;
    /** Dispose the notebook's kernel session (tab closed). */
    dispose(sessionId: string, path: string): Promise<{
        ok: true;
        value: {
            ok: boolean;
        };
    } | {
        ok: false;
        error: JupyterError;
    }>;
    /** Read a plain UTF-8 file for the text editor. */
    readText(sessionId: string, path: string, signal?: AbortSignal): Promise<{
        ok: true;
        value: TextFileView;
    } | {
        ok: false;
        error: JupyterError;
    }>;
    /** Write a plain UTF-8 file with the filesystem version guard. */
    writeText(sessionId: string, path: string, text: string, baseVersion: string): Promise<{
        ok: true;
        value: {
            version: string;
        };
    } | {
        ok: false;
        error: JupyterError;
    }>;
    /** URL for a file referenced beside the notebook (markdown images). */
    rawUrl(sessionId: string, path: string, suffix: string): string;
    /**
     * Execute one cell, streaming output events.
     * @returns a promise resolving with the done event; rejects on transport failure.
     */
    execute(sessionId: string, path: string, cellId: string, code: string, onOutput: (output: NbOutput) => void, python?: string): Promise<{
        executionCount: number | null;
        status: 'ok' | 'error';
    }>;
}
