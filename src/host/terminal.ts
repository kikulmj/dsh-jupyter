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

import { createRequire } from 'node:module'
import { constants as osConstants, homedir } from 'node:os'
import { basename } from 'node:path'
import { randomBytes } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import type { IDisposable, IPty } from 'node-pty'
import type { TerminalEvent } from '../core/terminal-types.ts'

/** CJS require pinned to this module's URL so 'node-pty' resolves from the plugin node_modules. */
const nodeRequire = createRequire(import.meta.url)
/** The node-pty module (spawned synchronously; the native binary ships prebuilt/built in the profile). */
const nodePty = nodeRequire('node-pty') as typeof import('node-pty')

/** Bounded scrollback buffer: keeps the tail so a late/re-attaching stream replays recent output. */
class OutputBuffer {
  private chunks: string[] = []
  private bytes = 0
  private dropped = false
  constructor(private readonly maxBytes: number) {}

  append(data: string): void {
    if (data.length === 0) return
    this.chunks.push(data)
    this.bytes += Buffer.byteLength(data, 'utf8')
    while (this.bytes > this.maxBytes && this.chunks.length > 1) {
      const removed = this.chunks.shift() as string
      this.bytes -= Buffer.byteLength(removed, 'utf8')
      this.dropped = true
    }
  }

  /** The accumulated tail as one string (may be empty). */
  snapshot(): string {
    return this.chunks.join('')
  }

  /** Whether the snapshot was truncated (the head was dropped). */
  wasTruncated(): boolean {
    return this.dropped
  }

  reset(): void {
    this.chunks = []
    this.bytes = 0
    this.dropped = false
  }
}

/** Resolve the default shell program from $SHELL (validated) else /bin/bash. */
function resolveShell(): string {
  const candidate = process.env.SHELL
  if (typeof candidate === 'string' && candidate !== '') {
    return candidate
  }
  return process.platform === 'win32' ? 'cmd.exe' : '/bin/bash'
}

/** Whether a path is an existing directory (used to validate the requested cwd). */
async function isDirectory(path: string): Promise<boolean> {
  try {
    const result = await stat(path)
    return result.isDirectory()
  } catch {
    return false
  }
}

/** One live terminal session (one PTY + its listeners + scrollback). */
export class TerminalSession {
  readonly id: string
  readonly cwd: string
  readonly shell: string
  private readonly pty: IPty
  private readonly dataDisposable: IDisposable
  private readonly exitDisposable: IDisposable
  private readonly output = new OutputBuffer(2 << 20) // 2 MiB scrollback ceiling
  private readonly listeners = new Set<(event: TerminalEvent) => void>()
  private exited = false
  private exitResult: { exitCode: number | null; signal: string | null } | undefined

  private constructor(id: string, shell: string, cwd: string, cols: number, rows: number) {
    this.id = id
    this.shell = shell
    this.cwd = cwd
    this.pty = nodePty.spawn(shell, ['-l'], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: process.env as Record<string, string>,
    })
    this.dataDisposable = this.pty.onData((data) => this.deliver({ kind: 'output', data }))
    this.exitDisposable = this.pty.onExit(({ exitCode, signal }) => {
      this.exited = true
      this.exitResult = {
        exitCode: typeof exitCode === 'number' ? exitCode : null,
        signal: typeof signal === 'number' && signal !== 0 ? signalName(signal) : null,
      }
      this.deliver({
        kind: 'exited',
        exitCode: this.exitResult.exitCode,
        signal: this.exitResult.signal,
      })
    })
  }

  /**
   * Spawn a new session. Throws on spawn failure (the route maps this to a
   * spawn-failed envelope).
   * @param id - server-allocated session id.
   * @param requestedCwd - requested working directory (validated + realpath'd).
   * @param cols - initial column count.
   * @param rows - initial row count.
   */
  static async create(id: string, requestedCwd: string, cols: number, rows: number): Promise<TerminalSession> {
    const shell = resolveShell()
    let cwd = homedir()
    if (typeof requestedCwd === 'string' && requestedCwd !== '' && await isDirectory(requestedCwd)) {
      try {
        cwd = await realpath(requestedCwd)
      } catch {
        // keep homedir fallback
      }
    }
    return new TerminalSession(id, shell, cwd, cols, rows)
  }

  /** The buffered scrollback snapshot (replayed to a freshly attaching stream). */
  bufferedOutput(): { data: string; truncated: boolean } {
    return { data: this.output.snapshot(), truncated: this.output.wasTruncated() }
  }

  /** Subscribe to live events (output + exit). Returns an unsubscribe. */
  subscribe(fn: (event: TerminalEvent) => void): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  /** Whether the shell has exited. */
  get isExited(): boolean {
    return this.exited
  }

  /** Write input to the PTY (no-op after exit). */
  write(data: string): void {
    if (this.exited) return
    try {
      this.pty.write(data)
    } catch {
      // a write after the pty tore down races the exit callback; ignore
    }
  }

  /** Resize the PTY (no-op after exit; resize failures are non-fatal). */
  resize(cols: number, rows: number): void {
    if (this.exited) return
    try {
      this.pty.resize(cols, rows)
    } catch {
      // some shells reject resize mid-startup; the next fit retries
    }
  }

  /** Clear the scrollback buffer (input/output history stays in the shell). */
  clearBuffer(): void {
    this.output.reset()
  }

  /** Kill the PTY and release disposables. Idempotent. */
  dispose(): void {
    if (!this.exited) {
      try {
        this.pty.kill()
      } catch {
        // already gone
      }
    }
    this.dataDisposable.dispose()
    this.exitDisposable.dispose()
    this.listeners.clear()
  }

  /** Fan an event to the buffer + every active subscriber. */
  private deliver(event: TerminalEvent): void {
    if (event.kind === 'output') this.output.append(event.data)
    for (const fn of this.listeners) {
      try {
        fn(event)
      } catch {
        // a throwing subscriber must not starve the others
      }
    }
  }
}

/** Map a numeric signal to its POSIX name (null for 0 / unknown). */
function signalName(number: number): string | null {
  if (number === 0) return null
  for (const [name, value] of Object.entries(osConstants.signals)) {
    if (value === number) return name
  }
  return null
}

/**
 * Terminal session registry: allocates ids, owns sessions, disposes them on
 * plugin unload.
 * @module dsh-jupyter/host/terminal
 */
export class TerminalSessionManager {
  private readonly sessions = new Map<string, TerminalSession>()
  private seq = 0

  /** Create a new PTY session. */
  async create(requestedCwd: string, cols: number, rows: number): Promise<TerminalSession> {
    this.seq += 1
    const id = `${process.pid}-${this.seq}-${randomBytes(4).toString('hex')}`
    const session = await TerminalSession.create(id, requestedCwd, cols, rows)
    this.sessions.set(id, session)
    return session
  }

  /** Look up a session by id. */
  get(id: string): TerminalSession | undefined {
    return this.sessions.get(id)
  }

  /** Dispose one session by id (no-op if absent). Returns whether it was alive. */
  dispose(id: string): boolean {
    const session = this.sessions.get(id)
    if (session === undefined) return false
    session.dispose()
    this.sessions.delete(id)
    return true
  }

  /** Dispose every session (plugin unload). */
  disposeAll(): void {
    for (const session of this.sessions.values()) session.dispose()
    this.sessions.clear()
  }
}

/** The shell basename for a created session (for the header label). */
export function shellLabelOf(shell: string): string {
  return basename(shell)
}
