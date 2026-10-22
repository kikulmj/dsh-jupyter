/**
 * Locate the Python interpreters the notebook kernel can run on. Desktop ships
 * a primary runtime under the Harness home; SDK/container deployments point at
 * theirs with DSH_PRIMARY_RUNTIME. Conda environments registered in
 * `~/.conda/environments.txt` are offered as additional choices.
 * @module dsh-jupyter/host/python
 */
import type { Context } from '@deepseek-ai/cordis';
import type { InterpreterOption } from '../core/types.ts';
/** The interpreter inside one conda environment root. */
export declare function interpreterInEnv(root: string): string;
/**
 * Resolve the bundled interpreter once per plugin lifetime.
 * @param ctx - context carrying the subprocess executable resolver.
 * @throws when neither the bundled runtime nor a system interpreter exists.
 */
export declare function resolvePython(ctx: Context): Promise<string>;
/**
 * Every interpreter the picker offers: the bundled runtime first, then conda
 * environments whose interpreter exists.
 * @param ctx - context carrying the subprocess executable resolver.
 */
export declare function listInterpreters(ctx: Context): Promise<InterpreterOption[]>;
/**
 * Whether a requested interpreter is one the server offers. `undefined` and
 * an empty string mean "bundled".
 * @param ctx - context carrying the subprocess executable resolver.
 * @param python - the requested interpreter path.
 */
export declare function isKnownInterpreter(ctx: Context, python: string | undefined): Promise<boolean>;
/**
 * Environment overrides that approximate `conda activate` for an env's
 * interpreter: PATH ordering plus the CONDA_* facts packages read.
 * @param python - the interpreter path.
 * @returns explicit environment entries, or undefined for a non-conda runtime.
 */
export declare function condaEnvFor(python: string): Record<string, string> | undefined;
