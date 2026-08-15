/**
 * /dsh-jupyter/* route layer: JSON envelope (ok/error with stable codes) for
 * notebook read/write/list and kernel control, plus an NDJSON stream for cell
 * execution (output events stream while the cell runs, a done event finishes
 * it). Loopback-only + JSON content-type fences, mirroring the aionui-panel
 * route hardening.
 * @module dsh-jupyter/host/routes
 */
import type { Context } from '@deepseek-ai/cordis';
import type { NotebookService } from './notebook-service.ts';
import type { KernelSessionManager } from './kernel.ts';
/** Extract the kernel name from a notebook's kernelspec metadata (default python3). */
export declare function kernelNameOf(metadata: Record<string, unknown>): string;
/**
 * Register the /dsh-jupyter routes.
 * @param ctx - context carrying the webServer service.
 * @param notebooks - the gated notebook file service.
 * @param kernels - the kernel session registry.
 * @returns the route disposers.
 */
export declare function registerJupyterRoutes(ctx: Context, notebooks: NotebookService, kernels: KernelSessionManager): () => void;
