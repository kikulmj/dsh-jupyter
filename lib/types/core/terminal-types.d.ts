/**
 * Shared wire types for the dsh-jupyter terminal (host <-> browser).
 *
 * The terminal is a real PTY (node-pty, TERM=xterm-256color) driven over
 * HTTP routes: create/input/resize/kill carry JSON envelopes, and the output
 * stream is NDJSON (one {@link TerminalEvent} per line) read through a fetch
 * ReadableStream — the same transport shape as notebook cell execution.
 * @module dsh-jupyter/core/terminal-types
 */
/** One JSON envelope over the /dsh-terminal routes (mirrors the notebook envelope). */
export type TerminalEnvelope<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: TerminalError;
};
/** Stable error codes for the terminal wire. */
export interface TerminalError {
    code: 'internal' | 'workspace-unknown' | 'not-found' | 'spawn-failed';
    message: string;
}
/** One session-creation result. */
export interface TerminalSessionCreated {
    /** Server-allocated session id (opaque to the browser). */
    id: string;
    /** Resolved working directory the shell was spawned in. */
    cwd: string;
    /** The shell program name that was spawned (basename). */
    shell: string;
}
/** One streaming terminal event (one NDJSON line). */
export type TerminalEvent = 
/** A chunk of PTY output (UTF-8 text, in delivery order). */
{
    kind: 'output';
    data: string;
}
/** The shell process exited. Sent once, then the stream closes. */
 | {
    kind: 'exited';
    exitCode: number | null;
    signal: string | null;
}
/** A transport/route error (never a shell exit). Sent once, then closes. */
 | {
    kind: 'error';
    message: string;
};
