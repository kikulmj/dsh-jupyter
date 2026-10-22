import { fileURLToPath } from "node:url";
import { basename, delimiter, dirname, join } from "node:path";
import { access, readFile } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import { homedir } from "node:os";
//#region src/host/scope.ts
/**
* Resolve the live Session's workspace root.
* @param ctx - context carrying sessions and the filesystem service.
* @param sessionId - the Session that authorizes the read.
*/
async function resolveScope(ctx, sessionId) {
	if (sessionId === "") return {
		ok: false,
		error: {
			code: "workspace-unknown",
			message: "missing session id"
		}
	};
	const session = ctx.sessions.get(sessionId);
	const cwd = session?.header.cwd;
	if (typeof cwd !== "string" || cwd === "") return {
		ok: false,
		error: {
			code: "workspace-unknown",
			message: "session has no working directory"
		}
	};
	try {
		return {
			ok: true,
			scope: {
				sessionId,
				root: cwd,
				rootTarget: await ctx.fs.resolve(cwd),
				policy: ctx.sandboxPolicy.resolve({ session })
			}
		};
	} catch {
		return {
			ok: false,
			error: {
				code: "workspace-unknown",
				message: `cannot resolve workspace: ${cwd}`
			}
		};
	}
}
/**
* Resolve one path inside the Session workspace (relative paths are relative
* to its root) and refuse anything that resolves outside it.
* @param ctx - context carrying the filesystem service.
* @param scope - the resolved Session workspace.
* @param path - notebook path relative to the root, or an absolute path.
*/
async function resolveFile(ctx, scope, path) {
	if (path === "" || path.includes("\0")) return {
		ok: false,
		error: {
			code: "not-found",
			message: "invalid path"
		}
	};
	let target;
	try {
		target = await ctx.fs.resolve(path, { cwd: scope.root });
	} catch {
		return {
			ok: false,
			error: {
				code: "not-found",
				message: `cannot resolve ${path}`
			}
		};
	}
	if (!ctx.fs.contains(scope.rootTarget, target)) return {
		ok: false,
		error: {
			code: "path-outside-root",
			message: `path escapes the workspace: ${path}`
		}
	};
	return {
		ok: true,
		target
	};
}
//#endregion
//#region src/host/notebook-service.ts
/** Notebook size cap (parse budget for the panel). */
const NOTEBOOK_CAP_BYTES = 32 << 20;
/** Cap on an image or related file served beside the notebook. */
const RAW_CAP_BYTES = 32 << 20;
/** Cap on a plain text file opened in the editor. */
const TEXT_CAP_BYTES = 8 << 20;
/** An empty nbformat 4 view with one ready-to-type code cell. */
function emptyNotebook(path, version) {
	return {
		path,
		cells: [{
			id: "cell-0",
			cell_type: "code",
			source: "",
			execution_count: null,
			outputs: [],
			metadata: {},
			path
		}],
		metadata: {
			kernelspec: {
				name: "python3",
				display_name: "Python 3",
				language: "python"
			},
			language_info: { name: "python" }
		},
		version
	};
}
/** Derive a mime type from a file extension. */
function mimeOf(path) {
	return {
		png: "image/png",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		gif: "image/gif",
		webp: "image/webp",
		svg: "image/svg+xml",
		ico: "image/x-icon",
		avif: "image/avif",
		bmp: "image/bmp",
		pdf: "application/pdf",
		txt: "text/plain",
		md: "text/markdown",
		csv: "text/csv",
		json: "application/json",
		html: "text/html"
	}[path.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}
/** Join a cell source that may be a string or an array of lines. */
function sourceToString(source) {
	if (typeof source === "string") return source;
	if (Array.isArray(source)) return source.map((line) => typeof line === "string" ? line : "").join("");
	return "";
}
/**
* Parse and normalize a notebook JSON value into the panel's view.
* @param value - the parsed notebook, or the panel's write payload.
* @param requireFormat - require an explicit `nbformat: 4` (reads); write
*   payloads carry only cells and metadata.
*/
function parseNotebook(value, requireFormat = true) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return {
		code: "not-notebook",
		message: "notebook must be a JSON object"
	};
	const nb = value;
	if (nb.nbformat !== void 0 && nb.nbformat !== 4) return {
		code: "not-notebook",
		message: "only nbformat 4 notebooks are supported"
	};
	if (requireFormat && nb.nbformat === void 0) return {
		code: "not-notebook",
		message: "notebook is missing nbformat 4"
	};
	const rawCells = Array.isArray(nb.cells) ? nb.cells : [];
	const cells = [];
	for (const raw of rawCells) {
		if (typeof raw !== "object" || raw === null) continue;
		const cell = raw;
		const cellType = cell.cell_type;
		if (cellType !== "code" && cellType !== "markdown" && cellType !== "raw") continue;
		const id = typeof cell.id === "string" && cell.id !== "" ? cell.id : `cell-${cells.length}-${Date.now().toString(36)}`;
		const outputs = [];
		if (Array.isArray(cell.outputs)) for (const out of cell.outputs) {
			if (typeof out !== "object" || out === null) continue;
			const parsed = parseOutput(out);
			if (parsed !== null) outputs.push(parsed);
		}
		cells.push({
			id,
			cell_type: cellType,
			source: sourceToString(cell.source),
			execution_count: typeof cell.execution_count === "number" ? cell.execution_count : null,
			outputs,
			metadata: typeof cell.metadata === "object" && cell.metadata !== null && !Array.isArray(cell.metadata) ? cell.metadata : {},
			path: ""
		});
	}
	return {
		cells,
		metadata: typeof nb.metadata === "object" && nb.metadata !== null && !Array.isArray(nb.metadata) ? nb.metadata : {}
	};
}
/** Parse one raw output object into the typed union (null when unknown). */
function parseOutput(raw) {
	const type = raw.output_type;
	if (type === "stream") return {
		output_type: "stream",
		name: typeof raw.name === "string" ? raw.name : "stdout",
		text: typeof raw.text === "string" ? raw.text : String(raw.text ?? "")
	};
	if (type === "execute_result" || type === "display_data") return {
		output_type: type,
		execution_count: typeof raw.execution_count === "number" ? raw.execution_count : null,
		data: typeof raw.data === "object" && raw.data !== null ? raw.data : {},
		metadata: typeof raw.metadata === "object" && raw.metadata !== null ? raw.metadata : {}
	};
	if (type === "error") return {
		output_type: "error",
		ename: typeof raw.ename === "string" ? raw.ename : "Error",
		evalue: typeof raw.evalue === "string" ? raw.evalue : "",
		traceback: Array.isArray(raw.traceback) ? raw.traceback.filter((l) => typeof l === "string") : []
	};
	return null;
}
/** Serialize the panel's view back to an nbformat 4 notebook value. */
function serializeNotebook(view) {
	return {
		cells: view.cells.map((cell) => ({
			id: cell.id,
			cell_type: cell.cell_type,
			source: cell.source,
			execution_count: cell.cell_type === "code" ? cell.execution_count : null,
			outputs: cell.cell_type === "code" ? cell.outputs : [],
			metadata: cell.metadata
		})),
		metadata: view.metadata,
		nbformat: 4,
		nbformat_minor: 5
	};
}
/** Stable fs error code, when the thrown value is an FsError. */
function fsCodeOf(error) {
	return typeof error === "object" && error !== null && "code" in error ? String(error.code) : void 0;
}
/** Map a filesystem failure onto the route vocabulary. */
function fsFailure(error, fallback) {
	const code = fsCodeOf(error);
	if (code === "FS_NOT_FOUND" || code === "FS_NOT_REGULAR_FILE" || code === "FS_NOT_DIRECTORY") return {
		code: "not-found",
		message: fallback.message
	};
	if (code === "FS_STALE_VERSION") return {
		code: "write-conflict",
		message: "file changed on disk since it was loaded"
	};
	if (code === "FS_TOO_LARGE") return {
		code: "not-notebook",
		message: "file exceeds the size cap"
	};
	if (code === "FS_NOT_TEXT") return {
		code: "not-text",
		message: "file is not UTF-8 text"
	};
	if (code === "FS_SANDBOX_DENIED") return {
		code: "write-failed",
		message: `${fallback.message}: denied by the session sandbox policy`
	};
	if (code === "FS_PERMISSION_DENIED") return {
		code: "write-failed",
		message: `${fallback.message}: permission denied`
	};
	return fallback;
}
/**
* Notebook file service over the Session workspace.
* @param ctx - context carrying the filesystem service.
*/
var NotebookService = class {
	ctx;
	constructor(ctx) {
		this.ctx = ctx;
	}
	/** Resolve a notebook path and read its parsed view. */
	async read(scope, path) {
		const resolved = await resolveFile(this.ctx, scope, path);
		if (!resolved.ok) return resolved.error;
		try {
			const info = await this.ctx.fs.stat(resolved.target);
			if (info === void 0 || info.type !== "file") return {
				code: "not-found",
				message: `not a file: ${path}`
			};
			if (info.size !== void 0 && info.size > NOTEBOOK_CAP_BYTES) return {
				code: "not-notebook",
				message: "notebook exceeds read cap"
			};
			const raw = await this.ctx.fs.readText(resolved.target);
			const text = raw.charCodeAt(0) === 65279 ? raw.slice(1) : raw;
			if (text.trim() === "") return emptyNotebook(path, String(info.version));
			let parsed;
			try {
				parsed = JSON.parse(text);
			} catch {
				return {
					code: "not-notebook",
					message: `${path} is not valid JSON`
				};
			}
			const result = parseNotebook(parsed);
			if ("code" in result) return result;
			return {
				path,
				cells: result.cells.map((cell) => ({
					...cell,
					path
				})),
				metadata: result.metadata,
				version: String(info.version)
			};
		} catch (error) {
			return fsFailure(error, {
				code: "not-found",
				message: `cannot read ${path}`
			});
		}
	}
	/** Serialize the notebook and write it with the version guard. */
	async write(scope, path, value, baseVersion) {
		const resolved = await resolveFile(this.ctx, scope, path);
		if (!resolved.ok) return resolved.error;
		const parsed = parseNotebook(value, false);
		if ("code" in parsed) return parsed;
		const payload = serializeNotebook({
			cells: parsed.cells,
			metadata: parsed.metadata
		});
		const text = JSON.stringify(payload, null, 1) + "\n";
		try {
			const outcome = await this.ctx.fs.writeText(resolved.target, text, baseVersion === void 0 || baseVersion === "" ? void 0 : {
				kind: "replaceIfVersion",
				version: baseVersion
			}, void 0, scope.policy);
			return { version: String(outcome.version) };
		} catch (error) {
			return fsFailure(error, {
				code: "write-failed",
				message: `cannot write ${path}`
			});
		}
	}
	/**
	* Replace a file with a fresh one-cell notebook. Used when a `.ipynb` is
	* not parseable and the user explicitly chooses to start over.
	*/
	async create(scope, path, overwrite) {
		const resolved = await resolveFile(this.ctx, scope, path);
		if (!resolved.ok) return resolved.error;
		const view = emptyNotebook(path, "");
		const payload = serializeNotebook({
			cells: view.cells,
			metadata: view.metadata
		});
		const text = JSON.stringify(payload, null, 1) + "\n";
		try {
			const outcome = await this.ctx.fs.writeText(resolved.target, text, overwrite ? void 0 : { kind: "createIfAbsent" }, void 0, scope.policy);
			return {
				...view,
				version: String(outcome.version)
			};
		} catch (error) {
			return fsFailure(error, {
				code: "write-failed",
				message: `cannot create ${path}`
			});
		}
	}
	/** Read a plain UTF-8 file for the text editor. */
	async readTextFile(scope, path) {
		const resolved = await resolveFile(this.ctx, scope, path);
		if (!resolved.ok) return resolved.error;
		try {
			const info = await this.ctx.fs.stat(resolved.target);
			if (info === void 0 || info.type !== "file") return {
				code: "not-found",
				message: `not a file: ${path}`
			};
			if (info.size !== void 0 && info.size > TEXT_CAP_BYTES) return {
				code: "not-text",
				message: "file exceeds the text editor size cap"
			};
			const raw = await this.ctx.fs.readText(resolved.target);
			return {
				path,
				text: raw.charCodeAt(0) === 65279 ? raw.slice(1) : raw,
				version: String(info.version)
			};
		} catch (error) {
			return fsFailure(error, {
				code: "not-found",
				message: `cannot read ${path}`
			});
		}
	}
	/** Write a plain UTF-8 file with the version guard and Session policy. */
	async writeTextFile(scope, path, text, baseVersion) {
		if (text.length > TEXT_CAP_BYTES) return {
			code: "not-text",
			message: "file exceeds the text editor size cap"
		};
		const resolved = await resolveFile(this.ctx, scope, path);
		if (!resolved.ok) return resolved.error;
		try {
			const outcome = await this.ctx.fs.writeText(resolved.target, text, baseVersion === void 0 || baseVersion === "" ? void 0 : {
				kind: "replaceIfVersion",
				version: baseVersion
			}, void 0, scope.policy);
			return { version: String(outcome.version) };
		} catch (error) {
			return fsFailure(error, {
				code: "write-failed",
				message: `cannot write ${path}`
			});
		}
	}
	/** Read raw bytes beside the notebook (markdown images). */
	async readRaw(scope, path) {
		const resolved = await resolveFile(this.ctx, scope, path);
		if (!resolved.ok) return resolved.error;
		try {
			const info = await this.ctx.fs.stat(resolved.target);
			if (info === void 0 || info.type !== "file") return {
				code: "not-found",
				message: `not a file: ${path}`
			};
			if (info.size !== void 0 && info.size > RAW_CAP_BYTES) return {
				code: "not-found",
				message: "file exceeds the size cap"
			};
			return {
				data: await this.ctx.fs.readBytes(resolved.target, void 0, RAW_CAP_BYTES),
				mime: mimeOf(path)
			};
		} catch (error) {
			return fsFailure(error, {
				code: "not-found",
				message: `cannot read ${path}`
			});
		}
	}
};
//#endregion
//#region src/host/python.ts
/**
* Locate the Python interpreters the notebook kernel can run on. Desktop ships
* a primary runtime under the Harness home; SDK/container deployments point at
* theirs with DSH_PRIMARY_RUNTIME. Conda environments registered in
* `~/.conda/environments.txt` are offered as additional choices.
* @module dsh-jupyter/host/python
*/
/** Relative interpreter path inside a primary-runtime payload. */
function interpreterIn(primaryRuntime) {
	return process.platform === "win32" ? join(primaryRuntime, "dependencies", "python", "python.exe") : join(primaryRuntime, "dependencies", "python", "bin", "python3");
}
/** The interpreter inside one conda environment root. */
function interpreterInEnv(root) {
	return process.platform === "win32" ? join(root, "python.exe") : join(root, "bin", "python3");
}
/** Candidate bundled payload roots, best first. */
function payloadRoots() {
	const roots = [];
	if (process.env.DSH_PRIMARY_RUNTIME) roots.push(process.env.DSH_PRIMARY_RUNTIME);
	const home = process.env.DSH_HOME ?? join(homedir(), ".dsh");
	roots.push(join(home, "dsh-runtimes", "dsh-primary-runtime"));
	return [...new Set(roots)];
}
/** True when `path` is an executable regular file. */
async function executable(path) {
	try {
		await access(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}
let cached;
/**
* Resolve the bundled interpreter once per plugin lifetime.
* @param ctx - context carrying the subprocess executable resolver.
* @throws when neither the bundled runtime nor a system interpreter exists.
*/
function resolvePython(ctx) {
	cached ??= (async () => {
		for (const root of payloadRoots()) {
			const candidate = interpreterIn(root);
			if (await executable(candidate)) return candidate;
		}
		const names = process.platform === "win32" ? ["python", "python3"] : ["python3", "python"];
		for (const name of names) try {
			return await ctx.subprocess.resolveExecutable(name);
		} catch {}
		throw new Error("no Python interpreter found (bundled runtime missing and python3/python not on PATH)");
	})().catch((error) => {
		cached = void 0;
		throw error;
	});
	return cached;
}
/** Compare interpreter paths case-insensitively on Windows. */
function pathKey(path) {
	const normalized = path.replaceAll("\\", "/");
	return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
/** Read the conda environment roots registered for this user. */
async function condaRoots() {
	const files = [join(homedir(), ".conda", "environments.txt"), join(homedir(), ".anaconda", "environments.txt")];
	const roots = [];
	for (const file of files) {
		let text;
		try {
			text = await readFile(file, "utf8");
		} catch {
			continue;
		}
		for (const line of text.split(/\r?\n/)) {
			const root = line.trim();
			if (root !== "") roots.push(root);
		}
	}
	return [...new Set(roots)];
}
/** A display label for one conda root. */
function condaLabel(root) {
	return basename(dirname(root)).toLowerCase() === "envs" ? basename(root) : `base (${basename(root)})`;
}
/**
* Every interpreter the picker offers: the bundled runtime first, then conda
* environments whose interpreter exists.
* @param ctx - context carrying the subprocess executable resolver.
*/
async function listInterpreters(ctx) {
	const bundled = await resolvePython(ctx);
	const options = [{
		id: "bundled",
		label: "Bundled Python (dsh)",
		python: bundled
	}];
	const seen = /* @__PURE__ */ new Set([pathKey(bundled)]);
	for (const root of await condaRoots()) {
		const python = interpreterInEnv(root);
		if (!await executable(python)) continue;
		const key = pathKey(python);
		if (seen.has(key)) continue;
		seen.add(key);
		options.push({
			id: `conda:${root}`,
			label: `conda: ${condaLabel(root)}`,
			python
		});
	}
	return options;
}
/**
* Whether a requested interpreter is one the server offers. `undefined` and
* an empty string mean "bundled".
* @param ctx - context carrying the subprocess executable resolver.
* @param python - the requested interpreter path.
*/
async function isKnownInterpreter(ctx, python) {
	if (python === void 0 || python === "") return true;
	return (await listInterpreters(ctx)).some((option) => pathKey(option.python) === pathKey(python));
}
/**
* Environment overrides that approximate `conda activate` for an env's
* interpreter: PATH ordering plus the CONDA_* facts packages read.
* @param python - the interpreter path.
* @returns explicit environment entries, or undefined for a non-conda runtime.
*/
function condaEnvFor(python) {
	const binDir = dirname(python);
	const root = process.platform === "win32" ? binDir : dirname(binDir);
	if (!existsSync(join(root, "conda-meta"))) return void 0;
	return {
		PATH: [...process.platform === "win32" ? [
			root,
			join(root, "Scripts"),
			join(root, "Library", "bin")
		] : [join(root, "bin")], process.env.PATH ?? ""].filter((part) => part !== "").join(delimiter),
		CONDA_PREFIX: root,
		CONDA_DEFAULT_ENV: basename(root),
		CONDA_SHLVL: "1"
	};
}
//#endregion
//#region src/host/kernel.ts
/** Line-buffer a readable stream, yielding complete lines (newline-stripped). */
async function* lines(readable) {
	let buffer = "";
	for await (const chunk of readable) {
		buffer += chunk.toString("utf8");
		let index;
		while ((index = buffer.indexOf("\n")) !== -1) {
			const line = buffer.slice(0, index);
			buffer = buffer.slice(index + 1);
			if (line !== "") yield line;
		}
	}
	if (buffer !== "") yield buffer;
}
/**
* One kernel session bound to a notebook file. Lazily spawns the bridge on
* first execute; the bridge process is owned by this session and terminated
* on dispose.
*/
var KernelSession = class {
	ctx;
	bridgeScript;
	scope;
	path;
	python;
	handle;
	pending = /* @__PURE__ */ new Map();
	queue = [];
	requestSeq = 0;
	shutdownRequested = false;
	starting;
	readySignal;
	readyError;
	constructor(ctx, bridgeScript, scope, path, python) {
		this.ctx = ctx;
		this.bridgeScript = bridgeScript;
		this.scope = scope;
		this.path = path;
		this.python = python;
	}
	/** The canonical notebook identity this session is bound to. */
	get boundPath() {
		return `${this.scope.sessionId}\u0000${this.path}`;
	}
	/** True when a bridge process exists (started or starting). */
	get alive() {
		return this.handle !== void 0 && !this.shutdownRequested;
	}
	/** Run one cell; outputs stream through onOutput, resolves at `done`. */
	execute(code, onOutput) {
		return new Promise((resolve, reject) => {
			this.queue.push({
				id: "",
				code,
				onOutput,
				resolve,
				reject
			});
			this.pump();
		});
	}
	/** Interrupt the running execution (no-op when idle). */
	interrupt() {
		if (!this.alive) return;
		this.send({
			op: "interrupt",
			id: String(this.requestSeq++)
		});
	}
	/** Drop the bridge process; the next execute starts a fresh kernel. */
	restart() {
		this.rejectAll("kernel restarted");
		if (this.handle !== void 0) {
			try {
				this.handle.terminate();
			} catch {}
			this.handle = void 0;
		}
		this.shutdownRequested = false;
		this.readySignal = void 0;
		this.readyError = void 0;
	}
	/**
	* Terminate the bridge and reject any in-flight work. Idempotent; safe to
	* call while queued executes are pending.
	* @returns whether a live bridge was terminated.
	*/
	dispose() {
		this.shutdownRequested = true;
		const wasAlive = this.handle !== void 0;
		if (this.handle !== void 0) {
			try {
				this.handle.terminate();
			} catch {}
			this.handle = void 0;
		}
		this.rejectAll("kernel session closed");
		return { wasAlive };
	}
	/** Reject every in-flight and queued execute. */
	rejectAll(message) {
		for (const pending of this.pending.values()) pending.reject(new Error(message));
		this.pending.clear();
		for (const pending of this.queue.splice(0)) pending.reject(new Error(message));
	}
	/** Start the bridge if needed and drain the queue one request at a time. */
	async pump() {
		while (!this.shutdownRequested && this.queue.length > 0) {
			const pending = this.queue.shift();
			if (pending === void 0) break;
			const id = String(this.requestSeq++);
			const entry = {
				...pending,
				id
			};
			this.pending.set(id, entry);
			try {
				await this.ensureBridge();
				if (this.shutdownRequested) throw new Error("kernel session closed");
				this.send({
					op: "execute",
					id,
					code: entry.code
				});
			} catch (error) {
				this.pending.delete(id);
				entry.reject(error instanceof Error ? error : new Error(String(error)));
			}
		}
	}
	/** Spawn the bridge process if it is not running. */
	ensureBridge() {
		if (this.alive) return Promise.resolve();
		if (this.starting !== void 0) return this.starting;
		this.starting = this.startBridge().finally(() => {
			this.starting = void 0;
		});
		return this.starting;
	}
	async startBridge() {
		const python = this.python ?? await resolvePython(this.ctx);
		const rootTarget = await this.ctx.fs.resolve(this.scope.root);
		const target = await this.ctx.fs.resolve(this.path, { cwd: this.scope.root });
		if (!this.ctx.fs.contains(rootTarget, target)) throw new Error(`notebook is outside the workspace: ${this.path}`);
		const cwd = dirname(this.ctx.fs.processPath(target));
		if (this.shutdownRequested) throw new Error("kernel session closed");
		const condaEnv = condaEnvFor(python);
		const handle = this.ctx.subprocess.spawn({
			argv: [
				python,
				this.bridgeScript,
				"--cwd",
				cwd
			],
			cwd,
			stdio: {
				stdin: "pipe",
				stdout: "pipe",
				stderr: { maxBytes: 64 * 1024 }
			},
			graceMs: 1e4,
			...condaEnv === void 0 ? {} : { env: condaEnv }
		});
		this.handle = handle;
		this.shutdownRequested = false;
		this.readySignal = void 0;
		this.readyError = void 0;
		const ready = this.waitForReady(handle);
		this.drain(handle);
		await ready;
	}
	/** Wait until the bridge emits `ready` (or an error event / timeout). */
	waitForReady(handle) {
		return new Promise((resolveReady, rejectReady) => {
			const timeout = setTimeout(() => rejectReady(/* @__PURE__ */ new Error(`kernel bridge start timed out; ${this.stderrTail(handle)}`)), 3e4);
			const check = () => {
				if (this.handle !== handle) {
					clearTimeout(timeout);
					rejectReady(/* @__PURE__ */ new Error("kernel bridge replaced before ready"));
					return;
				}
				if (this.readySignal === "ready") {
					clearTimeout(timeout);
					resolveReady();
				} else if (this.readySignal === "error") {
					clearTimeout(timeout);
					rejectReady(new Error(this.readyError ?? "kernel bridge failed to start"));
				}
			};
			const timer = setInterval(check, 25);
			const clear = () => {
				clearInterval(timer);
				clearTimeout(timeout);
			};
			const onDone = () => {
				clear();
				if (this.readySignal !== "ready") rejectReady(/* @__PURE__ */ new Error(`kernel bridge exited before ready; ${this.stderrTail(handle)}`));
			};
			handle.done.then(onDone, onDone);
		});
	}
	/** The collected stderr tail (diagnostics only). */
	stderrTail(handle) {
		try {
			return handle.collected.stderr?.readFrom(0).text ?? "";
		} catch {
			return "";
		}
	}
	/** Consume stdout events and dispatch by id. */
	async drain(handle) {
		const stdout = handle.stdout;
		if (stdout === void 0) return;
		for await (const line of lines(stdout)) {
			let event;
			try {
				event = JSON.parse(line);
			} catch {
				continue;
			}
			if (event.type === "ready") {
				this.readySignal = "ready";
				continue;
			}
			if (event.type === "error" && event.id === "") {
				this.readySignal = "error";
				this.readyError = event.message;
				continue;
			}
			if (event.type === "output") {
				const pending = event.id === void 0 ? void 0 : this.pending.get(event.id);
				if (pending !== void 0 && event.output !== void 0) try {
					pending.onOutput(event.output);
				} catch {}
				continue;
			}
			if (event.type === "done" && event.id !== void 0) {
				const pending = this.pending.get(event.id);
				if (pending !== void 0) {
					this.pending.delete(event.id);
					pending.resolve({
						executionCount: event.execution_count ?? null,
						status: event.status === "error" ? "error" : "ok"
					});
				}
				continue;
			}
			if (event.type === "error" && event.id !== void 0) {
				const pending = this.pending.get(event.id);
				if (pending !== void 0) {
					this.pending.delete(event.id);
					pending.reject(new Error(event.message ?? "kernel execution failed"));
				}
				continue;
			}
		}
		if (this.handle === handle) {
			this.handle = void 0;
			this.readySignal = void 0;
			this.rejectAll(`kernel bridge exited; ${this.stderrTail(handle)}`);
		}
	}
	/** Send one JSONL request to the bridge. */
	send(request) {
		if (this.handle === void 0 || this.handle.stdin === void 0) return;
		this.handle.stdin.write(JSON.stringify(request) + "\n");
	}
};
/**
* Session registry: owns every live kernel session and cleans them all up on
* plugin dispose.
*/
var KernelSessionManager = class {
	ctx;
	bridgeScript;
	sessions = /* @__PURE__ */ new Map();
	constructor(ctx, bridgeScript) {
		this.ctx = ctx;
		this.bridgeScript = bridgeScript;
	}
	/** Get (or lazily create) the session for one notebook and interpreter. */
	session(scope, path, python) {
		const selected = python === "" ? void 0 : python;
		const key = `${scope.sessionId}\u0000${path}`;
		let session = this.sessions.get(key);
		if (session !== void 0 && session.python !== selected) {
			session.dispose();
			this.sessions.delete(key);
			session = void 0;
		}
		if (session === void 0) {
			session = new KernelSession(this.ctx, this.bridgeScript, scope, path, selected);
			this.sessions.set(key, session);
		}
		return session;
	}
	/** Return an existing session without creating one (control ops on idle sessions). */
	existingSession(scope, path) {
		return this.sessions.get(`${scope.sessionId}\u0000${path}`);
	}
	/** Dispose one session (e.g. notebook switch). */
	disposeSession(scope, path) {
		const key = `${scope.sessionId}\u0000${path}`;
		const session = this.sessions.get(key);
		if (session === void 0) return { wasAlive: false };
		this.sessions.delete(key);
		return session.dispose();
	}
	/** Dispose every session (plugin teardown). */
	disposeAll() {
		for (const session of this.sessions.values()) session.dispose();
		this.sessions.clear();
	}
	/** Session count (diagnostics). */
	get size() {
		return this.sessions.size;
	}
};
//#endregion
//#region src/host/routes.ts
const OK = (value) => ({
	ok: true,
	value
});
const FAIL = (error) => ({
	ok: false,
	error
});
/** Structural request failure. */
const BAD_REQUEST = {
	code: "internal",
	message: "malformed request"
};
/** Loopback trust fence: a loopback socket AND a loopback Host header. */
function isLoopbackRequest(request) {
	const address = request.socket.remoteAddress;
	if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") return false;
	const host = request.headers.host;
	if (typeof host !== "string") return false;
	let hostUrl;
	try {
		hostUrl = new URL(`http://${host}`);
	} catch {
		return false;
	}
	if (hostUrl.hostname !== "127.0.0.1" && hostUrl.hostname !== "localhost" && hostUrl.hostname !== "[::1]") return false;
	if (request.headers["sec-fetch-site"] === "cross-site") return false;
	const origin = request.headers.origin;
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === hostUrl.host;
	} catch {
		return false;
	}
}
/** Write the shared non-loopback rejection. */
function forbidden(res) {
	res.writeHead(403, { "content-type": "application/json; charset=utf-8" });
	res.end(JSON.stringify({ error: "forbidden: loopback-only" }));
}
/** Read a JSON request body into an unknown value; null when unparseable/too big. */
async function readJsonBody(req) {
	const chunks = [];
	let total = 0;
	for await (const chunk of req) {
		const buffer = chunk;
		chunks.push(buffer);
		total += buffer.length;
		if (total > 8 << 20) return null;
	}
	const text = Buffer.concat(chunks).toString("utf8");
	if (text === "") return null;
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}
/** Extract the required string field from a JSON object payload. */
function strField(payload, key) {
	if (typeof payload !== "object" || payload === null) return null;
	const value = payload[key];
	return typeof value === "string" && value !== "" ? value : null;
}
/** Optional string field. */
function optionalStr(payload, key) {
	if (typeof payload !== "object" || payload === null) return void 0;
	const value = payload[key];
	return typeof value === "string" && value !== "" ? value : void 0;
}
/** Write one JSON envelope response. */
function json(res, envelope, status = 200) {
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(envelope));
}
/** Write one NDJSON event line. */
function ndjson(res, event) {
	if (res.writableEnded) return;
	res.write(JSON.stringify(event) + "\n");
}
/** Resolve the Session scope for a request payload, or answer and return undefined. */
async function scopeOf(ctx, res, sessionId) {
	if (sessionId === null) {
		json(res, FAIL(BAD_REQUEST));
		return;
	}
	const scope = await resolveScope(ctx, sessionId);
	if (!scope.ok) {
		json(res, FAIL(scope.error));
		return;
	}
	return scope.scope;
}
/**
* Register the /dsh-jupyter routes.
* @param ctx - context carrying webServer, fs, and sessions.
* @param notebooks - the notebook file service.
* @param kernels - the kernel session registry.
* @returns the route disposer.
*/
function registerJupyterRoutes(ctx, notebooks, kernels) {
	const handler = async (req, res) => {
		if (!isLoopbackRequest(req)) {
			forbidden(res);
			return;
		}
		if (req.method === "GET") {
			const url = new URL(req.url ?? "/", "http://x");
			if (url.pathname === "/dsh-jupyter/interpreters") {
				json(res, OK(await listInterpreters(ctx)));
				return;
			}
			if (url.pathname === "/dsh-jupyter/raw") {
				const scope = await scopeOf(ctx, res, url.searchParams.get("sessionId"));
				if (scope === void 0) return;
				const path = url.searchParams.get("path");
				if (path === null || path === "") {
					json(res, FAIL(BAD_REQUEST), 400);
					return;
				}
				const result = await notebooks.readRaw(scope, path);
				if (!("data" in result)) {
					json(res, FAIL(result), result.code === "path-outside-root" ? 403 : 404);
					return;
				}
				res.writeHead(200, {
					"content-type": result.mime,
					"content-length": result.data.byteLength,
					"cache-control": "no-cache",
					"x-content-type-options": "nosniff"
				});
				res.end(result.data);
				return;
			}
			res.writeHead(405);
			res.end();
			return;
		}
		if (req.method !== "POST") {
			res.writeHead(405);
			res.end();
			return;
		}
		if (!(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
			json(res, FAIL(BAD_REQUEST), 415);
			return;
		}
		const pathname = new URL(req.url ?? "/", "http://x").pathname;
		const payload = await readJsonBody(req);
		if (payload === null) {
			json(res, FAIL(BAD_REQUEST));
			return;
		}
		const scope = await scopeOf(ctx, res, strField(payload, "sessionId"));
		if (scope === void 0) return;
		const path = strField(payload, "path");
		if (path === null) {
			json(res, FAIL(BAD_REQUEST));
			return;
		}
		switch (pathname) {
			case "/dsh-jupyter/read": {
				const result = await notebooks.read(scope, path);
				json(res, "cells" in result ? OK(result) : FAIL(result));
				return;
			}
			case "/dsh-jupyter/create": {
				const overwrite = payload.overwrite === true;
				const result = await notebooks.create(scope, path, overwrite);
				json(res, "cells" in result ? OK(result) : FAIL(result));
				return;
			}
			case "/dsh-jupyter/write": {
				const rawNotebook = payload.notebook;
				if (rawNotebook === void 0) {
					json(res, FAIL(BAD_REQUEST));
					return;
				}
				const result = await notebooks.write(scope, path, rawNotebook, optionalStr(payload, "baseVersion"));
				json(res, "version" in result ? OK(result) : FAIL(result));
				return;
			}
			case "/dsh-jupyter/execute": {
				const code = strField(payload, "code");
				const cellId = strField(payload, "cellId");
				if (code === null || cellId === null) {
					json(res, FAIL(BAD_REQUEST));
					return;
				}
				const python = optionalStr(payload, "python");
				if (!await isKnownInterpreter(ctx, python)) {
					json(res, FAIL({
						code: "kernel-unavailable",
						message: `unknown Python interpreter: ${python ?? ""}`
					}));
					return;
				}
				res.writeHead(200, {
					"content-type": "application/x-ndjson; charset=utf-8",
					"cache-control": "no-cache",
					connection: "keep-alive"
				});
				const session = kernels.session(scope, path, python);
				try {
					const result = await session.execute(code, (output) => {
						ndjson(res, {
							kind: "output",
							cellId,
							output
						});
					});
					ndjson(res, {
						kind: "done",
						cellId,
						executionCount: result.executionCount,
						status: result.status
					});
				} catch (error) {
					ndjson(res, {
						kind: "error",
						message: error instanceof Error ? error.message : String(error)
					});
				}
				res.end();
				return;
			}
			case "/dsh-jupyter/text-read": {
				const result = await notebooks.readTextFile(scope, path);
				json(res, "text" in result ? OK(result) : FAIL(result));
				return;
			}
			case "/dsh-jupyter/text-write": {
				const text = payload.text;
				if (typeof text !== "string") {
					json(res, FAIL(BAD_REQUEST));
					return;
				}
				const result = await notebooks.writeTextFile(scope, path, text, optionalStr(payload, "baseVersion"));
				json(res, "version" in result ? OK(result) : FAIL(result));
				return;
			}
			case "/dsh-jupyter/interrupt":
				kernels.existingSession(scope, path)?.interrupt();
				json(res, OK({ ok: true }));
				return;
			case "/dsh-jupyter/restart":
				kernels.existingSession(scope, path)?.restart();
				json(res, OK({ ok: true }));
				return;
			case "/dsh-jupyter/dispose-session":
				kernels.disposeSession(scope, path);
				json(res, OK({ ok: true }));
				return;
			default:
				res.writeHead(404);
				res.end();
		}
	};
	return ctx.webServer.register({
		kind: "prefix",
		path: "/dsh-jupyter",
		handler
	});
}
//#endregion
//#region src/index.ts
/**
* @kikulmj/dsh-jupyter — host half: the Session-scoped notebook file
* service and the /dsh-jupyter/* HTTP routes (read/write/raw + NDJSON
* streaming cell execution through the Python bridge) on the shared
* webserver. The browser half (exports "./client") registers the notebook as a
* native right-sidebar tab type for `.ipynb` files.
*
* The host half also announces the plugin to every agent through the
* system-prompt section mechanism.
* @module @kikulmj/dsh-jupyter
*/
/** Required services: routes, managed subprocesses, filesystem, sessions, sandbox policy, and the prompt band. */
const inject = [
	"webServer",
	"subprocess",
	"fs",
	"sessions",
	"sandboxPolicy",
	"systemPrompt"
];
/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 215;
/** Model-facing announcement: plugin presence, capabilities, and limits. */
const JUPYTER_GUIDANCE = "本机已安装 dsh-jupyter 插件（Jupyter notebook 预览/编辑/运行）：在 Web GUI 右侧文件树中点击工作区内的 .ipynb 文件，会在右侧边栏（与文本预览同一个标签系统）打开笔记本标签页；可编辑 code/markdown/raw 单元格、增删排序单元格、保存回磁盘（带磁盘版本冲突检查）。代码单元格由宿主进程的 Python 内核执行（使用 dsh 自带 Python，内核状态在单元格间共享），流式渲染 stdout/stderr、HTML、Markdown、PNG/JPEG/SVG 图片、JSON 和错误回溯，支持中断与重启内核；支持 !命令、%pip、%cd、%pwd 等常用行内魔法（不支持 input() 和 %% 单元格魔法）；工具栏「内核环境」可选择 dsh 自带 Python 或 ~/.conda/environments.txt 中的 conda 环境，切换会重启内核，而 !conda activate 不会改变内核。插件也接管常见代码/配置文件（.py/.js/.ts/.json/.yaml/.txt 等）的右侧标签页编辑与保存；markdown/HTML/图片/Office 仍由官方预览处理。宿主端经 /dsh-jupyter/* 路由提供，所有读写都按 Session 工作区做边界检查并走统一的文件系统/沙箱策略。用户提到「jupyter / notebook / .ipynb / 笔记本单元格 / 运行单元格」时即指本插件，请据此协作；执行会真实消耗本机资源，先确认再操作。";
/**
* Mount the notebook services and routes.
* @param ctx - context carrying webServer, subprocess, fs, sessions, systemPrompt.
*/
function apply(ctx) {
	const notebooks = new NotebookService(ctx);
	const kernels = new KernelSessionManager(ctx, fileURLToPath(new URL("./kernel_bridge.py", import.meta.url)));
	ctx.effect(() => registerJupyterRoutes(ctx, notebooks, kernels), "dsh-jupyter: /dsh-jupyter routes");
	ctx.effect(() => () => kernels.disposeAll(), "dsh-jupyter: kernel sessions");
	ctx.effect(() => ctx.systemPrompt.section({
		name: "plugin:dsh-jupyter",
		order: SECTION_ORDER,
		text: JUPYTER_GUIDANCE
	}), "dsh-jupyter: prompt section");
}
//#endregion
export { JUPYTER_GUIDANCE, apply, inject };
