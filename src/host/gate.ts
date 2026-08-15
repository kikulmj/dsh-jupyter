/**
 * Workspace gate for the /dsh-jupyter routes: canonicalize the requested
 * project root and require it to be a registered workspace (or a directory
 * inside one). This is the security boundary of the notebook routes — the
 * browser may only read and mutate files under registered workspace roots,
 * never arbitrary host directories. Mirrors the aionui-panel gate.
 * @module dsh-jupyter/host/gate
 */

import { realpath } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-workspace'
import type { JupyterError } from '../core/types.ts'

/** The gate verdict for one project root. */
export type GateVerdict = { ok: true; canonical: string } | { ok: false; error: JupyterError }

/** The workspace-membership check the services run on every request. */
export type WorkspaceGate = (root: string) => Promise<GateVerdict>

/** Normalize a path for prefix comparison (forward slashes, no trailing slash). */
export function normalizeForPrefix(value: string): string {
  const normalized = value.replaceAll('\\', '/').replace(/\/+$/, '')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

/** True when `child` lives inside (or equals) `root`, separator-robust. */
export function isPathInside(root: string, child: string): boolean {
  if (root === '' || child === '') return false
  const normRoot = normalizeForPrefix(root)
  const normChild = normalizeForPrefix(child)
  if (normChild === normRoot) return true
  return normChild.startsWith(`${normRoot}/`)
}

/** Production gate: canonicalize the root and require workspace membership. */
export function createWorkspaceGate(ctx: Context): WorkspaceGate {
  return async (root) => {
    if (typeof root !== 'string' || root === '') {
      return { ok: false, error: { code: 'workspace-unknown', message: 'empty project root' } }
    }
    let canonical: string
    try {
      canonical = await realpath(root)
    } catch {
      return { ok: false, error: { code: 'workspace-unknown', message: 'path does not resolve on disk' } }
    }
    const workspaces = ctx.workspaceRegistry.list()
    for (const workspace of workspaces) {
      if (isPathInside(workspace.path, canonical)) {
        return { ok: true, canonical }
      }
    }
    return { ok: false, error: { code: 'workspace-unknown', message: 'path is not inside a registered workspace' } }
  }
}
