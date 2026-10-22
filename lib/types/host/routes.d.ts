/**
 * /dsh-jupyter/* route layer: JSON envelope (ok/error with stable codes) for
 * notebook read/write and kernel control, a raw GET for images referenced by
 * markdown cells, and an NDJSON stream for cell execution.
 * @module dsh-jupyter/host/routes
 */
import type { Context } from '@deepseek-ai/cordis';
import type { NotebookService } from './notebook-service.ts';
import type { KernelSessionManager } from './kernel.ts';
/**
 * Register the /dsh-jupyter routes.
 * @param ctx - context carrying webServer, fs, and sessions.
 * @param notebooks - the notebook file service.
 * @param kernels - the kernel session registry.
 * @returns the route disposer.
 */
export declare function registerJupyterRoutes(ctx: Context, notebooks: NotebookService, kernels: KernelSessionManager): () => void;
