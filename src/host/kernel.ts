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

import { Readable } from 'node:stream'
import { dirname } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-subprocess'
import type { SubprocessHandle } from '@deepseek-ai/dsh-subprocess'
import type { NbOutput } from '../core/types.ts'
import { condaEnvFor, resolvePython } from './python.ts'

/** Line-buffer a readable stream, yielding complete lines (newline-stripped). */
async function* lines(readable: Readable): AsyncGenerator<string> {
  let buffer = ''
  for await (const chunk of readable) {
    buffer += chunk.toString('utf8')
    let index: number
    while ((index = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, index)
      buffer = buffer.slice(index + 1)
      if (line !== '') yield line
    }
  }
  if (buffer !== '') yield buffer
}

/** One queued execute request. */
interface PendingExecute {
  id: string
  code: string
  onOutput: (output: NbOutput) => void
  resolve: (result: { executionCount: number | null; status: 'ok' | 'error' }) => void
  reject: (error: Error) => void
}

/** One JSON event from the bridge (normalized). */
interface BridgeEvent {
  type: string
  id?: string
  output?: NbOutput
  message?: string
  execution_count?: number | null
  status?: string
}

/** Result of a session dispose. */
export interface KernelDisposeResult {
  /** True when a live bridge was terminated. */
  wasAlive: boolean
}

/**
 * One kernel session bound to a notebook file. Lazily spawns the bridge on
 * first execute; the bridge process is owned by this session and terminated
 * on dispose.
 */
export class KernelSession {
  private handle: SubprocessHandle | undefined
  private readonly pending = new Map<string, PendingExecute>()
  private readonly queue: PendingExecute[] = []
  private requestSeq = 0
  private shutdownRequested = false
  private starting: Promise<void> | undefined
  private readySignal: 'ready' | 'error' | undefined
  private readyError: string | undefined

  constructor(
    private readonly ctx: Context,
    private readonly bridgeScript: string,
    private readonly scope: { sessionId: string; root: string },
    private readonly path: string,
    /** The interpreter selected for this notebook; undefined means bundled. */
    readonly python: string | undefined,
  ) {}

  /** The canonical notebook identity this session is bound to. */
  get boundPath(): string {
    return `${this.scope.sessionId}\u0000${this.path}`
  }

  /** True when a bridge process exists (started or starting). */
  get alive(): boolean {
    return this.handle !== undefined && !this.shutdownRequested
  }

  /** Run one cell; outputs stream through onOutput, resolves at `done`. */
  execute(code: string, onOutput: (output: NbOutput) => void): Promise<{ executionCount: number | null; status: 'ok' | 'error' }> {
    return new Promise((resolve, reject) => {
      this.queue.push({ id: '', code, onOutput, resolve, reject })
      void this.pump()
    })
  }

  /** Interrupt the running execution (no-op when idle). */
  interrupt(): void {
    if (!this.alive) return
    this.send({ op: 'interrupt', id: String(this.requestSeq++) })
  }

  /** Drop the bridge process; the next execute starts a fresh kernel. */
  restart(): void {
    this.rejectAll('kernel restarted')
    if (this.handle !== undefined) {
      try {
        this.handle.terminate()
      } catch {
        // best-effort teardown
      }
      this.handle = undefined
    }
    this.shutdownRequested = false
    this.readySignal = undefined
    this.readyError = undefined
  }

  /**
   * Terminate the bridge and reject any in-flight work. Idempotent; safe to
   * call while queued executes are pending.
   * @returns whether a live bridge was terminated.
   */
  dispose(): KernelDisposeResult {
    this.shutdownRequested = true
    const wasAlive = this.handle !== undefined
    if (this.handle !== undefined) {
      try {
        this.handle.terminate()
      } catch {
        // best-effort teardown
      }
      this.handle = undefined
    }
    this.rejectAll('kernel session closed')
    return { wasAlive }
  }

  /** Reject every in-flight and queued execute. */
  private rejectAll(message: string): void {
    for (const pending of this.pending.values()) pending.reject(new Error(message))
    this.pending.clear()
    for (const pending of this.queue.splice(0)) pending.reject(new Error(message))
  }

  /** Start the bridge if needed and drain the queue one request at a time. */
  private async pump(): Promise<void> {
    while (!this.shutdownRequested && this.queue.length > 0) {
      const pending = this.queue.shift()
      if (pending === undefined) break
      const id = String(this.requestSeq++)
      const entry: PendingExecute = { ...pending, id }
      this.pending.set(id, entry)
      try {
        await this.ensureBridge()
        if (this.shutdownRequested) throw new Error('kernel session closed')
        this.send({ op: 'execute', id, code: entry.code })
      } catch (error) {
        this.pending.delete(id)
        entry.reject(error instanceof Error ? error : new Error(String(error)))
      }
    }
  }

  /** Spawn the bridge process if it is not running. */
  private ensureBridge(): Promise<void> {
    if (this.alive) return Promise.resolve()
    if (this.starting !== undefined) return this.starting
    this.starting = this.startBridge().finally(() => {
      this.starting = undefined
    })
    return this.starting
  }

  private async startBridge(): Promise<void> {
    const python = this.python ?? await resolvePython(this.ctx)
    // Resolve through the composed filesystem so the bridge runs in the
    // notebook's real directory (sandbox path included) and never outside the
    // Session workspace.
    const rootTarget = await this.ctx.fs.resolve(this.scope.root)
    const target = await this.ctx.fs.resolve(this.path, { cwd: this.scope.root })
    if (!this.ctx.fs.contains(rootTarget, target)) {
      throw new Error(`notebook is outside the workspace: ${this.path}`)
    }
    // Relative imports and data files then behave like a real Jupyter session.
    const cwd = dirname(this.ctx.fs.processPath(target))
    if (this.shutdownRequested) throw new Error('kernel session closed')
    const condaEnv = condaEnvFor(python)
    const handle = this.ctx.subprocess.spawn({
      argv: [python, this.bridgeScript, '--cwd', cwd],
      cwd,
      stdio: {
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: { maxBytes: 64 * 1024 },
      },
      graceMs: 10_000,
      ...condaEnv === undefined ? {} : { env: condaEnv },
    })
    this.handle = handle
    this.shutdownRequested = false
    this.readySignal = undefined
    this.readyError = undefined
    const ready = this.waitForReady(handle)
    void this.drain(handle)
    await ready
  }

  /** Wait until the bridge emits `ready` (or an error event / timeout). */
  private waitForReady(handle: SubprocessHandle): Promise<void> {
    return new Promise((resolveReady, rejectReady) => {
      const timeout = setTimeout(() => rejectReady(new Error(`kernel bridge start timed out; ${this.stderrTail(handle)}`)), 30_000)
      const check = (): void => {
        if (this.handle !== handle) {
          clearTimeout(timeout)
          rejectReady(new Error('kernel bridge replaced before ready'))
          return
        }
        if (this.readySignal === 'ready') {
          clearTimeout(timeout)
          resolveReady()
        } else if (this.readySignal === 'error') {
          clearTimeout(timeout)
          rejectReady(new Error(this.readyError ?? 'kernel bridge failed to start'))
        }
      }
      const timer = setInterval(check, 25)
      const clear = (): void => {
        clearInterval(timer)
        clearTimeout(timeout)
      }
      const onDone = (): void => {
        clear()
        if (this.readySignal !== 'ready') {
          rejectReady(new Error(`kernel bridge exited before ready; ${this.stderrTail(handle)}`))
        }
      }
      void handle.done.then(onDone, onDone)
    })
  }

  /** The collected stderr tail (diagnostics only). */
  private stderrTail(handle: SubprocessHandle): string {
    try {
      return handle.collected.stderr?.readFrom(0).text ?? ''
    } catch {
      return ''
    }
  }

  /** Consume stdout events and dispatch by id. */
  private async drain(handle: SubprocessHandle): Promise<void> {
    const stdout = handle.stdout
    if (stdout === undefined) return
    for await (const line of lines(stdout)) {
      let event: BridgeEvent
      try {
        event = JSON.parse(line) as BridgeEvent
      } catch {
        continue
      }
      if (event.type === 'ready') {
        this.readySignal = 'ready'
        continue
      }
      if (event.type === 'error' && event.id === '') {
        this.readySignal = 'error'
        this.readyError = event.message
        continue
      }
      if (event.type === 'output') {
        const pending = event.id === undefined ? undefined : this.pending.get(event.id)
        if (pending !== undefined && event.output !== undefined) {
          try {
            pending.onOutput(event.output)
          } catch {
            // an output callback failure must not kill the drain
          }
        }
        continue
      }
      if (event.type === 'done' && event.id !== undefined) {
        const pending = this.pending.get(event.id)
        if (pending !== undefined) {
          this.pending.delete(event.id)
          pending.resolve({
            executionCount: event.execution_count ?? null,
            status: event.status === 'error' ? 'error' : 'ok',
          })
        }
        continue
      }
      if (event.type === 'error' && event.id !== undefined) {
        const pending = this.pending.get(event.id)
        if (pending !== undefined) {
          this.pending.delete(event.id)
          pending.reject(new Error(event.message ?? 'kernel execution failed'))
        }
        continue
      }
    }
    // The bridge exited: fail whatever still waits on it.
    if (this.handle === handle) {
      this.handle = undefined
      this.readySignal = undefined
      this.rejectAll(`kernel bridge exited; ${this.stderrTail(handle)}`)
    }
  }

  /** Send one JSONL request to the bridge. */
  private send(request: Record<string, unknown>): void {
    if (this.handle === undefined || this.handle.stdin === undefined) return
    this.handle.stdin.write(JSON.stringify(request) + '\n')
  }
}

/**
 * Session registry: owns every live kernel session and cleans them all up on
 * plugin dispose.
 */
export class KernelSessionManager {
  private readonly sessions = new Map<string, KernelSession>()

  constructor(
    private readonly ctx: Context,
    private readonly bridgeScript: string,
  ) {}

  /** Get (or lazily create) the session for one notebook and interpreter. */
  session(scope: { sessionId: string; root: string }, path: string, python?: string): KernelSession {
    const selected = python === '' ? undefined : python
    const key = `${scope.sessionId}\u0000${path}`
    let session = this.sessions.get(key)
    if (session !== undefined && session.python !== selected) {
      session.dispose()
      this.sessions.delete(key)
      session = undefined
    }
    if (session === undefined) {
      session = new KernelSession(this.ctx, this.bridgeScript, scope, path, selected)
      this.sessions.set(key, session)
    }
    return session
  }

  /** Return an existing session without creating one (control ops on idle sessions). */
  existingSession(scope: { sessionId: string; root: string }, path: string): KernelSession | undefined {
    return this.sessions.get(`${scope.sessionId}\u0000${path}`)
  }

  /** Dispose one session (e.g. notebook switch). */
  disposeSession(scope: { sessionId: string; root: string }, path: string): KernelDisposeResult {
    const key = `${scope.sessionId}\u0000${path}`
    const session = this.sessions.get(key)
    if (session === undefined) return { wasAlive: false }
    this.sessions.delete(key)
    return session.dispose()
  }

  /** Dispose every session (plugin teardown). */
  disposeAll(): void {
    for (const session of this.sessions.values()) session.dispose()
    this.sessions.clear()
  }

  /** Session count (diagnostics). */
  get size(): number {
    return this.sessions.size
  }
}
