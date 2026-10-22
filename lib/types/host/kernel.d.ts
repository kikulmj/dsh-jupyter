/**
 * Jupyter kernel session manager: one long-lived Python bridge subprocess per
 * notebook (keyed by Session + notebook path), driven over JSONL stdio. The
 * bridge owns the Python namespace, so kernel state persists across cell
 * executions (variables, imports, imported modules).
 *
 * Protocol (see kernel_bridge.py): requests are one JSON object per line on
 * stdin; events are one JSON object per line on stdout (`output` streams
 * while a cell runs, `done` finishes it). One execution is in flight per
 * session; concurrent execute requests queue FIFO.
 * @module dsh-jupyter/host/kernel
 */
import type { Context } from '@deepseek-ai/cordis';
import type { NbOutput } from '../core/types.ts';
/** Result of a session dispose. */
export interface KernelDisposeResult {
    /** True when a live bridge was terminated. */
    wasAlive: boolean;
}
/**
 * One kernel session bound to a notebook file. Lazily spawns the bridge on
 * first execute; the bridge process is owned by this session and terminated
 * on dispose.
 */
export declare class KernelSession {
    private readonly ctx;
    private readonly bridgeScript;
    private readonly scope;
    private readonly path;
    /** The interpreter selected for this notebook; undefined means bundled. */
    readonly python: string | undefined;
    private handle;
    private readonly pending;
    private readonly queue;
    private requestSeq;
    private shutdownRequested;
    private starting;
    private readySignal;
    private readyError;
    constructor(ctx: Context, bridgeScript: string, scope: {
        sessionId: string;
        root: string;
    }, path: string, 
    /** The interpreter selected for this notebook; undefined means bundled. */
    python: string | undefined);
    /** The canonical notebook identity this session is bound to. */
    get boundPath(): string;
    /** True when a bridge process exists (started or starting). */
    get alive(): boolean;
    /** Run one cell; outputs stream through onOutput, resolves at `done`. */
    execute(code: string, onOutput: (output: NbOutput) => void): Promise<{
        executionCount: number | null;
        status: 'ok' | 'error';
    }>;
    /** Interrupt the running execution (no-op when idle). */
    interrupt(): void;
    /** Drop the bridge process; the next execute starts a fresh kernel. */
    restart(): void;
    /**
     * Terminate the bridge and reject any in-flight work. Idempotent; safe to
     * call while queued executes are pending.
     * @returns whether a live bridge was terminated.
     */
    dispose(): KernelDisposeResult;
    /** Reject every in-flight and queued execute. */
    private rejectAll;
    /** Start the bridge if needed and drain the queue one request at a time. */
    private pump;
    /** Spawn the bridge process if it is not running. */
    private ensureBridge;
    private startBridge;
    /** Wait until the bridge emits `ready` (or an error event / timeout). */
    private waitForReady;
    /** The collected stderr tail (diagnostics only). */
    private stderrTail;
    /** Consume stdout events and dispatch by id. */
    private drain;
    /** Send one JSONL request to the bridge. */
    private send;
}
/**
 * Session registry: owns every live kernel session and cleans them all up on
 * plugin dispose.
 */
export declare class KernelSessionManager {
    private readonly ctx;
    private readonly bridgeScript;
    private readonly sessions;
    constructor(ctx: Context, bridgeScript: string);
    /** Get (or lazily create) the session for one notebook and interpreter. */
    session(scope: {
        sessionId: string;
        root: string;
    }, path: string, python?: string): KernelSession;
    /** Return an existing session without creating one (control ops on idle sessions). */
    existingSession(scope: {
        sessionId: string;
        root: string;
    }, path: string): KernelSession | undefined;
    /** Dispose one session (e.g. notebook switch). */
    disposeSession(scope: {
        sessionId: string;
        root: string;
    }, path: string): KernelDisposeResult;
    /** Dispose every session (plugin teardown). */
    disposeAll(): void;
    /** Session count (diagnostics). */
    get size(): number;
}
