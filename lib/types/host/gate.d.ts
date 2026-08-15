/**
 * Workspace gate for the /dsh-jupyter routes: canonicalize the requested
 * project root and require it to be a registered workspace (or a directory
 * inside one). This is the security boundary of the notebook routes — the
 * browser may only read and mutate files under registered workspace roots,
 * never arbitrary host directories. Mirrors the aionui-panel gate.
 * @module dsh-jupyter/host/gate
 */
import type { Context } from '@deepseek-ai/cordis';
import type { JupyterError } from '../core/types.ts';
/** The gate verdict for one project root. */
export type GateVerdict = {
    ok: true;
    canonical: string;
} | {
    ok: false;
    error: JupyterError;
};
/** The workspace-membership check the services run on every request. */
export type WorkspaceGate = (root: string) => Promise<GateVerdict>;
/** Normalize a path for prefix comparison (forward slashes, no trailing slash). */
export declare function normalizeForPrefix(value: string): string;
/** True when `child` lives inside (or equals) `root`, separator-robust. */
export declare function isPathInside(root: string, child: string): boolean;
/** Production gate: canonicalize the root and require workspace membership. */
export declare function createWorkspaceGate(ctx: Context): WorkspaceGate;
