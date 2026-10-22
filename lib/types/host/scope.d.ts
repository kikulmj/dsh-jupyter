/**
 * Session-scoped filesystem resolution for the notebook routes. The browser
 * names a Session and a path; the host derives the Session's workspace root
 * from its header and confines every operation to that root through the
 * composed filesystem, so the panel inherits the same sandbox policy as the
 * built-in file tools.
 * @module dsh-jupyter/host/scope
 */
import type { Context } from '@deepseek-ai/cordis';
import type { FsTarget } from '@deepseek-ai/dsh-fs';
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox';
import type { JupyterError } from '../core/types.ts';
/** One resolved notebook workspace. */
export interface NotebookScope {
    sessionId: string;
    /** Absolute workspace root from the Session header. */
    root: string;
    rootTarget: FsTarget;
    /** The Session's own sandbox policy (mode override + workspace root). */
    policy: SandboxExecutionPolicy;
}
/** Scope resolution verdict. */
export type ScopeResult = {
    ok: true;
    scope: NotebookScope;
} | {
    ok: false;
    error: JupyterError;
};
/** File resolution verdict. */
export type FileResult = {
    ok: true;
    target: FsTarget;
} | {
    ok: false;
    error: JupyterError;
};
/**
 * Resolve the live Session's workspace root.
 * @param ctx - context carrying sessions and the filesystem service.
 * @param sessionId - the Session that authorizes the read.
 */
export declare function resolveScope(ctx: Context, sessionId: string): Promise<ScopeResult>;
/**
 * Resolve one path inside the Session workspace (relative paths are relative
 * to its root) and refuse anything that resolves outside it.
 * @param ctx - context carrying the filesystem service.
 * @param scope - the resolved Session workspace.
 * @param path - notebook path relative to the root, or an absolute path.
 */
export declare function resolveFile(ctx: Context, scope: NotebookScope, path: string): Promise<FileResult>;
