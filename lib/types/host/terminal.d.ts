/**
 * Terminal PTY session manager (host half): one node-pty shell per browser
 * session, spawned with TERM=xterm-256color at the project root (fallback the
 * user's home). Output is buffered (bounded, tail-keeping) so a stream that
 * attaches late — or re-attaches after a transient disconnect — replays the
 * recent scrollback before going live; after replay, every new chunk fans out
 * to the active stream subscribers.
 *
 * The PTY is a real user shell running as the dsh host user with full user
 * privileges; the workspace gate is deliberately NOT applied to the terminal
 * (a shell can `cd` anywhere, so gating its start dir would be security
 * theater). The real boundary is the loopback + same-origin fence on the
 * routes (see terminal-routes.ts) — only the user's own browser on the same
 * machine can open a session.
 *
 * node-pty is externalized by the tsdown host bundle (it is a native module)
 * and resolved at runtime through `createRequire(import.meta.url)`, which
 * walks the plugin's node_modules → the profile's installed (already-built)
 * copy — no native build of our own.
 * @module dsh-jupyter/host/terminal
 */
import type { TerminalEvent } from '../core/terminal-types.ts';
/** One live terminal session (one PTY + its listeners + scrollback). */
export declare class TerminalSession {
    readonly id: string;
    readonly cwd: string;
    readonly shell: string;
    private readonly pty;
    private readonly dataDisposable;
    private readonly exitDisposable;
    private readonly output;
    private readonly listeners;
    private exited;
    private exitResult;
    private constructor();
    /**
     * Spawn a new session. Throws on spawn failure (the route maps this to a
     * spawn-failed envelope).
     * @param id - server-allocated session id.
     * @param requestedCwd - requested working directory (validated + realpath'd).
     * @param cols - initial column count.
     * @param rows - initial row count.
     */
    static create(id: string, requestedCwd: string, cols: number, rows: number): Promise<TerminalSession>;
    /** The buffered scrollback snapshot (replayed to a freshly attaching stream). */
    bufferedOutput(): {
        data: string;
        truncated: boolean;
    };
    /** Subscribe to live events (output + exit). Returns an unsubscribe. */
    subscribe(fn: (event: TerminalEvent) => void): () => void;
    /** Whether the shell has exited. */
    get isExited(): boolean;
    /** Write input to the PTY (no-op after exit). */
    write(data: string): void;
    /** Resize the PTY (no-op after exit; resize failures are non-fatal). */
    resize(cols: number, rows: number): void;
    /** Clear the scrollback buffer (input/output history stays in the shell). */
    clearBuffer(): void;
    /** Kill the PTY and release disposables. Idempotent. */
    dispose(): void;
    /** Fan an event to the buffer + every active subscriber. */
    private deliver;
}
/**
 * Terminal session registry: allocates ids, owns sessions, disposes them on
 * plugin unload.
 * @module dsh-jupyter/host/terminal
 */
export declare class TerminalSessionManager {
    private readonly sessions;
    private seq;
    /** Create a new PTY session. */
    create(requestedCwd: string, cols: number, rows: number): Promise<TerminalSession>;
    /** Look up a session by id. */
    get(id: string): TerminalSession | undefined;
    /** Dispose one session by id (no-op if absent). Returns whether it was alive. */
    dispose(id: string): boolean;
    /** Dispose every session (plugin unload). */
    disposeAll(): void;
}
/** The shell basename for a created session (for the header label). */
export declare function shellLabelOf(shell: string): string;
