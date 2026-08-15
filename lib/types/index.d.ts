/**
 * @dsh-local/dsh-jupyter — host half: the workspace-gated notebook fs
 * service and the /dsh-jupyter/* HTTP routes (read/write/list + NDJSON
 * streaming cell execution through a real Jupyter kernel bridge), plus the
 * left-edge Web terminal (/dsh-terminal/*: a real node-pty shell per
 * browser session, streamed as NDJSON) on the shared webserver. The browser
 * half (exports "./client") is served by client-modules from the same
 * package's dsh.client declaration.
 *
 * The host half also announces the plugin to every agent through the
 * system-prompt section mechanism, so agents know the notebook panel and the
 * terminal exist and how to cooperate with them.
 * @module @dsh-local/dsh-jupyter
 */
import type { Context } from '@deepseek-ai/cordis';
/** Required services: the route registry, the managed subprocess seam, the workspace registry, and the prompt band. */
export declare const inject: string[];
/** Model-facing announcement: plugin presence, capabilities, and limits. */
export declare const JUPYTER_GUIDANCE: string;
/**
 * Mount the notebook data services and their routes, plus the terminal PTY
 * registry and its routes.
 * @param ctx - context carrying webServer, subprocess, workspaceRegistry, systemPrompt.
 */
export declare function apply(ctx: Context): void;
