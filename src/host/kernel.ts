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

import { Readable } from 'node:stream'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-subprocess'
import type { SubprocessHandle, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import type { NbOutput, NotebookView } from '../core/types.ts'
import { NotebookService } from './notebook-service.ts'

const nodeRequire = createRequire(import.meta.url)

/** Kernel-bridge spawn seam (constructor injectable for tests). */
export type SpawnKernel = (spec: SubprocessSpawnSpec) => SubprocessHandle

/** Production spawn over the subprocess service. */
export function defaultSpawnKernel(ctx: Context): SpawnKernel {
  return (spec) => ctx.subprocess.spawn(spec)
}

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

  constructor(
    private readonly root: string,
    private readonly rel: string,
    private readonly notebookService: NotebookService,
    private readonly spawnKernel: SpawnKernel,
    private readonly bridgeScript: string,
    private readonly getKernelName: () => string,
  ) {}

  /** The canonical notebook path this session is bound to. */
  get boundPath(): string {
    return `${this.root}\u0000${this.rel}`
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

  /** Restart the kernel bridge (fresh kernel state). */
  restart(): void {
    if (!this.alive) return
    this.send({ op: 'restart', id: String(this.requestSeq++) })
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
    for (const pending of this.pending.values()) {
      pending.reject(new Error('kernel session closed'))
    }
    this.pending.clear()
    for (const pending of this.queue.splice(0)) {
      pending.reject(new Error('kernel session closed'))
    }
    return { wasAlive }
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
    const gated = await this.notebookService.verify(this.root)
    if (!gated.ok) {
      throw new Error(gated.error.message)
    }
    // The kernel's cwd is the notebook's directory so relative imports and
    // data files behave like a real Jupyter session.
    const cwd = dirname(nodeRequire('node:path').join(gated.canonical, this.rel))
    const spec: SubprocessSpawnSpec = {
      argv: ['python3', this.bridgeScript, '--kernel', this.getKernelName(), '--cwd', cwd],
      cwd: gated.canonical,
      stdio: {
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: { maxBytes: 64 * 1024 },
      },
      graceMs: 10_000,
    }
    const handle = this.spawnKernel(spec)
    this.handle = handle
    this.shutdownRequested = false
    // Drain stdout events; completion waits for the ready event.
    const ready = this.waitForReady(handle)
    void this.drain(handle)
    await ready
  }

  /** Wait until the bridge emits `ready` (or an error event / timeout). */
  private waitForReady(handle: SubprocessHandle): Promise<void> {
    return new Promise((resolveReady, rejectReady) => {
      const timeout = setTimeout(() => rejectReady(new Error('kernel bridge start timed out')), 30_000)
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
      check()
      const clear = (): void => {
        clearInterval(timer)
        clearTimeout(timeout)
      }
      const onDone = (): void => {
        clear()
        if (this.readySignal !== 'ready') {
          rejectReady(new Error(`kernel bridge exited before ready; ${this.stderrTail}`))
        }
      }
      void handle.done.then(onDone, onDone)
    })
  }

  /** Ready signal set by the drain (ready / error / undefined). */
  private readySignal: 'ready' | 'error' | undefined
  private readyError: string | undefined

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
  }

  /** Send one JSONL request to the bridge. */
  private send(request: Record<string, unknown>): void {
    if (this.handle === undefined || this.handle.stdin === undefined) return
    this.handle.stdin.write(JSON.stringify(request) + '\n')
  }

  /** Last stderr tail (populated by the exit handler for diagnostics). */
  private stderrTail = ''
}

/**
 * Session registry: owns every live kernel session and cleans them all up on
 * plugin dispose.
 */
export class KernelSessionManager {
  private readonly sessions = new Map<string, KernelSession>()

  constructor(
    private readonly notebookService: NotebookService,
    private readonly spawnKernel: SpawnKernel,
    private readonly bridgeScript: string,
    private readonly getKernelName: (notebook: Pick<NotebookView, 'metadata'>) => string,
  ) {}

  /** Get (or lazily create) the session for a notebook path. */
  async session(root: string, rel: string): Promise<KernelSession> {
    const key = `${root}\u0000${rel}`
    let session = this.sessions.get(key)
    if (session === undefined) {
      // Kernel name follows the notebook's kernelspec when present.
      let kernelName = 'python3'
      const view = await this.notebookService.read(root, rel)
      if (!('code' in view)) kernelName = this.getKernelName(view)
      session = new KernelSession(root, rel, this.notebookService, this.spawnKernel, this.bridgeScript, () => kernelName)
      this.sessions.set(key, session)
    }
    return session
  }

  /** Return an existing session without creating one (control ops on idle sessions). */
  existingSession(root: string, rel: string): KernelSession | undefined {
    return this.sessions.get(`${root}\u0000${rel}`)
  }

  /** Dispose one session (e.g. notebook switch). */
  disposeSession(root: string, rel: string): KernelDisposeResult {
    const key = `${root}\u0000${rel}`
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
