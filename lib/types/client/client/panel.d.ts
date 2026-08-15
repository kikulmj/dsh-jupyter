/**
 * Notebook editor component — the content injected into the built-in preview
 * column. It opens a .ipynb (path prop), edits code/markdown/raw cells, saves
 * back through the host routes, and runs cells through the shared kernel
 * bridge (streaming outputs). Visual language mirrors the built-in preview
 * panel (--aion-* tokens).
 * @module dsh-jupyter/client/panel
 */
import type { JSX } from 'react';
import type { JupyterApi } from './api.ts';
/**
 * The notebook editor (embedded in the preview column).
 * @param root - the active workspace root (from the current session cwd).
 * @param api - the /dsh-jupyter API client.
 * @param path - the notebook path to open (null = empty state).
 */
export declare function NotebookPanel({ root, api, path, }: {
    root: string;
    api: JupyterApi;
    path: string | null;
}): JSX.Element;
