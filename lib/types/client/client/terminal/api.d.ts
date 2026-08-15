/**
 * Browser API client for the /dsh-terminal routes. Mutating calls POST JSON
 * and decode the shared envelope; the output stream is an NDJSON ReadableStream
 * (one event per line) cancelled through an AbortController.
 * @module dsh-jupyter/client/terminal/api
 */
import type { TerminalError, TerminalEvent, TerminalSessionCreated } from '../../core/terminal-types.ts';
/** A handle to one live output stream (cancel() aborts the fetch). */
export interface TerminalStream {
    /** Whether the underlying fetch is still reading. */
    readonly active: boolean;
    /** Abort the stream and stop reading. */
    cancel(): void;
}
/** The typed API surface the dock drives. */
export declare class TerminalApi {
    /** Create a new PTY session at the given cwd (empty string = host default). */
    create(cwd: string, cols: number, rows: number): Promise<{
        ok: true;
        value: TerminalSessionCreated;
    } | {
        ok: false;
        error: TerminalError;
    }>;
    /** Write input (keystrokes) to the session's PTY. */
    input(id: string, data: string): Promise<{
        ok: true;
        value: {
            ok: boolean;
        };
    } | {
        ok: false;
        error: TerminalError;
    }>;
    /** Resize the PTY (propagate new cols/rows). */
    resize(id: string, cols: number, rows: number): Promise<{
        ok: true;
        value: {
            ok: boolean;
        };
    } | {
        ok: false;
        error: TerminalError;
    }>;
    /** Kill the PTY and dispose the session. */
    kill(id: string): Promise<{
        ok: true;
        value: {
            ok: boolean;
            disposed: boolean;
        };
    } | {
        ok: false;
        error: TerminalError;
    }>;
    /** Clear the host scrollback buffer (input/history in the shell is untouched). */
    clear(id: string): Promise<{
        ok: true;
        value: {
            ok: boolean;
        };
    } | {
        ok: false;
        error: TerminalError;
    }>;
    /**
     * Open the NDJSON output stream and pump events to the callback until the
     * shell exits or cancel() is called.
     * @param id - session id.
     * @param onEvent - one event per NDJSON line.
     * @returns a stream handle (call cancel() to abort).
     */
    stream(id: string, onEvent: (event: TerminalEvent) => void): Promise<TerminalStream>;
}
