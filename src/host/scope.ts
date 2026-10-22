/**
 * Session-scoped filesystem resolution for the notebook routes. The browser
 * names a Session and a path; the host derives the Session's workspace root
 * from its header and confines every operation to that root through the
 * composed filesystem, so the panel inherits the same sandbox policy as the
 * built-in file tools.
 * @module dsh-jupyter/host/scope
 */

import type { Context } from '@deepseek-ai/cordis'
import type { FsTarget } from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-fs'
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import type {} from '@deepseek-ai/dsh-session'
import type { JupyterError } from '../core/types.ts'

/** One resolved notebook workspace. */
export interface NotebookScope {
  sessionId: string
  /** Absolute workspace root from the Session header. */
  root: string
  rootTarget: FsTarget
  /** The Session's own sandbox policy (mode override + workspace root). */
  policy: SandboxExecutionPolicy
}

/** Scope resolution verdict. */
export type ScopeResult = { ok: true; scope: NotebookScope } | { ok: false; error: JupyterError }

/** File resolution verdict. */
export type FileResult = { ok: true; target: FsTarget } | { ok: false; error: JupyterError }

/**
 * Resolve the live Session's workspace root.
 * @param ctx - context carrying sessions and the filesystem service.
 * @param sessionId - the Session that authorizes the read.
 */
export async function resolveScope(ctx: Context, sessionId: string): Promise<ScopeResult> {
  if (sessionId === '') return { ok: false, error: { code: 'workspace-unknown', message: 'missing session id' } }
  const session = ctx.sessions.get(sessionId as never)
  const cwd = session?.header.cwd
  if (typeof cwd !== 'string' || cwd === '') {
    return { ok: false, error: { code: 'workspace-unknown', message: 'session has no working directory' } }
  }
  try {
    const rootTarget = await ctx.fs.resolve(cwd)
    // A route handler is not inside the Agent's context, so resolve() without
    // the Session would fall back to the deployment root and deny every write
    // outside it. Carry the Session's own mode and workspace root instead.
    const policy = ctx.sandboxPolicy.resolve({ session })
    return { ok: true, scope: { sessionId, root: cwd, rootTarget, policy } }
  } catch {
    return { ok: false, error: { code: 'workspace-unknown', message: `cannot resolve workspace: ${cwd}` } }
  }
}

/**
 * Resolve one path inside the Session workspace (relative paths are relative
 * to its root) and refuse anything that resolves outside it.
 * @param ctx - context carrying the filesystem service.
 * @param scope - the resolved Session workspace.
 * @param path - notebook path relative to the root, or an absolute path.
 */
export async function resolveFile(ctx: Context, scope: NotebookScope, path: string): Promise<FileResult> {
  if (path === '' || path.includes('\0')) {
    return { ok: false, error: { code: 'not-found', message: 'invalid path' } }
  }
  let target: FsTarget
  try {
    target = await ctx.fs.resolve(path, { cwd: scope.root })
  } catch {
    return { ok: false, error: { code: 'not-found', message: `cannot resolve ${path}` } }
  }
  if (!ctx.fs.contains(scope.rootTarget, target)) {
    return { ok: false, error: { code: 'path-outside-root', message: `path escapes the workspace: ${path}` } }
  }
  return { ok: true, target }
}
