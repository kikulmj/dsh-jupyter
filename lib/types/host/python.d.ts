/**
 * Locate the Python interpreter the kernel bridge runs on. Desktop ships a
 * primary runtime under the Harness home; SDK/container deployments point at
 * theirs with DSH_PRIMARY_RUNTIME. A system interpreter is the last resort.
 * @module dsh-jupyter/host/python
 */
import type { Context } from '@deepseek-ai/cordis';
/**
 * Resolve the interpreter once per plugin lifetime.
 * @param ctx - context carrying the subprocess executable resolver.
 * @throws when neither the bundled runtime nor a system interpreter exists.
 */
export declare function resolvePython(ctx: Context): Promise<string>;
