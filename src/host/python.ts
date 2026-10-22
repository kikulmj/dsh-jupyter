/**
 * Locate the Python interpreters the notebook kernel can run on. Desktop ships
 * a primary runtime under the Harness home; SDK/container deployments point at
 * theirs with DSH_PRIMARY_RUNTIME. Conda environments registered in
 * `~/.conda/environments.txt` are offered as additional choices.
 * @module dsh-jupyter/host/python
 */

import { access, readFile } from 'node:fs/promises'
import { constants, existsSync } from 'node:fs'
import { basename, delimiter, dirname, join } from 'node:path'
import { homedir } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-subprocess'
import type { InterpreterOption } from '../core/types.ts'

/** Relative interpreter path inside a primary-runtime payload. */
function interpreterIn(primaryRuntime: string): string {
  return process.platform === 'win32'
    ? join(primaryRuntime, 'dependencies', 'python', 'python.exe')
    : join(primaryRuntime, 'dependencies', 'python', 'bin', 'python3')
}

/** The interpreter inside one conda environment root. */
export function interpreterInEnv(root: string): string {
  return process.platform === 'win32'
    ? join(root, 'python.exe')
    : join(root, 'bin', 'python3')
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
 * Resolve the bundled interpreter once per plugin lifetime.
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

/** Compare interpreter paths case-insensitively on Windows. */
function pathKey(path: string): string {
  const normalized = path.replaceAll('\\', '/')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

/** Read the conda environment roots registered for this user. */
async function condaRoots(): Promise<string[]> {
  const files = [
    join(homedir(), '.conda', 'environments.txt'),
    join(homedir(), '.anaconda', 'environments.txt'),
  ]
  const roots: string[] = []
  for (const file of files) {
    let text: string
    try {
      text = await readFile(file, 'utf8')
    } catch {
      continue
    }
    for (const line of text.split(/\r?\n/)) {
      const root = line.trim()
      if (root !== '') roots.push(root)
    }
  }
  return [...new Set(roots)]
}

/** A display label for one conda root. */
function condaLabel(root: string): string {
  const parent = basename(dirname(root))
  return parent.toLowerCase() === 'envs' ? basename(root) : `base (${basename(root)})`
}

/**
 * Every interpreter the picker offers: the bundled runtime first, then conda
 * environments whose interpreter exists.
 * @param ctx - context carrying the subprocess executable resolver.
 */
export async function listInterpreters(ctx: Context): Promise<InterpreterOption[]> {
  const bundled = await resolvePython(ctx)
  const options: InterpreterOption[] = [{ id: 'bundled', label: 'Bundled Python (dsh)', python: bundled }]
  const seen = new Set([pathKey(bundled)])
  for (const root of await condaRoots()) {
    const python = interpreterInEnv(root)
    if (!(await executable(python))) continue
    const key = pathKey(python)
    if (seen.has(key)) continue
    seen.add(key)
    options.push({ id: `conda:${root}`, label: `conda: ${condaLabel(root)}`, python })
  }
  return options
}

/**
 * Whether a requested interpreter is one the server offers. `undefined` and
 * an empty string mean "bundled".
 * @param ctx - context carrying the subprocess executable resolver.
 * @param python - the requested interpreter path.
 */
export async function isKnownInterpreter(ctx: Context, python: string | undefined): Promise<boolean> {
  if (python === undefined || python === '') return true
  const known = await listInterpreters(ctx)
  return known.some((option) => pathKey(option.python) === pathKey(python))
}

/**
 * Environment overrides that approximate `conda activate` for an env's
 * interpreter: PATH ordering plus the CONDA_* facts packages read.
 * @param python - the interpreter path.
 * @returns explicit environment entries, or undefined for a non-conda runtime.
 */
export function condaEnvFor(python: string): Record<string, string> | undefined {
  const binDir = dirname(python)
  const root = process.platform === 'win32' ? binDir : dirname(binDir)
  if (!existsSync(join(root, 'conda-meta'))) return undefined
  const pathParts = process.platform === 'win32'
    ? [root, join(root, 'Scripts'), join(root, 'Library', 'bin')]
    : [join(root, 'bin')]
  const PATH = [...pathParts, process.env.PATH ?? ''].filter((part) => part !== '').join(delimiter)
  return {
    PATH,
    CONDA_PREFIX: root,
    CONDA_DEFAULT_ENV: basename(root),
    CONDA_SHLVL: '1',
  }
}
