/**
 * Locate the Python interpreter the kernel bridge runs on. Desktop ships a
 * primary runtime under the Harness home; SDK/container deployments point at
 * theirs with DSH_PRIMARY_RUNTIME. A system interpreter is the last resort.
 * @module dsh-jupyter/host/python
 */

import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-subprocess'

/** Relative interpreter path inside a primary-runtime payload. */
function interpreterIn(primaryRuntime: string): string {
  return process.platform === 'win32'
    ? join(primaryRuntime, 'dependencies', 'python', 'python.exe')
    : join(primaryRuntime, 'dependencies', 'python', 'bin', 'python3')
}

/** Candidate bundled payload roots, best first. */
function payloadRoots(): string[] {
  const roots: string[] = []
  if (process.env.DSH_PRIMARY_RUNTIME) roots.push(process.env.DSH_PRIMARY_RUNTIME)
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  roots.push(join(home, 'dsh-runtimes', 'dsh-primary-runtime'))
  return [...new Set(roots)]
}

/** True when `path` is an executable regular file. */
async function executable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

let cached: Promise<string> | undefined

/**
 * Resolve the interpreter once per plugin lifetime.
 * @param ctx - context carrying the subprocess executable resolver.
 * @throws when neither the bundled runtime nor a system interpreter exists.
 */
export function resolvePython(ctx: Context): Promise<string> {
  cached ??= (async () => {
    for (const root of payloadRoots()) {
      const candidate = interpreterIn(root)
      if (await executable(candidate)) return candidate
    }
    const names = process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python']
    for (const name of names) {
      try {
        return await ctx.subprocess.resolveExecutable(name)
      } catch {
        // try the next name
      }
    }
    throw new Error('no Python interpreter found (bundled runtime missing and python3/python not on PATH)')
  })().catch((error: unknown) => {
    cached = undefined
    throw error
  })
  return cached
}
