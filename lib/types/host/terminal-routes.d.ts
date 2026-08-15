/**
 * /dsh-terminal/* route layer: JSON envelope for session create/input/resize/kill
 * and an NDJSON output stream (one event per line) read through a fetch
 * ReadableStream — the same transport shape as notebook cell execution.
 * Also serves the xterm.css asset (copied next to the built host half) so the
 * browser can fetch and inject it once.
 *
 * Hardening mirrors the notebook routes: loopback-only (a loopback socket AND
 * a loopback Host header) plus the JSON content-type CSRF fence on mutating
 * POSTs, and a same-origin check on the Origin header. The xterm.css route is
 * GET and read-only (a stylesheet), so it relaxes the content-type fence but
 * keeps the loopback + same-origin checks.
 * @module dsh-jupyter/host/terminal-routes
 */
import type { Context } from '@deepseek-ai/cordis';
import { TerminalSessionManager } from './terminal.ts';
/**
 * Register the /dsh-terminal routes.
 * @param ctx - context carrying the webServer service.
 * @param manager - the PTY session registry.
 * @returns the route disposer.
 */
export declare function registerTerminalRoutes(ctx: Context, manager: TerminalSessionManager): () => void;
