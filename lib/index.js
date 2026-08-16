import { createRequire } from "node:module";
import { mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { constants, homedir } from "node:os";
import { randomBytes } from "node:crypto";
//#region src/host/gate.ts
/**
* Workspace gate for the /dsh-jupyter routes: canonicalize the requested
* project root and require it to be a registered workspace (or a directory
* inside one). This is the security boundary of the notebook routes — the
* browser may only read and mutate files under registered workspace roots,
* never arbitrary host directories. Mirrors the aionui-panel gate.
* @module dsh-jupyter/host/gate
*/
/** Normalize a path for prefix comparison (forward slashes, no trailing slash). */
function normalizeForPrefix(value) {
	const normalized = value.replaceAll("\\", "/").replace(/\/+$/, "");
	return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
/** True when `child` lives inside (or equals) `root`, separator-robust. */
function isPathInside(root, child) {
	if (root === "" || child === "") return false;
	const normRoot = normalizeForPrefix(root);
	const normChild = normalizeForPrefix(child);
	if (normChild === normRoot) return true;
	return normChild.startsWith(`${normRoot}/`);
}
/** Production gate: canonicalize the root and require workspace membership. */
function createWorkspaceGate(ctx) {
	return async (root) => {
		if (typeof root !== "string" || root === "") return {
			ok: false,
			error: {
				code: "workspace-unknown",
				message: "empty project root"
			}
		};
		let canonical;
		try {
			canonical = await realpath(root);
		} catch {
			return {
				ok: false,
				error: {
					code: "workspace-unknown",
					message: "path does not resolve on disk"
				}
			};
		}
		const workspaces = ctx.workspaceRegistry.list();
		for (const workspace of workspaces) if (isPathInside(workspace.path, canonical)) return {
			ok: true,
			canonical
		};
		return {
			ok: false,
			error: {
				code: "workspace-unknown",
				message: "path is not inside a registered workspace"
			}
		};
	};
}
//#endregion
//#region src/host/notebook-service.ts
/**
* Notebook file service: read/write/list .ipynb files inside a gated project
* root. Reads parse nbformat 4 and normalize cells (source joined to a
* string, stable ids); writes serialize back with an mtime conflict check.
* @module dsh-jupyter/host/notebook-service
*/
/** Notebook size cap (parse budget for the panel). */
const NOTEBOOK_CAP_BYTES = 32 << 20;
/** Recursive listing caps for notebook discovery. */
const LIST_SCAN_CAP = 2e4;
const LIST_HIT_CAP = 500;
/** Directories skipped by the recursive notebook listing. */
const LIST_SKIP_DIRS = /* @__PURE__ */ new Set([".git", "node_modules"]);
/**
* Resolve a workspace-relative path against the canonical root, refusing to
* escape it (realpath check on the nearest existing ancestor, so a symlink
* cannot smuggle the operation outside the root).
*/
async function resolveInsideRoot(root, rel) {
	if (rel.includes("\0")) return {
		ok: false,
		error: {
			code: "path-outside-root",
			message: "invalid path"
		}
	};
	const abs = join(root, rel);
	if (!isPathInside(root, abs)) return {
		ok: false,
		error: {
			code: "path-outside-root",
			message: `path escapes root: ${rel}`
		}
	};
	let probe = abs;
	for (let hop = 0; hop < 32; hop += 1) {
		let real;
		try {
			real = await realpath(probe);
		} catch (error) {
			if (error.code !== "ENOENT") return {
				ok: true,
				abs
			};
			const parent = dirname(probe);
			if (parent === probe) return {
				ok: true,
				abs
			};
			probe = parent;
			continue;
		}
		if (!isPathInside(root, real)) return {
			ok: false,
			error: {
				code: "path-outside-root",
				message: `path resolves outside root: ${rel}`
			}
		};
		return {
			ok: true,
			abs
		};
	}
	return {
		ok: false,
		error: {
			code: "path-outside-root",
			message: "path cannot be resolved"
		}
	};
}
/** True when the relative path passes through a .git component. */
function isGitPath(rel) {
	return rel.split("/").some((part) => part.toLowerCase() === ".git");
}
/** Derive a mime type from a file extension (image focus, like the panel). */
function mimeOf(rel) {
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
	}[rel.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}
/** Join a cell source that may be a string or an array of lines. */
function sourceToString(source) {
	if (typeof source === "string") return source;
	if (Array.isArray(source)) return source.map((line) => typeof line === "string" ? line : "").join("");
	return "";
}
/** Parse and normalize a notebook JSON value into the panel's view. */
function parseNotebook(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return {
		code: "not-notebook",
		message: "notebook must be a JSON object"
	};
	const nb = value;
	if (nb.nbformat !== 4) return {
		code: "not-notebook",
		message: "only nbformat 4 notebooks are supported"
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
/**
* Notebook file service: gated read/write/list of .ipynb files.
* @param gate - the workspace gate.
*/
var NotebookService = class {
	gate;
	constructor(gate) {
		this.gate = gate;
	}
	/** Verify a root (used by the kernel layer before opening a session). */
	verify(root) {
		return this.gate(root);
	}
	/**
	* Read one workspace file's raw bytes (markdown image srcs in cells).
	* Gated and traversal-guarded; the bytes go out with the derived mime so
	* an <img> can load them.
	*/
	async readRaw(root, rel) {
		const gated = await this.gate(root);
		if (!gated.ok) return gated.error;
		if (isGitPath(rel)) return {
			code: "path-outside-root",
			message: "refusing to read .git"
		};
		const resolved = await resolveInsideRoot(gated.canonical, rel);
		if (!resolved.ok) return resolved.error;
		let data;
		let info;
		try {
			info = await stat(resolved.abs);
		} catch {
			return {
				code: "not-found",
				message: `cannot read ${rel}`
			};
		}
		if (info.isDirectory()) return {
			code: "not-found",
			message: `${rel} is a directory`
		};
		try {
			data = await readFile(resolved.abs);
		} catch {
			return {
				code: "not-found",
				message: `cannot read ${rel}`
			};
		}
		return {
			data,
			mime: mimeOf(rel),
			size: data.length
		};
	}
	/** Read and parse one notebook file. */
	async read(root, rel) {
		const gated = await this.gate(root);
		if (!gated.ok) return gated.error;
		if (isGitPath(rel)) return {
			code: "path-outside-root",
			message: "refusing to read .git"
		};
		const resolved = await resolveInsideRoot(gated.canonical, rel);
		if (!resolved.ok) return resolved.error;
		let data;
		let info;
		try {
			info = await stat(resolved.abs);
		} catch {
			return {
				code: "not-found",
				message: `cannot stat ${rel}`
			};
		}
		if (info.isDirectory()) return {
			code: "not-found",
			message: `${rel} is a directory`
		};
		if (info.size > NOTEBOOK_CAP_BYTES) return {
			code: "not-notebook",
			message: "notebook exceeds read cap"
		};
		try {
			data = await readFile(resolved.abs);
		} catch {
			return {
				code: "not-found",
				message: `cannot read ${rel}`
			};
		}
		let parsed;
		try {
			parsed = JSON.parse(data.toString("utf8"));
		} catch {
			return {
				code: "not-notebook",
				message: `${rel} is not valid JSON`
			};
		}
		const result = parseNotebook(parsed);
		if ("code" in result) return result;
		return {
			path: rel,
			cells: result.cells.map((cell) => ({
				...cell,
				path: rel
			})),
			metadata: result.metadata,
			mtime: info.mtimeMs
		};
	}
	/** Write the notebook back, refusing when the file moved on disk. */
	async write(root, rel, value, baseMtime) {
		const gated = await this.gate(root);
		if (!gated.ok) return gated.error;
		if (isGitPath(rel)) return {
			code: "path-outside-root",
			message: "refusing to touch .git"
		};
		const resolved = await resolveInsideRoot(gated.canonical, rel);
		if (!resolved.ok) return resolved.error;
		const parsed = parseNotebook(value);
		if ("code" in parsed) return parsed;
		const payload = serializeNotebook({
			cells: parsed.cells,
			metadata: parsed.metadata
		});
		try {
			let current;
			try {
				current = await stat(resolved.abs);
			} catch {
				current = { mtimeMs: 0 };
			}
			if (baseMtime !== void 0 && Number(current.mtimeMs) !== 0 && Math.abs(Number(current.mtimeMs) - baseMtime) > 1) return {
				code: "write-conflict",
				message: "file changed on disk since it was loaded"
			};
			await mkdir(dirname(resolved.abs), { recursive: true });
			await writeFile(resolved.abs, JSON.stringify(payload, null, 1) + "\n", "utf8");
			return { mtime: (await stat(resolved.abs)).mtimeMs };
		} catch {
			return {
				code: "write-failed",
				message: `cannot write ${rel}`
			};
		}
	}
	/** Recursively list *.ipynb files under the root (pruned at noise dirs). */
	async listNotebooks(root) {
		const gated = await this.gate(root);
		if (!gated.ok) return gated.error;
		const hits = [];
		let scanned = 0;
		let truncated = false;
		const walk = async (rel, depth) => {
			if (truncated) return;
			const resolved = await resolveInsideRoot(gated.canonical, rel);
			if (!resolved.ok) return;
			let dirents;
			try {
				dirents = await readdir(resolved.abs, { withFileTypes: true });
			} catch {
				return;
			}
			for (const entry of dirents) {
				if (scanned >= LIST_SCAN_CAP) {
					truncated = true;
					return;
				}
				scanned += 1;
				const entryName = entry.name;
				const path = rel === "" ? entryName : `${rel}/${entryName}`;
				if (entry.isDirectory()) {
					if (LIST_SKIP_DIRS.has(entryName)) continue;
					if (depth < 24 && !truncated) await walk(path, depth + 1);
					continue;
				}
				if (entryName.toLowerCase().endsWith(".ipynb")) {
					if (hits.length >= LIST_HIT_CAP) {
						truncated = true;
						return;
					}
					hits.push({
						path,
						name: entryName
					});
				}
			}
		};
		try {
			await walk("", 0);
		} catch {
			return {
				code: "internal",
				message: "listing walk failed"
			};
		}
		hits.sort((a, b) => a.path < b.path ? -1 : 1);
		return hits;
	}
};
//#endregion
//#region src/host/kernel.ts
const nodeRequire = createRequire(import.meta.url);
/** Production spawn over the subprocess service. */
function defaultSpawnKernel(ctx) {
	return (spec) => ctx.subprocess.spawn(spec);
}
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
	root;
	rel;
	notebookService;
	spawnKernel;
	bridgeScript;
	getKernelName;
	handle;
	pending = /* @__PURE__ */ new Map();
	queue = [];
	requestSeq = 0;
	shutdownRequested = false;
	starting;
	constructor(root, rel, notebookService, spawnKernel, bridgeScript, getKernelName) {
		this.root = root;
		this.rel = rel;
		this.notebookService = notebookService;
		this.spawnKernel = spawnKernel;
		this.bridgeScript = bridgeScript;
		this.getKernelName = getKernelName;
	}
	/** The canonical notebook path this session is bound to. */
	get boundPath() {
		return `${this.root}\u0000${this.rel}`;
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
	/** Restart the kernel bridge (fresh kernel state). */
	restart() {
		if (!this.alive) return;
		this.send({
			op: "restart",
			id: String(this.requestSeq++)
		});
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
		for (const pending of this.pending.values()) pending.reject(/* @__PURE__ */ new Error("kernel session closed"));
		this.pending.clear();
		for (const pending of this.queue.splice(0)) pending.reject(/* @__PURE__ */ new Error("kernel session closed"));
		return { wasAlive };
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
		const gated = await this.notebookService.verify(this.root);
		if (!gated.ok) throw new Error(gated.error.message);
		const cwd = dirname(nodeRequire("node:path").join(gated.canonical, this.rel));
		const spec = {
			argv: [
				"python3",
				this.bridgeScript,
				"--kernel",
				this.getKernelName(),
				"--cwd",
				cwd
			],
			cwd: gated.canonical,
			stdio: {
				stdin: "pipe",
				stdout: "pipe",
				stderr: { maxBytes: 64 * 1024 }
			},
			graceMs: 1e4
		};
		const handle = this.spawnKernel(spec);
		this.handle = handle;
		this.shutdownRequested = false;
		const ready = this.waitForReady(handle);
		this.drain(handle);
		await ready;
	}
	/** Wait until the bridge emits `ready` (or an error event / timeout). */
	waitForReady(handle) {
		return new Promise((resolveReady, rejectReady) => {
			const timeout = setTimeout(() => rejectReady(/* @__PURE__ */ new Error("kernel bridge start timed out")), 3e4);
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
			check();
			const clear = () => {
				clearInterval(timer);
				clearTimeout(timeout);
			};
			const onDone = () => {
				clear();
				if (this.readySignal !== "ready") rejectReady(/* @__PURE__ */ new Error(`kernel bridge exited before ready; ${this.stderrTail}`));
			};
			handle.done.then(onDone, onDone);
		});
	}
	/** Ready signal set by the drain (ready / error / undefined). */
	readySignal;
	readyError;
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
	}
	/** Send one JSONL request to the bridge. */
	send(request) {
		if (this.handle === void 0 || this.handle.stdin === void 0) return;
		this.handle.stdin.write(JSON.stringify(request) + "\n");
	}
	/** Last stderr tail (populated by the exit handler for diagnostics). */
	stderrTail = "";
};
/**
* Session registry: owns every live kernel session and cleans them all up on
* plugin dispose.
*/
var KernelSessionManager = class {
	notebookService;
	spawnKernel;
	bridgeScript;
	getKernelName;
	sessions = /* @__PURE__ */ new Map();
	constructor(notebookService, spawnKernel, bridgeScript, getKernelName) {
		this.notebookService = notebookService;
		this.spawnKernel = spawnKernel;
		this.bridgeScript = bridgeScript;
		this.getKernelName = getKernelName;
	}
	/** Get (or lazily create) the session for a notebook path. */
	async session(root, rel) {
		const key = `${root}\u0000${rel}`;
		let session = this.sessions.get(key);
		if (session === void 0) {
			let kernelName = "python3";
			const view = await this.notebookService.read(root, rel);
			if (!("code" in view)) kernelName = this.getKernelName(view);
			session = new KernelSession(root, rel, this.notebookService, this.spawnKernel, this.bridgeScript, () => kernelName);
			this.sessions.set(key, session);
		}
		return session;
	}
	/** Return an existing session without creating one (control ops on idle sessions). */
	existingSession(root, rel) {
		return this.sessions.get(`${root}\u0000${rel}`);
	}
	/** Dispose one session (e.g. notebook switch). */
	disposeSession(root, rel) {
		const key = `${root}\u0000${rel}`;
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
const OK$1 = (value) => ({
	ok: true,
	value
});
const FAIL$1 = (error) => ({
	ok: false,
	error
});
/** Structural request failure (never a workspace fault). */
const BAD_REQUEST$1 = {
	code: "internal",
	message: "malformed request"
};
/** Loopback trust fence: a loopback socket AND a loopback Host header. */
function isLoopbackRequest$1(request) {
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
function forbidden$1(res) {
	res.writeHead(403, { "content-type": "application/json; charset=utf-8" });
	res.end(JSON.stringify({ error: "forbidden: loopback-only" }));
}
/** Read a JSON request body into an unknown value; null when unparseable/too big. */
async function readJsonBody$1(req) {
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
function strField$1(payload, key) {
	if (typeof payload !== "object" || payload === null) return null;
	const value = payload[key];
	return typeof value === "string" && value !== "" ? value : null;
}
/** Write one JSON envelope response. */
function json$1(res, envelope, status = 200) {
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(envelope));
}
/** Write one NDJSON event line. */
function ndjson$1(res, event) {
	res.write(JSON.stringify(event) + "\n");
}
/** Extract the kernel name from a notebook's kernelspec metadata (default python3). */
function kernelNameOf(metadata) {
	const spec = metadata.kernelspec;
	if (typeof spec === "object" && spec !== null) {
		const name = spec.name;
		if (typeof name === "string" && name !== "") return name;
	}
	const language = metadata.language_info;
	if (typeof language === "object" && language !== null) {
		const name = language.name;
		if (typeof name === "string" && name.toLowerCase() === "javascript") return "node";
	}
	return "python3";
}
/**
* Register the /dsh-jupyter routes.
* @param ctx - context carrying the webServer service.
* @param notebooks - the gated notebook file service.
* @param kernels - the kernel session registry.
* @returns the route disposers.
*/
function registerJupyterRoutes(ctx, notebooks, kernels) {
	const handler = async (req, res) => {
		if (!isLoopbackRequest$1(req)) {
			forbidden$1(res);
			return;
		}
		if (req.method === "GET") {
			const url = new URL(req.url ?? "/", "http://x");
			if (url.pathname === "/dsh-jupyter/raw") {
				const root = url.searchParams.get("root");
				const path = url.searchParams.get("path");
				if (root === null || root === "" || path === null || path === "") {
					json$1(res, FAIL$1(BAD_REQUEST$1), 400);
					return;
				}
				const result = await notebooks.readRaw(root, path);
				if (!("data" in result)) {
					json$1(res, FAIL$1(result), result.code === "path-outside-root" ? 403 : 404);
					return;
				}
				res.writeHead(200, {
					"content-type": result.mime,
					"content-length": result.size,
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
			json$1(res, FAIL$1(BAD_REQUEST$1), 415);
			return;
		}
		const pathname = new URL(req.url ?? "/", "http://x").pathname;
		const payload = await readJsonBody$1(req);
		if (payload === null) {
			json$1(res, FAIL$1(BAD_REQUEST$1));
			return;
		}
		const root = strField$1(payload, "root");
		if (root === null) {
			json$1(res, FAIL$1(BAD_REQUEST$1));
			return;
		}
		switch (pathname) {
			case "/dsh-jupyter/read": {
				const path = strField$1(payload, "path");
				if (path === null) {
					json$1(res, FAIL$1(BAD_REQUEST$1));
					return;
				}
				const result = await notebooks.read(root, path);
				json$1(res, "path" in result ? OK$1(result) : FAIL$1(result));
				return;
			}
			case "/dsh-jupyter/write": {
				const path = strField$1(payload, "path");
				const rawNotebook = typeof payload === "object" && payload !== null ? payload.notebook : void 0;
				if (path === null || rawNotebook === void 0) {
					json$1(res, FAIL$1(BAD_REQUEST$1));
					return;
				}
				const rawBase = typeof payload === "object" && payload !== null ? payload.baseMtime : void 0;
				const baseMtime = typeof rawBase === "number" && Number.isFinite(rawBase) ? rawBase : void 0;
				const result = await notebooks.write(root, path, rawNotebook, baseMtime);
				json$1(res, "mtime" in result ? OK$1(result) : FAIL$1(result));
				return;
			}
			case "/dsh-jupyter/list": {
				const result = await notebooks.listNotebooks(root);
				json$1(res, Array.isArray(result) ? OK$1(result) : FAIL$1(result));
				return;
			}
			case "/dsh-jupyter/execute": {
				const path = strField$1(payload, "path");
				const code = strField$1(payload, "code");
				const cellId = strField$1(payload, "cellId");
				if (path === null || code === null || cellId === null) {
					json$1(res, FAIL$1(BAD_REQUEST$1));
					return;
				}
				const gated = await notebooks.verify(root);
				if (!gated.ok) {
					json$1(res, FAIL$1(gated.error));
					return;
				}
				res.writeHead(200, {
					"content-type": "application/x-ndjson; charset=utf-8",
					"cache-control": "no-cache",
					connection: "keep-alive"
				});
				const session = await kernels.session(root, path);
				try {
					const result = await session.execute(code, (output) => {
						ndjson$1(res, {
							kind: "output",
							cellId,
							output
						});
					});
					ndjson$1(res, {
						kind: "done",
						cellId,
						executionCount: result.executionCount,
						status: result.status
					});
				} catch (error) {
					ndjson$1(res, {
						kind: "error",
						message: error instanceof Error ? error.message : String(error)
					});
				}
				res.end();
				return;
			}
			case "/dsh-jupyter/interrupt": {
				const path = strField$1(payload, "path");
				if (path === null) {
					json$1(res, FAIL$1(BAD_REQUEST$1));
					return;
				}
				kernels.existingSession(root, path)?.interrupt();
				json$1(res, OK$1({ ok: true }));
				return;
			}
			case "/dsh-jupyter/restart": {
				const path = strField$1(payload, "path");
				if (path === null) {
					json$1(res, FAIL$1(BAD_REQUEST$1));
					return;
				}
				kernels.existingSession(root, path)?.restart();
				json$1(res, OK$1({ ok: true }));
				return;
			}
			case "/dsh-jupyter/dispose-session": {
				const path = strField$1(payload, "path");
				if (path === null) {
					json$1(res, FAIL$1(BAD_REQUEST$1));
					return;
				}
				kernels.disposeSession(root, path);
				json$1(res, OK$1({ ok: true }));
				return;
			}
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
//#region src/host/terminal.ts
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
/** The node-pty module (spawned synchronously; the native binary ships prebuilt/built in the profile). */
const nodePty = createRequire(import.meta.url)("node-pty");
/** Bounded scrollback buffer: keeps the tail so a late/re-attaching stream replays recent output. */
var OutputBuffer = class {
	maxBytes;
	chunks = [];
	bytes = 0;
	dropped = false;
	constructor(maxBytes) {
		this.maxBytes = maxBytes;
	}
	append(data) {
		if (data.length === 0) return;
		this.chunks.push(data);
		this.bytes += Buffer.byteLength(data, "utf8");
		while (this.bytes > this.maxBytes && this.chunks.length > 1) {
			const removed = this.chunks.shift();
			this.bytes -= Buffer.byteLength(removed, "utf8");
			this.dropped = true;
		}
	}
	/** The accumulated tail as one string (may be empty). */
	snapshot() {
		return this.chunks.join("");
	}
	/** Whether the snapshot was truncated (the head was dropped). */
	wasTruncated() {
		return this.dropped;
	}
	reset() {
		this.chunks = [];
		this.bytes = 0;
		this.dropped = false;
	}
};
/** Resolve the default shell program from $SHELL (validated) else /bin/bash. */
function resolveShell() {
	const candidate = process.env.SHELL;
	if (typeof candidate === "string" && candidate !== "") return candidate;
	return process.platform === "win32" ? "cmd.exe" : "/bin/bash";
}
/** Whether a path is an existing directory (used to validate the requested cwd). */
async function isDirectory(path) {
	try {
		return (await stat(path)).isDirectory();
	} catch {
		return false;
	}
}
/** One live terminal session (one PTY + its listeners + scrollback). */
var TerminalSession = class TerminalSession {
	id;
	cwd;
	shell;
	pty;
	dataDisposable;
	exitDisposable;
	output = new OutputBuffer(2 << 20);
	listeners = /* @__PURE__ */ new Set();
	exited = false;
	exitResult;
	constructor(id, shell, cwd, cols, rows) {
		this.id = id;
		this.shell = shell;
		this.cwd = cwd;
		this.pty = nodePty.spawn(shell, ["-l"], {
			name: "xterm-256color",
			cols,
			rows,
			cwd,
			env: process.env
		});
		this.dataDisposable = this.pty.onData((data) => this.deliver({
			kind: "output",
			data
		}));
		this.exitDisposable = this.pty.onExit(({ exitCode, signal }) => {
			this.exited = true;
			this.exitResult = {
				exitCode: typeof exitCode === "number" ? exitCode : null,
				signal: typeof signal === "number" && signal !== 0 ? signalName(signal) : null
			};
			this.deliver({
				kind: "exited",
				exitCode: this.exitResult.exitCode,
				signal: this.exitResult.signal
			});
		});
	}
	/**
	* Spawn a new session. Throws on spawn failure (the route maps this to a
	* spawn-failed envelope).
	* @param id - server-allocated session id.
	* @param requestedCwd - requested working directory (validated + realpath'd).
	* @param cols - initial column count.
	* @param rows - initial row count.
	*/
	static async create(id, requestedCwd, cols, rows) {
		const shell = resolveShell();
		let cwd = homedir();
		if (typeof requestedCwd === "string" && requestedCwd !== "" && await isDirectory(requestedCwd)) try {
			cwd = await realpath(requestedCwd);
		} catch {}
		return new TerminalSession(id, shell, cwd, cols, rows);
	}
	/** The buffered scrollback snapshot (replayed to a freshly attaching stream). */
	bufferedOutput() {
		return {
			data: this.output.snapshot(),
			truncated: this.output.wasTruncated()
		};
	}
	/** Subscribe to live events (output + exit). Returns an unsubscribe. */
	subscribe(fn) {
		this.listeners.add(fn);
		return () => {
			this.listeners.delete(fn);
		};
	}
	/** Whether the shell has exited. */
	get isExited() {
		return this.exited;
	}
	/** Write input to the PTY (no-op after exit). */
	write(data) {
		if (this.exited) return;
		try {
			this.pty.write(data);
		} catch {}
	}
	/** Resize the PTY (no-op after exit; resize failures are non-fatal). */
	resize(cols, rows) {
		if (this.exited) return;
		try {
			this.pty.resize(cols, rows);
		} catch {}
	}
	/** Clear the scrollback buffer (input/output history stays in the shell). */
	clearBuffer() {
		this.output.reset();
	}
	/** Kill the PTY and release disposables. Idempotent. */
	dispose() {
		if (!this.exited) try {
			this.pty.kill();
		} catch {}
		this.dataDisposable.dispose();
		this.exitDisposable.dispose();
		this.listeners.clear();
	}
	/** Fan an event to the buffer + every active subscriber. */
	deliver(event) {
		if (event.kind === "output") this.output.append(event.data);
		for (const fn of this.listeners) try {
			fn(event);
		} catch {}
	}
};
/** Map a numeric signal to its POSIX name (null for 0 / unknown). */
function signalName(number) {
	if (number === 0) return null;
	for (const [name, value] of Object.entries(constants.signals)) if (value === number) return name;
	return null;
}
/**
* Terminal session registry: allocates ids, owns sessions, disposes them on
* plugin unload.
* @module dsh-jupyter/host/terminal
*/
var TerminalSessionManager = class {
	sessions = /* @__PURE__ */ new Map();
	seq = 0;
	/** Create a new PTY session. */
	async create(requestedCwd, cols, rows) {
		this.seq += 1;
		const id = `${process.pid}-${this.seq}-${randomBytes(4).toString("hex")}`;
		const session = await TerminalSession.create(id, requestedCwd, cols, rows);
		this.sessions.set(id, session);
		return session;
	}
	/** Look up a session by id. */
	get(id) {
		return this.sessions.get(id);
	}
	/** Dispose one session by id (no-op if absent). Returns whether it was alive. */
	dispose(id) {
		const session = this.sessions.get(id);
		if (session === void 0) return false;
		session.dispose();
		this.sessions.delete(id);
		return true;
	}
	/** Dispose every session (plugin unload). */
	disposeAll() {
		for (const session of this.sessions.values()) session.dispose();
		this.sessions.clear();
	}
};
/** The shell basename for a created session (for the header label). */
function shellLabelOf(shell) {
	return basename(shell);
}
//#endregion
//#region src/host/terminal-routes.ts
const OK = (value) => ({
	ok: true,
	value
});
const FAIL = (error) => ({
	ok: false,
	error
});
/** Structural request failure (never a workspace fault). */
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
		if (total > 1 << 20) return null;
	}
	const text = Buffer.concat(chunks).toString("utf8");
	if (text === "") return null;
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}
/** Extract a required string field from a JSON object payload. */
function strField(payload, key) {
	if (typeof payload !== "object" || payload === null) return null;
	const value = payload[key];
	return typeof value === "string" ? value : null;
}
/** Extract an optional positive-integer field (cols/rows). */
function intField(payload, key, fallback) {
	if (typeof payload !== "object" || payload === null) return fallback;
	const value = payload[key];
	return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}
/** Write one JSON envelope response. */
function json(res, envelope, status = 200) {
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(envelope));
}
/** Write one NDJSON event line. */
function ndjson(res, event) {
	res.write(JSON.stringify(event) + "\n");
}
/** Clamp terminal dimensions into a sane range (the browser can lie). */
function clampDims(cols, rows) {
	return {
		cols: Math.min(Math.max(cols, 1), 400),
		rows: Math.min(Math.max(rows, 1), 200)
	};
}
/**
* Register the /dsh-terminal routes.
* @param ctx - context carrying the webServer service.
* @param manager - the PTY session registry.
* @returns the route disposer.
*/
function registerTerminalRoutes(ctx, manager) {
	const cssUrl = new URL("./xterm.css", import.meta.url);
	const handler = async (req, res) => {
		if (!isLoopbackRequest(req)) {
			forbidden(res);
			return;
		}
		const url = new URL(req.url ?? "/", "http://x");
		const pathname = url.pathname;
		if (req.method === "GET" && pathname === "/dsh-terminal/xterm.css") {
			try {
				const data = await readFile(cssUrl);
				res.writeHead(200, {
					"content-type": "text/css; charset=utf-8",
					"cache-control": "public, max-age=86400, immutable",
					"x-content-type-options": "nosniff"
				});
				res.end(data);
			} catch {
				res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
				res.end(JSON.stringify({ error: "xterm.css not found; rebuild the plugin" }));
			}
			return;
		}
		if (req.method === "GET" && pathname === "/dsh-terminal/stream") {
			const id = url.searchParams.get("id");
			if (id === null || id === "") {
				res.writeHead(400).end();
				return;
			}
			const session = manager.get(id);
			if (session === void 0) {
				res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
				res.end(JSON.stringify({ error: "session not found" }));
				return;
			}
			res.writeHead(200, {
				"content-type": "application/x-ndjson; charset=utf-8",
				"cache-control": "no-cache",
				connection: "keep-alive",
				"x-content-type-options": "nosniff"
			});
			const buffer = session.bufferedOutput();
			if (buffer.data !== "") ndjson(res, {
				kind: "output",
				data: buffer.data
			});
			if (buffer.truncated) ndjson(res, {
				kind: "output",
				data: "\x1B[2m…(scrollback truncated)\x1B[0m\r\n"
			});
			if (session.isExited) {
				ndjson(res, {
					kind: "exited",
					exitCode: null,
					signal: null
				});
				res.end();
				return;
			}
			const unsubscribe = session.subscribe((event) => {
				if (res.writableEnded) return;
				ndjson(res, event);
				if (event.kind === "exited") res.end();
			});
			req.on("close", () => {
				unsubscribe();
			});
			return;
		}
		if (req.method !== "POST") {
			res.writeHead(405).end();
			return;
		}
		if (!(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
			json(res, FAIL(BAD_REQUEST), 415);
			return;
		}
		const payload = await readJsonBody(req);
		if (payload === null) {
			json(res, FAIL(BAD_REQUEST));
			return;
		}
		switch (pathname) {
			case "/dsh-terminal/create": {
				const cwd = strField(payload, "cwd") ?? "";
				const { cols: c, rows: r } = clampDims(intField(payload, "cols", 80), intField(payload, "rows", 24));
				try {
					const session = await manager.create(cwd, c, r);
					json(res, OK({
						id: session.id,
						cwd: session.cwd,
						shell: shellLabelOf(session.shell)
					}));
				} catch (error) {
					json(res, FAIL({
						code: "spawn-failed",
						message: error instanceof Error ? error.message : String(error)
					}), 500);
				}
				return;
			}
			case "/dsh-terminal/input": {
				const id = strField(payload, "id");
				const data = typeof payload === "object" && payload !== null ? payload.data : void 0;
				if (id === null || typeof data !== "string") {
					json(res, FAIL(BAD_REQUEST));
					return;
				}
				const session = manager.get(id);
				if (session === void 0) {
					json(res, FAIL({
						code: "not-found",
						message: "session not found"
					}), 404);
					return;
				}
				session.write(data);
				json(res, OK({ ok: true }));
				return;
			}
			case "/dsh-terminal/resize": {
				const id = strField(payload, "id");
				if (id === null) {
					json(res, FAIL(BAD_REQUEST));
					return;
				}
				const cols = intField(payload, "cols", 80);
				const rows = intField(payload, "rows", 24);
				const session = manager.get(id);
				if (session === void 0) {
					json(res, FAIL({
						code: "not-found",
						message: "session not found"
					}), 404);
					return;
				}
				const { cols: c, rows: r } = clampDims(cols, rows);
				session.resize(c, r);
				json(res, OK({ ok: true }));
				return;
			}
			case "/dsh-terminal/kill": {
				const id = strField(payload, "id");
				if (id === null) {
					json(res, FAIL(BAD_REQUEST));
					return;
				}
				const wasAlive = manager.dispose(id);
				json(res, OK({
					ok: true,
					disposed: wasAlive
				}));
				return;
			}
			case "/dsh-terminal/clear": {
				const id = strField(payload, "id");
				if (id === null) {
					json(res, FAIL(BAD_REQUEST));
					return;
				}
				const session = manager.get(id);
				if (session === void 0) {
					json(res, FAIL({
						code: "not-found",
						message: "session not found"
					}), 404);
					return;
				}
				session.clearBuffer();
				json(res, OK({ ok: true }));
				return;
			}
			default: res.writeHead(404).end();
		}
	};
	return ctx.webServer.register({
		kind: "prefix",
		path: "/dsh-terminal",
		handler
	});
}
//#endregion
//#region src/index.ts
/** Required services: the route registry, the managed subprocess seam, the workspace registry, and the prompt band. */
const inject = [
	"webServer",
	"subprocess",
	"workspaceRegistry",
	"systemPrompt"
];
/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 215;
/** Model-facing announcement: plugin presence, capabilities, and limits. */
const JUPYTER_GUIDANCE = "本机已安装 dsh-jupyter 插件（Jupyter notebook 预览/编辑/运行 + Web 界面左端终端）：① notebook：左侧侧边栏「Notebook」入口打开右侧笔记本面板，可打开工作区内的 .ipynb 文件，编辑 code/markdown/raw 单元格、增删排序单元格、保存回磁盘；单元格通过宿主进程的真实 Jupyter 内核（jupyter_client/python3，内核状态在单元格间共享）执行并流式渲染输出（stdout/stderr、富文本 HTML、PNG/JPEG 图片、JSON、错误回溯），支持中断与重启内核。② 终端：Web GUI 左侧边栏「终端」入口行（New Session 下方，dsh-ssh 同款设计）展开中间列终端面板——真实 PTY（node-pty，TERM=xterm-256color）连接宿主本机 shell（$SHELL 或 bash，登录式），初始工作目录为当前会话 cwd（缺省用户家目录），支持输入、列行自适应、清屏、重启、关闭面板。宿主端经 /dsh-jupyter/* 与 /dsh-terminal/* 路由提供；notebook 路由带 workspace 门禁，终端是真实用户 shell（可访问宿主用户的全部权限与目录，故不施加 workspace 门禁——真实防线是 loopback+same-origin CSRF 校验，仅本机同源浏览器可访问）。用户提到「jupyter / notebook / .ipynb / 笔记本单元格 / 运行单元格」时即指①，提到「终端 / terminal / shell / 跑命令」时即指②，请据此协作；两者都会真实消耗本机资源，先确认再操作。";
/**
* Mount the notebook data services and their routes, plus the terminal PTY
* registry and its routes.
* @param ctx - context carrying webServer, subprocess, workspaceRegistry, systemPrompt.
*/
function apply(ctx) {
	const notebooks = new NotebookService(createWorkspaceGate(ctx));
	const bridgeScript = new URL("./kernel_bridge.py", import.meta.url).pathname;
	const kernels = new KernelSessionManager(notebooks, defaultSpawnKernel(ctx), bridgeScript, (view) => kernelNameOf(view.metadata));
	const terminals = new TerminalSessionManager();
	ctx.effect(() => registerJupyterRoutes(ctx, notebooks, kernels), "dsh-jupyter: /dsh-jupyter routes");
	ctx.effect(() => registerTerminalRoutes(ctx, terminals), "dsh-jupyter: /dsh-terminal routes");
	ctx.effect(() => () => kernels.disposeAll(), "dsh-jupyter: kernel sessions");
	ctx.effect(() => () => terminals.disposeAll(), "dsh-jupyter: terminal sessions");
	ctx.effect(() => ctx.systemPrompt.section({
		name: "plugin:dsh-jupyter",
		order: SECTION_ORDER,
		text: JUPYTER_GUIDANCE
	}), "dsh-jupyter: prompt section");
}
//#endregion
export { JUPYTER_GUIDANCE, apply, inject };
