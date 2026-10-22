/**
 * @dsh-local/dsh-jupyter — host half: the Session-scoped notebook file
 * service and the /dsh-jupyter/* HTTP routes (read/write/raw + NDJSON
 * streaming cell execution through the Python bridge) on the shared
 * webserver. The browser half (exports "./client") registers the notebook as a
 * native right-sidebar tab type for `.ipynb` files.
 *
 * The host half also announces the plugin to every agent through the
 * system-prompt section mechanism.
 * @module @dsh-local/dsh-jupyter
 */
import type { Context } from '@deepseek-ai/cordis';
/** Required services: routes, managed subprocesses, filesystem, sessions, sandbox policy, and the prompt band. */
export declare const inject: string[];
/** Model-facing announcement: plugin presence, capabilities, and limits. */
export declare const JUPYTER_GUIDANCE: string;
/**
 * Mount the notebook services and routes.
 * @param ctx - context carrying webServer, subprocess, fs, sessions, systemPrompt.
 */
export declare function apply(ctx: Context): void;
