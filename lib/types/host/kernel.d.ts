/**
 * Jupyter kernel session manager: one long-lived Python bridge subprocess per
 * notebook file (keyed by `${root}\u0000${rel}`), driven over JSONL stdio. The
 * bridge runs a real jupyter_client kernel, so kernel state persists across
 * cell executions (variables, imports, matplotlib state).
 *
 * Protocol (see kernel_bridge.py): requests are one JSON object per line on
 * stdin; events are one JSON object per line on stdout (`output` streams
 * while a cell runs, `done` finishes it). Only one execution is in flight
 * per session; concurrent execute requests queue FIFO. Output events stream
 * to the current execute's onOutput callback.
 * @module dsh-jupyter/host/kernel
 */
import type { Context } from '@deepseek-ai/cordis';
import type { SubprocessHandle, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess';
import type { NbOutput, NotebookView } from '../core/types.ts';
import { NotebookService } from './notebook-service.ts';
/** Kernel-bridge spawn seam (constructor injectable for tests). */
export type SpawnKernel = (spec: SubprocessSpawnSpec) => SubprocessHandle;
/** Production spawn over the subprocess service. */
export declare function defaultSpawnKernel(ctx: Context): SpawnKernel;
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
    private readonly root;
    private readonly rel;
    private readonly notebookService;
    private readonly spawnKernel;
    private readonly bridgeScript;
    private readonly getKernelName;
    private handle;
    private readonly pending;
    private readonly queue;
    private requestSeq;
    private shutdownRequested;
    private starting;
    constructor(root: string, rel: string, notebookService: NotebookService, spawnKernel: SpawnKernel, bridgeScript: string, getKernelName: () => string);
    /** The canonical notebook path this session is bound to. */
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
    /** Restart the kernel bridge (fresh kernel state). */
    restart(): void;
    /**
     * Terminate the bridge and reject any in-flight work. Idempotent; safe to
     * call while queued executes are pending.
     * @returns whether a live bridge was terminated.
     */
    dispose(): KernelDisposeResult;
    /** Start the bridge if needed and drain the queue one request at a time. */
    private pump;
    /** Spawn the bridge process if it is not running. */
    private ensureBridge;
    private startBridge;
    /** Wait until the bridge emits `ready` (or an error event / timeout). */
    private waitForReady;
    /** Ready signal set by the drain (ready / error / undefined). */
    private readySignal;
    private readyError;
    /** Consume stdout events and dispatch by id. */
    private drain;
    /** Send one JSONL request to the bridge. */
    private send;
    /** Last stderr tail (populated by the exit handler for diagnostics). */
    private stderrTail;
}
/**
 * Session registry: owns every live kernel session and cleans them all up on
 * plugin dispose.
 */
export declare class KernelSessionManager {
    private readonly notebookService;
    private readonly spawnKernel;
    private readonly bridgeScript;
    private readonly getKernelName;
    private readonly sessions;
    constructor(notebookService: NotebookService, spawnKernel: SpawnKernel, bridgeScript: string, getKernelName: (notebook: Pick<NotebookView, 'metadata'>) => string);
    /** Get (or lazily create) the session for a notebook path. */
    session(root: string, rel: string): Promise<KernelSession>;
    /** Return an existing session without creating one (control ops on idle sessions). */
    existingSession(root: string, rel: string): KernelSession | undefined;
    /** Dispose one session (e.g. notebook switch). */
    disposeSession(root: string, rel: string): KernelDisposeResult;
    /** Dispose every session (plugin teardown). */
    disposeAll(): void;
    /** Session count (diagnostics). */
    get size(): number;
}
