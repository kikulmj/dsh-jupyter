window.__ModuleLoader__.load({
	id: "@kikulmj/dsh-jupyter",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/address.ts
		/**
		* The session-scoped `dsh-resource://file/...` address grammar shared by the
		* tab title and the notebook body.
		* @module dsh-jupyter/client/address
		*/
		/** Prefix of the session-scoped file address a tab receives as `contentId`. */
		const FILE_PREFIX = "dsh-resource://file/session/";
		/** Split a `dsh-resource://file/session/<id>/<path>` address. */
		function fileOf(address) {
			if (!address.startsWith(FILE_PREFIX)) return null;
			const rest = address.slice(28);
			const slash = rest.indexOf("/");
			if (slash <= 0 || slash === rest.length - 1) return null;
			try {
				return {
					sessionId: decodeURIComponent(rest.slice(0, slash)),
					path: rest.slice(slash + 1).split("/").map((segment) => decodeURIComponent(segment)).join("/")
				};
			} catch {
				return null;
			}
		}
		/** The chip text: the notebook's file name. */
		function titleOf(address) {
			const file = fileOf(address);
			if (file === null) return "Notebook";
			const name = file.path.slice(file.path.lastIndexOf("/") + 1);
			return name === "" ? "Notebook" : name;
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* Locale strings for the notebook tab (zh/en). The client registers the
		* dictionary through the locale service; the slot seat then synthesizes the
		* typed `t` prop from this namespace.
		* @module dsh-jupyter/client/locales
		*/
		const zh = {
			"save": "保存",
			"saving": "保存中…",
			"saved": "已保存",
			"runAll": "全部运行",
			"run": "运行",
			"running": "运行中…",
			"interrupt": "中断",
			"restartKernel": "重启内核",
			"kernelRestarted": "内核已重启",
			"interpreter": "内核环境",
			"bundledPython": "内置 Python (dsh)",
			"interpreterChanged": "内核已切换，保存笔记本后记住",
			"interpreterUnavailable": "保存的内核环境不可用，已回退到内置 Python",
			"cellError": "单元格执行出错",
			"preview": "预览",
			"edit": "编辑",
			"delete": "删除",
			"code": "代码",
			"markdown": "Markdown",
			"raw": "Raw",
			"clearOutputs": "清空输出",
			"loading": "正在加载…",
			"modified": "未保存",
			"noCells": "这个笔记本还没有单元格，先添加一个：",
			"reload": "重新加载",
			"createEmpty": "以空笔记本打开",
			"createEmptyConfirm": "该文件不是有效的 notebook JSON。要用一个新的空笔记本覆盖它吗？原内容将丢失。",
			"unsupportedOutput": "不支持的输出类型"
		};
		const en = {
			"save": "Save",
			"saving": "Saving…",
			"saved": "Saved",
			"runAll": "Run All",
			"run": "Run",
			"running": "Running…",
			"interrupt": "Interrupt",
			"restartKernel": "Restart Kernel",
			"kernelRestarted": "Kernel restarted",
			"interpreter": "Kernel environment",
			"bundledPython": "Bundled Python (dsh)",
			"interpreterChanged": "Kernel switched; save the notebook to remember it",
			"interpreterUnavailable": "Saved kernel environment is unavailable; using bundled Python",
			"cellError": "cell execution failed",
			"preview": "Preview",
			"edit": "Edit",
			"delete": "Delete",
			"code": "Code",
			"markdown": "Markdown",
			"raw": "Raw",
			"clearOutputs": "Clear Outputs",
			"loading": "Loading…",
			"modified": "Unsaved",
			"noCells": "This notebook has no cells yet. Add one to start:",
			"reload": "Reload",
			"createEmpty": "Open as empty notebook",
			"createEmptyConfirm": "This file is not valid notebook JSON. Replace it with a new empty notebook? Its current content will be lost.",
			"unsupportedOutput": "Unsupported output"
		};
		/** The locale namespace this plugin owns. */
		const NS = "dsh-jupyter";
		/** Both dictionaries, as the locale service expects. */
		const dictionaries = {
			zh,
			en
		};
		//#endregion
		//#region src/client/api.ts
		/** Transport failure (fetch threw or the response was not readable). */
		const TRANSPORT_ERROR = {
			code: "internal",
			message: "jupyter route unavailable"
		};
		/** POST one JSON payload and decode the envelope; never throws. */
		async function post(path, payload, signal) {
			let response;
			try {
				response = await fetch(path, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(payload),
					signal
				});
			} catch {
				return {
					ok: false,
					error: TRANSPORT_ERROR
				};
			}
			try {
				const envelope = await response.json();
				if (envelope.ok === true) return {
					ok: true,
					value: envelope.value
				};
				return {
					ok: false,
					error: envelope.error ?? TRANSPORT_ERROR
				};
			} catch {
				return {
					ok: false,
					error: TRANSPORT_ERROR
				};
			}
		}
		/** The typed API surface the panel drives. */
		var JupyterApi = class {
			/** List the Python interpreters the kernel picker offers. */
			async interpreters(signal) {
				let response;
				try {
					response = await fetch("/dsh-jupyter/interpreters", { signal });
					const envelope = await response.json();
					if (envelope.ok === true) return {
						ok: true,
						value: envelope.value ?? []
					};
					return {
						ok: false,
						error: envelope.error ?? TRANSPORT_ERROR
					};
				} catch {
					return {
						ok: false,
						error: TRANSPORT_ERROR
					};
				}
			}
			/** Read and parse a notebook file. */
			read(sessionId, path, signal) {
				return post("/dsh-jupyter/read", {
					sessionId,
					path
				}, signal);
			}
			/** Replace a non-notebook file with a fresh one-cell notebook. */
			create(sessionId, path, overwrite) {
				return post("/dsh-jupyter/create", {
					sessionId,
					path,
					overwrite
				});
			}
			/** Write the notebook back (with the filesystem version guard). */
			write(sessionId, path, notebook, baseVersion) {
				return post("/dsh-jupyter/write", {
					sessionId,
					path,
					notebook,
					baseVersion
				});
			}
			/** Interrupt the running cell (no-op when idle). */
			interrupt(sessionId, path) {
				return post("/dsh-jupyter/interrupt", {
					sessionId,
					path
				});
			}
			/** Restart the kernel (fresh state). */
			restart(sessionId, path) {
				return post("/dsh-jupyter/restart", {
					sessionId,
					path
				});
			}
			/** Dispose the notebook's kernel session (tab closed). */
			dispose(sessionId, path) {
				return post("/dsh-jupyter/dispose-session", {
					sessionId,
					path
				});
			}
			/** Read a plain UTF-8 file for the text editor. */
			readText(sessionId, path, signal) {
				return post("/dsh-jupyter/text-read", {
					sessionId,
					path
				}, signal);
			}
			/** Write a plain UTF-8 file with the filesystem version guard. */
			writeText(sessionId, path, text, baseVersion) {
				return post("/dsh-jupyter/text-write", {
					sessionId,
					path,
					text,
					baseVersion
				});
			}
			/** URL for a file referenced beside the notebook (markdown images). */
			rawUrl(sessionId, path, suffix) {
				return `/dsh-jupyter/raw?sessionId=${encodeURIComponent(sessionId)}&path=${encodeURIComponent(path)}${suffix}`;
			}
			/**
			* Execute one cell, streaming output events.
			* @returns a promise resolving with the done event; rejects on transport failure.
			*/
			async execute(sessionId, path, cellId, code, onOutput, python) {
				let response;
				try {
					response = await fetch("/dsh-jupyter/execute", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							sessionId,
							path,
							cellId,
							code,
							...python === void 0 || python === "" ? {} : { python }
						})
					});
				} catch {
					throw new Error("jupyter route unavailable");
				}
				if (!response.ok || response.body === null) throw new Error(`execute failed: HTTP ${response.status}`);
				const reader = response.body.getReader();
				const decoder = new TextDecoder();
				let buffer = "";
				let done;
				let fatal;
				for (;;) {
					const { value, done: streamDone } = await reader.read();
					if (value !== void 0) buffer += decoder.decode(value, { stream: !streamDone });
					let index;
					while ((index = buffer.indexOf("\n")) !== -1) {
						const line = buffer.slice(0, index);
						buffer = buffer.slice(index + 1);
						if (line === "") continue;
						let event;
						try {
							event = JSON.parse(line);
						} catch {
							continue;
						}
						if (event.kind === "output") onOutput(event.output);
						else if (event.kind === "done") done = {
							executionCount: event.executionCount,
							status: event.status
						};
						else if (event.kind === "error") fatal = new Error(event.message);
					}
					if (streamDone) break;
				}
				if (fatal !== void 0) throw fatal;
				if (done === void 0) throw new Error("execute stream ended without a done event");
				return done;
			}
		};
		//#endregion
		//#region src/client/markdown.ts
		/**
		* Compact markdown renderer for the notebook panel — the same implementation
		* the dsh right-panel preview (dsh-aionui-panel, Apache-2.0) uses, so
		* markdown cells render identically to the built-in preview. Headings,
		* paragraphs, fenced + inline code, bold/italic, links/images, lists,
		* blockquotes, hr, and tables. All HTML is escaped before transformation —
		* the output only ever contains the renderer's own tags.
		* @module dsh-jupyter/client/markdown
		*/
		/** Escape HTML special characters. */
		function escapeHtml(text) {
			return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
		}
		/** Directory of a workspace-relative file path ('' when at the root). */
		function dirOf(filePath) {
			const slash = filePath.lastIndexOf("/");
			return slash === -1 ? "" : filePath.slice(0, slash);
		}
		/** Collapse . and .. segments; null when .. escapes the base. */
		function normalizeRelPath(rel) {
			const out = [];
			for (const part of rel.split("/")) {
				if (part === "" || part === ".") continue;
				if (part === "..") {
					if (out.length === 0) return null;
					out.pop();
					continue;
				}
				out.push(part);
			}
			return out.join("/");
		}
		/** Percent-decode a path portion (best effort; never throws). */
		function decodePathPart(raw) {
			try {
				return decodeURIComponent(raw);
			} catch {
				return raw;
			}
		}
		/**
		* Resolve one markdown image src against the markdown file's location:
		* - Absolute URLs (http/https/data:/...) and fragment-only srcs are left to
		*   the browser ('absolute').
		* - Root-relative srcs (/img.png) resolve from the project root; other
		*   relative srcs resolve against the file's directory. `..` escaping the
		*   project root is rejected ('escape').
		* - The path portion is percent-decoded and any ?query#fragment suffix is
		*   preserved verbatim.
		*/
		function resolveMarkdownImage(filePath, src) {
			const trimmed = src.trim();
			if (trimmed === "" || trimmed.startsWith("#")) return { kind: "absolute" };
			if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return { kind: "absolute" };
			const decoded = decodePathPart(trimmed);
			const q = decoded.indexOf("?");
			const h = decoded.indexOf("#");
			let cut = decoded.length;
			if (q !== -1) cut = Math.min(cut, q);
			if (h !== -1) cut = Math.min(cut, h);
			const pathPart = decoded.slice(0, cut);
			const suffix = decoded.slice(cut);
			const base = pathPart.startsWith("/") ? "" : dirOf(filePath);
			const normalized = normalizeRelPath(base === "" ? pathPart : `${base}/${pathPart}`);
			if (normalized === null) return { kind: "escape" };
			return {
				kind: "relative",
				path: normalized,
				suffix
			};
		}
		/**
		* Guard a raw link/image target against dangerous protocols. Only http:,
		* https:, mailto: and fragment anchors pass; javascript:/data:/vbscript:
		* are rejected so the value never reaches dangerouslySetInnerHTML.
		*/
		function safeUrl(raw) {
			const trimmed = raw.trim();
			if (trimmed === "") return null;
			if (trimmed.startsWith("#")) return trimmed;
			const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed);
			if (scheme === null) return trimmed;
			const name = scheme[1].toLowerCase();
			return name === "http" || name === "https" || name === "mailto" ? trimmed : null;
		}
		/** Inline pass: code spans, bold, italic, images, links. */
		function renderInline(text, options) {
			let out = "";
			let i = 0;
			const n = text.length;
			while (i < n) {
				const char = text[i];
				if (char === "`") {
					const end = text.indexOf("`", i + 1);
					if (end !== -1) {
						out += `<code>${escapeHtml(text.slice(i + 1, end))}</code>`;
						i = end + 1;
						continue;
					}
				}
				if (char === "!" && text[i + 1] === "[") {
					const close = text.indexOf("](", i + 2);
					if (close !== -1) {
						const parenEnd = text.indexOf(")", close + 2);
						if (parenEnd !== -1) {
							const alt = text.slice(i + 2, close);
							const safe = safeUrl(text.slice(close + 2, parenEnd));
							if (safe === null) out += escapeHtml(alt);
							else {
								let target = safe;
								if (options?.resolveImageSrc !== void 0) target = options.resolveImageSrc(safe);
								if (target === null) out += escapeHtml(alt);
								else {
									const srcEsc = escapeHtml(target).replace(/\s+/g, "%20");
									out += `<img alt="${escapeHtml(alt)}" src="${srcEsc}" />`;
								}
							}
							i = parenEnd + 1;
							continue;
						}
					}
				}
				if (char === "[") {
					const close = text.indexOf("](", i + 1);
					if (close !== -1) {
						const parenEnd = text.indexOf(")", close + 2);
						if (parenEnd !== -1) {
							const label = text.slice(i + 1, close);
							const safe = safeUrl(text.slice(close + 2, parenEnd));
							if (safe === null) out += renderInline(label, options);
							else out += `<a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">${renderInline(label, options)}</a>`;
							i = parenEnd + 1;
							continue;
						}
					}
				}
				if (char === "*" && text[i + 1] === "*") {
					const end = text.indexOf("**", i + 2);
					if (end !== -1) {
						out += `<strong>${renderInline(text.slice(i + 2, end), options)}</strong>`;
						i = end + 2;
						continue;
					}
				}
				if (char === "*" && text[i - 1] !== "*" && text[i + 1] !== "*") {
					const end = text.indexOf("*", i + 1);
					if (end !== -1 && text[end + 1] !== "*") {
						out += `<em>${renderInline(text.slice(i + 1, end), options)}</em>`;
						i = end + 1;
						continue;
					}
				}
				if (char === "~" && text[i + 1] === "~") {
					const end = text.indexOf("~~", i + 2);
					if (end !== -1) {
						out += `<del>${renderInline(text.slice(i + 2, end), options)}</del>`;
						i = end + 2;
						continue;
					}
				}
				out += escapeHtml(char);
				i += 1;
			}
			return out;
		}
		/** Render a markdown document to HTML (block pass). */
		function renderMarkdown(source, options) {
			const lines = source.replace(/\r\n/g, "\n").split("\n");
			const out = [];
			let i = 0;
			const n = lines.length;
			const flushParagraph = (buffer) => {
				if (buffer.length === 0) return;
				out.push(`<p>${renderInline(buffer.join("\n"), options)}</p>`);
				buffer.length = 0;
			};
			let paragraph = [];
			while (i < n) {
				const line = lines[i];
				const fence = /^```([\w+-]*)\s*$/.exec(line);
				if (fence !== null) {
					flushParagraph(paragraph);
					const lang = fence[1] ?? "";
					i += 1;
					const code = [];
					while (i < n && !/^```\s*$/.test(lines[i])) {
						code.push(lines[i]);
						i += 1;
					}
					i += 1;
					const langAttr = lang === "" ? "" : ` class="language-${escapeHtml(lang)}"`;
					out.push(`<pre${langAttr}><code>${escapeHtml(code.join("\n"))}</code></pre>`);
					continue;
				}
				const heading = /^(#{1,6})\s+(.*)$/.exec(line);
				if (heading !== null) {
					flushParagraph(paragraph);
					const level = heading[1].length;
					out.push(`<h${level}>${renderInline(heading[2] ?? "", options)}</h${level}>`);
					i += 1;
					continue;
				}
				if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
					flushParagraph(paragraph);
					out.push("<hr />");
					i += 1;
					continue;
				}
				if (line.includes("|") && i + 1 < n && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].includes("-")) {
					flushParagraph(paragraph);
					const headerCells = splitTableRow(line);
					i += 2;
					const rows = [];
					while (i < n && lines[i].includes("|")) {
						rows.push(splitTableRow(lines[i]));
						i += 1;
					}
					out.push("<table>");
					out.push(`<thead><tr>${headerCells.map((cell) => `<th>${renderInline(cell, options)}</th>`).join("")}</tr></thead>`);
					if (rows.length > 0) out.push(`<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell, options)}</td>`).join("")}</tr>`).join("")}</tbody>`);
					out.push("</table>");
					continue;
				}
				if (/^>\s?(.*)$/.exec(line) !== null) {
					flushParagraph(paragraph);
					const body = [];
					while (i < n) {
						const q = /^>\s?(.*)$/.exec(lines[i]);
						if (q === null) break;
						body.push(q[1] ?? "");
						i += 1;
					}
					out.push(`<blockquote><p>${body.map((line) => renderInline(line, options)).join("<br />")}</p></blockquote>`);
					continue;
				}
				if (/^\s*([-*+])\s+(.*)$/.exec(line) !== null) {
					flushParagraph(paragraph);
					const items = [];
					while (i < n) {
						const item = /^\s*([-*+])\s+(.*)$/.exec(lines[i]);
						if (item === null) break;
						items.push(`<li>${renderInline(item[2] ?? "", options)}</li>`);
						i += 1;
					}
					out.push(`<ul>${items.join("")}</ul>`);
					continue;
				}
				if (/^\s*\d+[.)]\s+(.*)$/.exec(line) !== null) {
					flushParagraph(paragraph);
					const items = [];
					while (i < n) {
						const item = /^\s*\d+[.)]\s+(.*)$/.exec(lines[i]);
						if (item === null) break;
						items.push(`<li>${renderInline(item[1] ?? "", options)}</li>`);
						i += 1;
					}
					out.push(`<ol>${items.join("")}</ol>`);
					continue;
				}
				if (line.trim() === "") {
					flushParagraph(paragraph);
					i += 1;
					continue;
				}
				paragraph.push(line);
				i += 1;
			}
			flushParagraph(paragraph);
			return out.join("\n");
		}
		/** Split one table row into cells (respecting the leading/trailing pipes). */
		function splitTableRow(line) {
			const trimmed = line.trim();
			const inner = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
			return (inner.endsWith("|") ? inner.slice(0, -1) : inner).split("|").map((cell) => cell.trim());
		}
		//#endregion
		//#region src/client/highlight.ts
		/**
		* Small tokenizer for the notebook and text editors. It returns escaped HTML
		* with token spans; editors paint it behind a transparent textarea, so the
		* textarea keeps native editing, selection and IME behavior.
		* @module dsh-jupyter/client/highlight
		*/
		const PYTHON_KEYWORDS = /* @__PURE__ */ new Set([
			"False",
			"None",
			"True",
			"and",
			"as",
			"assert",
			"async",
			"await",
			"break",
			"class",
			"continue",
			"def",
			"del",
			"elif",
			"else",
			"except",
			"finally",
			"for",
			"from",
			"global",
			"if",
			"import",
			"in",
			"is",
			"lambda",
			"nonlocal",
			"not",
			"or",
			"pass",
			"raise",
			"return",
			"try",
			"while",
			"with",
			"yield",
			"match",
			"case"
		]);
		const JS_KEYWORDS = /* @__PURE__ */ new Set([
			"as",
			"async",
			"await",
			"break",
			"case",
			"catch",
			"class",
			"const",
			"continue",
			"debugger",
			"default",
			"delete",
			"do",
			"else",
			"export",
			"extends",
			"false",
			"finally",
			"for",
			"from",
			"function",
			"get",
			"if",
			"import",
			"in",
			"instanceof",
			"interface",
			"let",
			"new",
			"null",
			"of",
			"return",
			"set",
			"static",
			"super",
			"switch",
			"this",
			"throw",
			"true",
			"try",
			"type",
			"typeof",
			"undefined",
			"var",
			"void",
			"while",
			"yield",
			"enum",
			"implements",
			"declare",
			"namespace",
			"private",
			"protected",
			"public",
			"readonly",
			"abstract",
			"satisfies",
			"keyof"
		]);
		const C_KEYWORDS = /* @__PURE__ */ new Set([
			"auto",
			"bool",
			"break",
			"case",
			"catch",
			"char",
			"class",
			"const",
			"constexpr",
			"continue",
			"default",
			"delete",
			"do",
			"double",
			"else",
			"enum",
			"explicit",
			"extern",
			"false",
			"float",
			"for",
			"friend",
			"if",
			"inline",
			"int",
			"long",
			"namespace",
			"new",
			"nullptr",
			"operator",
			"override",
			"private",
			"protected",
			"public",
			"return",
			"short",
			"signed",
			"sizeof",
			"static",
			"struct",
			"switch",
			"template",
			"this",
			"throw",
			"true",
			"try",
			"typedef",
			"typename",
			"union",
			"unsigned",
			"using",
			"virtual",
			"void",
			"volatile",
			"while",
			"var",
			"fun",
			"val",
			"when",
			"package",
			"func",
			"go",
			"defer",
			"chan",
			"select",
			"range",
			"interface",
			"impl",
			"mut",
			"match",
			"pub",
			"use",
			"mod",
			"crate",
			"let",
			"fn",
			"trait",
			"where",
			"loop",
			"move",
			"ref",
			"dyn"
		]);
		const SHELL_KEYWORDS = /* @__PURE__ */ new Set([
			"case",
			"do",
			"done",
			"elif",
			"else",
			"esac",
			"export",
			"fi",
			"for",
			"function",
			"if",
			"in",
			"local",
			"readonly",
			"return",
			"select",
			"then",
			"until",
			"while",
			"time",
			"alias",
			"source"
		]);
		const SQL_KEYWORDS = /* @__PURE__ */ new Set([
			"add",
			"all",
			"alter",
			"and",
			"as",
			"asc",
			"begin",
			"between",
			"by",
			"case",
			"create",
			"delete",
			"desc",
			"distinct",
			"drop",
			"else",
			"end",
			"exists",
			"foreign",
			"from",
			"group",
			"having",
			"in",
			"index",
			"inner",
			"insert",
			"into",
			"is",
			"join",
			"key",
			"left",
			"like",
			"limit",
			"not",
			"null",
			"offset",
			"on",
			"or",
			"order",
			"outer",
			"primary",
			"references",
			"right",
			"select",
			"set",
			"table",
			"then",
			"union",
			"unique",
			"update",
			"values",
			"view",
			"when",
			"where",
			"with"
		]);
		const GENERIC_KEYWORDS = /* @__PURE__ */ new Set([
			...JS_KEYWORDS,
			...C_KEYWORDS,
			...SHELL_KEYWORDS,
			...SQL_KEYWORDS
		]);
		const BUILTINS = /* @__PURE__ */ new Set([
			"abs",
			"all",
			"any",
			"bool",
			"bytearray",
			"bytes",
			"callable",
			"chr",
			"classmethod",
			"dict",
			"dir",
			"divmod",
			"enumerate",
			"eval",
			"exec",
			"filter",
			"float",
			"format",
			"frozenset",
			"getattr",
			"globals",
			"hasattr",
			"hash",
			"help",
			"hex",
			"id",
			"input",
			"int",
			"isinstance",
			"issubclass",
			"iter",
			"len",
			"list",
			"locals",
			"map",
			"max",
			"min",
			"next",
			"object",
			"oct",
			"open",
			"ord",
			"pow",
			"print",
			"property",
			"range",
			"repr",
			"reversed",
			"round",
			"set",
			"setattr",
			"slice",
			"sorted",
			"staticmethod",
			"str",
			"sum",
			"super",
			"tuple",
			"type",
			"vars",
			"zip",
			"Exception",
			"BaseException",
			"ValueError",
			"TypeError",
			"KeyError",
			"IndexError",
			"RuntimeError",
			"StopIteration",
			"True",
			"False",
			"None"
		]);
		const IDENT_START = /[A-Za-z_]/;
		const IDENT_BODY = /[A-Za-z0-9_]/;
		/** Keywords for one language family. */
		function keywordsOf(language) {
			switch (language) {
				case "python": return PYTHON_KEYWORDS;
				case "javascript":
				case "typescript": return JS_KEYWORDS;
				case "c": return C_KEYWORDS;
				case "shell": return SHELL_KEYWORDS;
				case "sql": return SQL_KEYWORDS;
				case "json": return /* @__PURE__ */ new Set();
				default: return GENERIC_KEYWORDS;
			}
		}
		/** The line-comment marker, or undefined for a language without one. */
		function lineCommentOf(language) {
			if (language === "python" || language === "shell" || language === "yaml" || language === "generic") return "#";
			if (language === "sql") return "--";
			if (language === "json") return void 0;
			return "//";
		}
		/** Span one token. */
		function token(kind, text) {
			return `<span class="dshj-tok-${kind}">${escapeHtml(text)}</span>`;
		}
		/** Read a quoted string starting at `start` (the opening quote). */
		function readString(source, start) {
			const quote = source[start];
			const triple = quote !== "`" && source.startsWith(quote.repeat(3), start);
			const delimiter = triple ? quote.repeat(3) : quote;
			let i = start + delimiter.length;
			while (i < source.length) {
				if (source[i] === "\\") {
					i += 2;
					continue;
				}
				if (source.startsWith(delimiter, i)) return i + delimiter.length;
				if (!triple && quote !== "`" && source[i] === "\n") return i;
				i += 1;
			}
			return source.length;
		}
		/**
		* Highlight source code.
		* @param source - the file or cell source.
		* @param language - the language family.
		* @returns escaped HTML with token spans.
		*/
		function highlightCode(source, language = "generic") {
			if (language === "plain") return escapeHtml(source);
			const python = language === "python";
			const keywords = keywordsOf(language);
			const lineComment = lineCommentOf(language);
			const blockComments = language === "javascript" || language === "typescript" || language === "c";
			const backticks = language === "javascript" || language === "typescript";
			const decorators = python;
			let html = "";
			let i = 0;
			let lineStart = true;
			let afterDef = false;
			while (i < source.length) {
				const ch = source[i];
				if (ch === "\n") {
					html += "\n";
					i += 1;
					lineStart = true;
					continue;
				}
				if (lineStart && python) {
					let j = i;
					while (j < source.length && (source[j] === " " || source[j] === "	")) j += 1;
					if (source[j] === "!" || source[j] === "%") {
						const end = source.indexOf("\n", j);
						const stop = end === -1 ? source.length : end;
						html += escapeHtml(source.slice(i, j));
						html += `<span class="dshj-tok-magic">${escapeHtml(source.slice(j, stop))}</span>`;
						i = stop;
						lineStart = false;
						continue;
					}
				}
				lineStart = false;
				if (ch === " " || ch === "	") {
					html += ch;
					i += 1;
					continue;
				}
				if (lineComment !== void 0 && source.startsWith(lineComment, i)) {
					const end = source.indexOf("\n", i);
					const stop = end === -1 ? source.length : end;
					html += token("com", source.slice(i, stop));
					i = stop;
					continue;
				}
				if (blockComments && source.startsWith("/*", i)) {
					const end = source.indexOf("*/", i + 2);
					const stop = end === -1 ? source.length : end + 2;
					html += token("com", source.slice(i, stop));
					i = stop;
					continue;
				}
				if (IDENT_START.test(ch)) {
					let j = i;
					while (j < source.length && IDENT_BODY.test(source[j])) j += 1;
					const word = source.slice(i, j);
					if (python && /^[rRuUbBfF]{1,2}$/.test(word) && (source[j] === "\"" || source[j] === "'")) {
						const stop = readString(source, j);
						html += token("str", source.slice(i, stop));
						i = stop;
						afterDef = false;
						continue;
					}
					if (keywords.has(word)) {
						html += token("kw", word);
						afterDef = python && (word === "def" || word === "class");
					} else if (python && (word === "self" || word === "cls")) {
						html += token("self", word);
						afterDef = false;
					} else if (python && BUILTINS.has(word)) {
						html += token("builtin", word);
						afterDef = false;
					} else if (afterDef) {
						html += token("fn", word);
						afterDef = false;
					} else {
						html += escapeHtml(word);
						afterDef = false;
					}
					i = j;
					continue;
				}
				if (ch === "\"" || ch === "'" || backticks && ch === "`") {
					const stop = readString(source, i);
					html += token("str", source.slice(i, stop));
					i = stop;
					continue;
				}
				if (decorators && ch === "@" && IDENT_START.test(source[i + 1] ?? "")) {
					let j = i + 1;
					while (j < source.length && (IDENT_BODY.test(source[j]) || source[j] === ".")) j += 1;
					html += token("dec", source.slice(i, j));
					i = j;
					continue;
				}
				if (/[0-9]/.test(ch)) {
					let j = i;
					if (source[i] === "0" && /[xXoObB]/.test(source[i + 1] ?? "")) {
						j += 2;
						while (j < source.length && /[0-9a-fA-F_]/.test(source[j])) j += 1;
					} else {
						while (j < source.length && /[0-9_]/.test(source[j])) j += 1;
						if (source[j] === ".") {
							j += 1;
							while (j < source.length && /[0-9_]/.test(source[j])) j += 1;
						}
						if (/[eE]/.test(source[j] ?? "")) {
							j += 1;
							if (/[+-]/.test(source[j] ?? "")) j += 1;
							while (j < source.length && /[0-9_]/.test(source[j])) j += 1;
						}
						if (/[jJ]/.test(source[j] ?? "")) j += 1;
					}
					html += token("num", source.slice(i, j));
					i = j;
					continue;
				}
				if ("=+-*/%<>!&|^~:".includes(ch)) {
					html += token("op", ch);
					i += 1;
					continue;
				}
				html += escapeHtml(ch);
				i += 1;
			}
			return html;
		}
		/** Map a file path to the tokenizer's language family. */
		function languageOf(path) {
			const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
			const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
			if (ext === "") return "plain";
			if ([
				"md",
				"markdown",
				"mdx",
				"txt",
				"text",
				"rst",
				"adoc",
				"log"
			].includes(ext)) return "plain";
			if (ext === "py" || ext === "pyw" || ext === "pyi") return "python";
			if (ext === "ts" || ext === "tsx" || ext === "mts" || ext === "cts") return "typescript";
			if (ext === "js" || ext === "jsx" || ext === "mjs" || ext === "cjs" || ext === "vue" || ext === "svelte") return "javascript";
			if ([
				"c",
				"h",
				"cc",
				"cpp",
				"cxx",
				"hpp",
				"hh",
				"cs",
				"java",
				"go",
				"rs",
				"kt",
				"kts",
				"scala",
				"swift",
				"php",
				"dart"
			].includes(ext)) return "c";
			if ([
				"sh",
				"bash",
				"zsh",
				"fish",
				"ps1",
				"bat",
				"cmd"
			].includes(ext)) return "shell";
			if (ext === "sql") return "sql";
			if (ext === "json" || ext === "jsonc") return "json";
			if ([
				"yaml",
				"yml",
				"toml",
				"ini",
				"cfg",
				"conf",
				"properties",
				"env"
			].includes(ext)) return "yaml";
			return "generic";
		}
		//#endregion
		//#region src/client/code-editor.tsx
		/**
		* Code editor: a transparent textarea over a highlighted `<pre>`.
		* Editing, selection, IME and the caret stay native; the overlay only paints
		* tokens. Tab indents, Shift+Tab dedents, Enter keeps indentation.
		* @module dsh-jupyter/client/code-editor
		*/
		/** Props for {@link CodeEditor}. */
		function CodeEditor({ value, autoFocus, language = "python", onChange, onKeyDown }) {
			const taRef = (0, react.useRef)(null);
			const preRef = (0, react.useRef)(null);
			const pendingSelection = (0, react.useRef)(null);
			const [composing, setComposing] = (0, react.useState)(false);
			const highlighted = (0, react.useMemo)(() => highlightCode(value, language), [value, language]);
			const unit = language === "python" || language === "c" || language === "shell" || language === "sql" || language === "generic" ? "    " : "  ";
			(0, react.useLayoutEffect)(() => {
				const el = taRef.current;
				if (el === null) return;
				const resize = () => {
					el.style.height = "auto";
					el.style.height = `${el.scrollHeight}px`;
				};
				resize();
				const observer = new ResizeObserver(resize);
				observer.observe(el);
				return () => observer.disconnect();
			}, [value]);
			(0, react.useLayoutEffect)(() => {
				const el = taRef.current;
				if (el === null || pendingSelection.current === null) return;
				const [start, end] = pendingSelection.current;
				pendingSelection.current = null;
				el.setSelectionRange(start, end);
			}, [value]);
			const apply = (next, start, end = start) => {
				pendingSelection.current = [start, end];
				onChange(next);
			};
			const handleKeyDown = (event) => {
				if (event.nativeEvent.isComposing) return;
				if (event.key === "Enter" && event.shiftKey) {
					onKeyDown?.(event);
					return;
				}
				const el = event.currentTarget;
				if (event.key === "Tab") {
					event.preventDefault();
					const start = el.selectionStart;
					const end = el.selectionEnd;
					const lineStart = el.value.lastIndexOf("\n", start - 1) + 1;
					const lineEnd = el.value.indexOf("\n", end);
					const blockEnd = lineEnd === -1 ? el.value.length : lineEnd;
					if (start !== end || event.shiftKey) {
						const lines = el.value.slice(lineStart, blockEnd).split("\n");
						const replacement = (event.shiftKey ? lines.map((line) => line.replace(/^( {1,4}|\t)/, "")) : lines.map((line) => `${unit}${line}`)).join("\n");
						apply(el.value.slice(0, lineStart) + replacement + el.value.slice(blockEnd), lineStart, lineStart + replacement.length);
					} else apply(`${el.value.slice(0, start)}${unit}${el.value.slice(end)}`, start + unit.length);
					return;
				}
				if (event.key === "Enter") {
					event.preventDefault();
					const start = el.selectionStart;
					const end = el.selectionEnd;
					const lineStart = el.value.lastIndexOf("\n", start - 1) + 1;
					const line = el.value.slice(lineStart, start);
					const indent = /^[ \t]*/.exec(line)?.[0] ?? "";
					const trimmed = line.trimEnd();
					const insertion = `\n${indent}${(language === "python" ? trimmed.endsWith(":") : language === "yaml" ? trimmed.endsWith(":") : /[{[(]$/.test(trimmed)) ? unit : ""}`;
					apply(el.value.slice(0, start) + insertion + el.value.slice(end), start + insertion.length);
					return;
				}
				onKeyDown?.(event);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dshj-code-wrap",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
					ref: preRef,
					className: "dshj-highlight",
					"aria-hidden": "true",
					dangerouslySetInnerHTML: { __html: `${highlighted}\n` }
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
					ref: taRef,
					className: composing ? "dshj-source dshj-source-overlay composing" : "dshj-source dshj-source-overlay",
					value,
					spellCheck: false,
					rows: 1,
					autoFocus,
					onChange: (event) => onChange(event.target.value),
					onKeyDown: handleKeyDown,
					onCompositionStart: () => setComposing(true),
					onCompositionEnd: () => setComposing(false),
					onScroll: () => {
						const pre = preRef.current;
						const ta = taRef.current;
						if (pre !== null && ta !== null) {
							pre.scrollTop = ta.scrollTop;
							pre.scrollLeft = ta.scrollLeft;
						}
					}
				})]
			});
		}
		//#endregion
		//#region src/client/panel.tsx
		/**
		* Notebook editor component — the body of the native `.ipynb` right-sidebar
		* tab. It edits code/markdown/raw cells, saves back through the host routes,
		* and runs cells through the shared kernel bridge (streaming outputs). Visual
		* language follows the product's theme tokens (`--dsw-*`).
		* @module dsh-jupyter/client/panel
		*/
		/** The interpreter path saved in the notebook's metadata (empty = bundled). */
		function savedPythonOf(metadata) {
			const section = metadata.dsh_jupyter;
			if (typeof section !== "object" || section === null) return "";
			const value = section.python;
			return typeof value === "string" ? value : "";
		}
		/** Build a resolveImageSrc for markdown cells (raw route serves workspace files). */
		function imageResolver(api, sessionId, notebookPath, src) {
			if (notebookPath === "") return null;
			const resolution = resolveMarkdownImage(notebookPath, src);
			if (resolution.kind === "absolute") return src;
			if (resolution.kind === "escape") return null;
			return api.rawUrl(sessionId, resolution.path, resolution.suffix);
		}
		/**
		* The notebook editor (the body of one `.ipynb` tab).
		* @param sessionId - the Session that authorizes file access.
		* @param useTabInfo - the tab's live information hook.
		* @param t - copy for this plugin's locale namespace.
		*/
		function NotebookPanel({ sessionId, useTabInfo, t }) {
			const { tab } = useTabInfo();
			const path = (0, react.useMemo)(() => fileOf(tab.contentId)?.path ?? "", [tab.contentId]);
			const api = (0, react.useMemo)(() => new JupyterApi(), []);
			const [notebook, setNotebook] = (0, react.useState)(null);
			const [runtime, setRuntime] = (0, react.useState)({});
			const [kernelState, setKernelState] = (0, react.useState)("idle");
			const [interpreters, setInterpreters] = (0, react.useState)([]);
			const [python, setPython] = (0, react.useState)("");
			const [status, setStatus] = (0, react.useState)("");
			const [statusError, setStatusError] = (0, react.useState)(false);
			const [statusCode, setStatusCode] = (0, react.useState)(void 0);
			const [saving, setSaving] = (0, react.useState)(false);
			const runSeq = (0, react.useRef)(0);
			const loadSeq = (0, react.useRef)(0);
			/** The id of the most recently added cell — drives auto-focus into the fresh
			*  textarea so typing can start immediately (Jupyter-style). */
			const lastAddedIdRef = (0, react.useRef)(null);
			/** Reload the notebook from disk (also the sidebar refresh command). */
			const reload = (0, react.useCallback)(async () => {
				const seq = ++loadSeq.current;
				if (path === "") {
					setNotebook(null);
					setRuntime({});
					lastAddedIdRef.current = null;
					return;
				}
				const result = await api.read(sessionId, path, tab.signal);
				if (seq !== loadSeq.current || tab.signal.aborted) return;
				if (!result.ok) {
					setStatus(result.error.message);
					setStatusError(true);
					setStatusCode(result.error.code);
					setNotebook(null);
					return;
				}
				setNotebook(result.value);
				setPython(savedPythonOf(result.value.metadata));
				setRuntime({});
				setKernelState("idle");
				setStatus("");
				setStatusError(false);
				setStatusCode(void 0);
				lastAddedIdRef.current = null;
			}, [
				api,
				path,
				sessionId,
				tab.signal
			]);
			(0, react.useEffect)(() => {
				setNotebook(null);
				reload();
			}, [reload]);
			(0, react.useEffect)(() => tab.actions.bindCommands({ refresh: () => void reload() }), [tab.actions, reload]);
			(0, react.useEffect)(() => {
				if (path === "") return;
				const release = () => {
					api.dispose(sessionId, path);
				};
				tab.signal.addEventListener("abort", release, { once: true });
				return () => tab.signal.removeEventListener("abort", release);
			}, [
				api,
				sessionId,
				path,
				tab.signal
			]);
			const flashStatus = (0, react.useCallback)((message, isError = false) => {
				setStatus(message);
				setStatusError(isError);
				setStatusCode(void 0);
				const seq = ++runSeq.current;
				setTimeout(() => {
					if (runSeq.current === seq) setStatus("");
				}, 4e3);
			}, []);
			(0, react.useEffect)(() => {
				let cancelled = false;
				api.interpreters(tab.signal).then((result) => {
					if (cancelled || tab.signal.aborted || !result.ok) return;
					setInterpreters(result.value);
				});
				return () => {
					cancelled = true;
				};
			}, [api, tab.signal]);
			(0, react.useEffect)(() => {
				if (interpreters.length === 0 || python === "") return;
				if (!interpreters.some((option) => option.python === python)) {
					setPython("");
					flashStatus(t("interpreterUnavailable"), true);
				}
			}, [
				interpreters,
				python,
				flashStatus,
				t
			]);
			/** Patch one cell's transient runtime state. */
			const patchRuntime = (0, react.useCallback)((cellId, patch) => {
				setRuntime((prev) => ({
					...prev,
					[cellId]: {
						...prev[cellId] ?? {
							editing: false,
							running: false,
							error: null
						},
						...patch
					}
				}));
			}, []);
			/** Save the notebook back (filesystem version checked host-side). */
			const save = (0, react.useCallback)(async () => {
				if (notebook === null || path === "") return;
				setSaving(true);
				const result = await api.write(sessionId, path, {
					cells: notebook.cells,
					metadata: notebook.metadata
				}, notebook.version);
				setSaving(false);
				if (!result.ok) {
					flashStatus(result.error.message, true);
					return;
				}
				setNotebook((prev) => prev === null ? prev : {
					...prev,
					version: result.value.version
				});
				flashStatus(t("saved"));
			}, [
				notebook,
				path,
				sessionId,
				api,
				flashStatus,
				t
			]);
			/** Replace a non-notebook file with a fresh notebook after confirmation. */
			const openAsEmpty = (0, react.useCallback)(async () => {
				if (path === "" || !window.confirm(t("createEmptyConfirm"))) return;
				const result = await api.create(sessionId, path, true);
				if (!result.ok) {
					flashStatus(result.error.message, true);
					return;
				}
				setNotebook(result.value);
				setRuntime({});
				setStatus("");
				setStatusError(false);
				setStatusCode(void 0);
				lastAddedIdRef.current = null;
			}, [
				api,
				path,
				sessionId,
				flashStatus,
				t
			]);
			/** Switch the notebook kernel to another interpreter and restart it. */
			const selectInterpreter = (0, react.useCallback)((value) => {
				if (value === python) return;
				setPython(value);
				setKernelState("idle");
				if (path !== "") api.dispose(sessionId, path);
				setNotebook((prev) => {
					if (prev === null) return prev;
					const section = { ...typeof prev.metadata.dsh_jupyter === "object" && prev.metadata.dsh_jupyter !== null ? prev.metadata.dsh_jupyter : {} };
					if (value === "") delete section.python;
					else section.python = value;
					return {
						...prev,
						metadata: {
							...prev.metadata,
							dsh_jupyter: section
						}
					};
				});
				flashStatus(t("interpreterChanged"));
			}, [
				python,
				path,
				sessionId,
				api,
				flashStatus,
				t
			]);
			/** Update one cell's source in the notebook. */
			const editCell = (0, react.useCallback)((cellId, source) => {
				setNotebook((prev) => prev === null ? prev : {
					...prev,
					cells: prev.cells.map((cell) => cell.id === cellId ? {
						...cell,
						source
					} : cell)
				});
			}, []);
			/** Run one code cell through the kernel bridge. */
			const runCell = (0, react.useCallback)(async (cell) => {
				if (notebook === null || path === "") return;
				patchRuntime(cell.id, {
					running: true,
					error: null
				});
				setKernelState("busy");
				setNotebook((prev) => prev === null ? prev : {
					...prev,
					cells: prev.cells.map((c) => c.id === cell.id ? {
						...c,
						outputs: [],
						execution_count: null
					} : c)
				});
				try {
					const result = await api.execute(sessionId, path, cell.id, cell.source, (output) => {
						setNotebook((prev) => prev === null ? prev : {
							...prev,
							cells: prev.cells.map((c) => c.id === cell.id ? {
								...c,
								outputs: [...c.outputs, output]
							} : c)
						});
					}, python);
					setNotebook((prev) => prev === null ? prev : {
						...prev,
						cells: prev.cells.map((c) => c.id === cell.id ? {
							...c,
							execution_count: result.executionCount
						} : c)
					});
					patchRuntime(cell.id, { running: false });
					if (result.status === "error") flashStatus(t("cellError"), true);
				} catch (error) {
					patchRuntime(cell.id, {
						running: false,
						error: error instanceof Error ? error.message : String(error)
					});
					flashStatus(error instanceof Error ? error.message : String(error), true);
				} finally {
					setKernelState("idle");
				}
			}, [
				notebook,
				path,
				sessionId,
				api,
				python,
				flashStatus,
				patchRuntime,
				t
			]);
			/** Run every code cell in order. */
			const runAll = (0, react.useCallback)(async () => {
				if (notebook === null) return;
				for (const cell of notebook.cells) {
					if (cell.cell_type !== "code") continue;
					if (cell.source.trim() === "") continue;
					await runCell(cell);
				}
			}, [notebook, runCell]);
			/** Restart the kernel (fresh state). */
			const restartKernel = (0, react.useCallback)(async () => {
				if (notebook === null || path === "") return;
				const result = await api.restart(sessionId, path);
				flashStatus(result.ok ? t("kernelRestarted") : result.error.message, !result.ok);
			}, [
				notebook,
				path,
				sessionId,
				api,
				flashStatus,
				t
			]);
			/** Interrupt the running cell. */
			const interrupt = (0, react.useCallback)(async () => {
				if (notebook === null || path === "") return;
				await api.interrupt(sessionId, path);
			}, [
				notebook,
				path,
				sessionId,
				api
			]);
			/** Add a cell after the given index. */
			const addCell = (0, react.useCallback)((afterIndex, cellType) => {
				const cellId = `cell-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
				lastAddedIdRef.current = cellId;
				setNotebook((prev) => prev === null ? prev : {
					...prev,
					cells: [
						...prev.cells.slice(0, afterIndex + 1),
						{
							id: cellId,
							cell_type: cellType,
							source: "",
							execution_count: null,
							outputs: [],
							metadata: {},
							path: prev.path
						},
						...prev.cells.slice(afterIndex + 1)
					]
				});
				patchRuntime(cellId, { editing: true });
			}, [patchRuntime]);
			/** Delete one cell. */
			const deleteCell = (0, react.useCallback)((cellId) => {
				setNotebook((prev) => prev === null ? prev : {
					...prev,
					cells: prev.cells.filter((cell) => cell.id !== cellId)
				});
			}, []);
			/** Move a cell up/down. */
			const moveCell = (0, react.useCallback)((index, delta) => {
				setNotebook((prev) => {
					if (prev === null) return prev;
					const target = index + delta;
					if (target < 0 || target >= prev.cells.length) return prev;
					const cells = [...prev.cells];
					const [cell] = cells.splice(index, 1);
					if (cell === void 0) return prev;
					cells.splice(target, 0, cell);
					return {
						...prev,
						cells
					};
				});
			}, []);
			/** Clear all outputs (and execution counts). */
			const clearOutputs = (0, react.useCallback)(() => {
				setNotebook((prev) => prev === null ? prev : {
					...prev,
					cells: prev.cells.map((cell) => cell.cell_type === "code" ? {
						...cell,
						outputs: [],
						execution_count: null
					} : cell)
				});
			}, []);
			/** Toggle markdown cell edit/preview. */
			const toggleEditing = (0, react.useCallback)((cellId) => {
				setRuntime((prev) => {
					const current = prev[cellId] ?? {
						editing: false,
						running: false,
						error: null
					};
					return {
						...prev,
						[cellId]: {
							...current,
							editing: !current.editing
						}
					};
				});
			}, []);
			(0, react.useEffect)(() => {
				if (!tab.visible) return;
				const onKeyDown = (event) => {
					if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s" && notebook !== null) {
						event.preventDefault();
						save();
					}
				};
				window.addEventListener("keydown", onKeyDown);
				return () => window.removeEventListener("keydown", onKeyDown);
			}, [
				notebook,
				save,
				tab.visible
			]);
			const renderedCells = (0, react.useMemo)(() => {
				return (notebook?.cells ?? []).map((cell, index) => {
					const rt = runtime[cell.id] ?? {
						editing: false,
						running: false,
						error: null
					};
					return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CellCard, {
						cell,
						index,
						total: notebook?.cells.length ?? 0,
						runtime: rt,
						sessionId,
						api,
						autoFocus: cell.id === lastAddedIdRef.current,
						t,
						onEdit: (source) => editCell(cell.id, source),
						onRun: () => void runCell(cell),
						onDelete: () => deleteCell(cell.id),
						onMove: (delta) => moveCell(index, delta),
						onToggleEditing: () => toggleEditing(cell.id),
						onAddCode: () => addCell(index, "code"),
						onAddMarkdown: () => addCell(index, "markdown")
					}, cell.id);
				});
			}, [
				notebook,
				runtime,
				sessionId,
				api,
				editCell,
				runCell,
				deleteCell,
				moveCell,
				toggleEditing,
				addCell
			]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dshj-editor",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dshj-toolbar",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dshj-path-badge",
								title: path ?? "",
								children: path ?? ""
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								className: "dshj-interpreter",
								title: t("interpreter"),
								value: python,
								disabled: notebook === null || kernelState === "busy",
								onChange: (event) => selectInterpreter(event.target.value),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "",
									children: t("bundledPython")
								}), interpreters.filter((option) => option.id !== "bundled").map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: option.python,
									children: option.label
								}, option.id))]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "dshj-toolbar-spacer" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dshj-toolbar-btn primary",
								disabled: notebook === null || saving,
								onClick: () => void save(),
								children: saving ? t("saving") : t("save")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dshj-toolbar-btn",
								disabled: notebook === null,
								onClick: () => void runAll(),
								children: t("runAll")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dshj-toolbar-btn",
								disabled: notebook === null,
								onClick: () => void interrupt(),
								children: t("interrupt")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dshj-toolbar-btn",
								disabled: notebook === null,
								onClick: () => void restartKernel(),
								children: t("restartKernel")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dshj-toolbar-btn",
								disabled: notebook === null,
								onClick: clearOutputs,
								children: t("clearOutputs")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "dshj-toolbar-btn",
								disabled: notebook === null,
								onClick: () => addCell((notebook?.cells.length ?? 0) - 1, "code"),
								children: ["+ ", t("code")]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "dshj-toolbar-btn",
								disabled: notebook === null,
								onClick: () => addCell((notebook?.cells.length ?? 0) - 1, "markdown"),
								children: ["+ ", t("markdown")]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: `dshj-kernel-dot ${kernelState === "busy" ? "busy" : kernelState === "idle" ? "ready" : ""}`,
								"aria-hidden": "true"
							})
						]
					}),
					notebook === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshj-empty",
						children: statusError ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dshj-empty-error",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dshj-md-body",
								children: status
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dshj-empty-actions",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dshj-toolbar-btn",
									onClick: () => void reload(),
									children: t("reload")
								}), statusCode === "not-notebook" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dshj-toolbar-btn primary",
									onClick: () => void openAsEmpty(),
									children: t("createEmpty")
								})]
							})]
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dshj-md-body",
							children: t("loading")
						})
					}) : notebook.cells.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dshj-empty",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dshj-md-body",
							children: t("noCells")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dshj-empty-actions",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "dshj-toolbar-btn primary",
								onClick: () => addCell(-1, "code"),
								children: ["+ ", t("code")]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "dshj-toolbar-btn",
								onClick: () => addCell(-1, "markdown"),
								children: ["+ ", t("markdown")]
							})]
						})]
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshj-cells",
						children: renderedCells
					}),
					(status !== "" || statusError) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: `dshj-status${statusError ? " error" : ""}`,
						children: status
					})
				]
			});
		}
		/** One cell card: header (type/count/actions) + body (editor or preview) + outputs. */
		function CellCard({ cell, index, total, runtime, sessionId, api, autoFocus, t, onEdit, onRun, onDelete, onMove, onToggleEditing, onAddCode, onAddMarkdown }) {
			const isCode = cell.cell_type === "code";
			const isMarkdown = cell.cell_type === "markdown";
			const editing = runtime.editing || isMarkdown && cell.source === "";
			const mdHtml = (0, react.useMemo)(() => {
				if (!isMarkdown) return "";
				return renderMarkdown(cell.source, { resolveImageSrc: (src) => imageResolver(api, sessionId, cell.path ?? "", src) });
			}, [
				cell,
				isMarkdown,
				api,
				sessionId
			]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: `dshj-cell${runtime.running ? " running" : ""}`,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dshj-cell-head",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dshj-cell-type",
							children: cell.cell_type
						}),
						isCode && cell.execution_count !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "dshj-cell-count",
							children: [
								"[",
								cell.execution_count,
								"]"
							]
						}),
						runtime.running && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dshj-spinner",
							"aria-label": "running"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dshj-cell-actions",
							children: [
								isCode && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dshj-mini-btn run",
									disabled: runtime.running,
									onClick: onRun,
									children: runtime.running ? t("running") : `▶ ${t("run")}`
								}),
								isMarkdown && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dshj-mini-btn",
									onClick: onToggleEditing,
									children: editing ? t("preview") : t("edit")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "dshj-mini-btn",
									onClick: onAddCode,
									children: ["+ ", t("code")]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "dshj-mini-btn",
									onClick: onAddMarkdown,
									children: ["+ ", t("markdown")]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dshj-mini-btn",
									disabled: index === 0,
									onClick: () => onMove(-1),
									children: "↑"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dshj-mini-btn",
									disabled: index === total - 1,
									onClick: () => onMove(1),
									children: "↓"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dshj-mini-btn warn",
									onClick: onDelete,
									children: t("delete")
								})
							]
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dshj-cell-body",
					children: [
						isCode ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CodeEditor, {
							value: cell.source,
							autoFocus,
							onChange: (source) => onEdit(source),
							onKeyDown: (event) => {
								if (event.shiftKey && event.key === "Enter") {
									event.preventDefault();
									onRun();
								}
							}
						}) : isMarkdown ? editing ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AutoGrowTextarea, {
							className: "dshj-source",
							value: cell.source,
							autoFocus,
							onChange: (source) => onEdit(source),
							onKeyDown: (event) => {
								if (event.shiftKey && event.key === "Enter") {
									event.preventDefault();
									onToggleEditing();
								}
							}
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dshj-md",
							onDoubleClick: onToggleEditing,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dshj-md-body",
								dangerouslySetInnerHTML: { __html: mdHtml }
							})
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AutoGrowTextarea, {
							className: "dshj-source",
							value: cell.source,
							autoFocus,
							onChange: (source) => onEdit(source)
						}),
						runtime.error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dshj-output-error",
							children: runtime.error
						}),
						isCode && cell.outputs.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dshj-outputs",
							children: cell.outputs.map((output, outputIndex) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OutputView, {
								output,
								t
							}, outputIndex))
						})
					]
				})]
			});
		}
		/**
		* A textarea whose height follows its content (auto-grow). A fixed pixel
		* height would clip or waste space; this keeps the visible box exactly as
		* tall as the text needs, with a small minimum for empty cells.
		*
		* Height measurement is layout-aware: useLayoutEffect runs synchronously
		* after the DOM update but BEFORE paint, so the width is already resolved
		* (a too-narrow first measure would wrap long lines and inflate
		* scrollHeight). A ResizeObserver re-measures whenever the element's width
		* changes (panel resize, split drag), so re-wrapped lines never leave stale
		* extra height.
		*/
		function AutoGrowTextarea({ className, value, autoFocus, onChange, onKeyDown }) {
			const ref = (0, react.useRef)(null);
			(0, react.useLayoutEffect)(() => {
				const el = ref.current;
				if (el === null) return;
				const resize = () => {
					const prevOverflow = el.style.overflow;
					el.style.overflow = "visible";
					el.style.height = "auto";
					const contentHeight = el.scrollHeight;
					el.style.height = `${contentHeight}px`;
					el.style.overflow = prevOverflow;
				};
				resize();
				const observer = new ResizeObserver(resize);
				observer.observe(el);
				return () => observer.disconnect();
			}, [value]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
				ref,
				className,
				value,
				spellCheck: false,
				rows: 1,
				autoFocus,
				onChange: (event) => onChange(event.target.value),
				onKeyDown
			});
		}
		/** Render one nbformat output. */
		function OutputView({ output, t }) {
			if (output.output_type === "stream") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: `dshj-output dshj-output-stream${output.name === "stderr" ? " stderr" : ""}`,
				children: output.text
			});
			if (output.output_type === "error") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dshj-output dshj-output-error",
				children: output.traceback.length > 0 ? output.traceback.join("\n").replaceAll("\x1B[", "") : `${output.ename}: ${output.evalue}`
			});
			if (output.output_type === "execute_result" || output.output_type === "display_data") {
				const data = output.data;
				const png = data["image/png"];
				if (typeof png === "string") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
					className: "dshj-output-image",
					src: png.startsWith("data:") ? png : `data:image/png;base64,${png}`,
					alt: "output"
				});
				const jpeg = data["image/jpeg"];
				if (typeof jpeg === "string") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
					className: "dshj-output-image",
					src: jpeg.startsWith("data:") ? jpeg : `data:image/jpeg;base64,${jpeg}`,
					alt: "output"
				});
				if (typeof data["image/gif"] === "string") {
					const gif = data["image/gif"];
					return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
						className: "dshj-output-image",
						src: gif.startsWith("data:") ? gif : `data:image/gif;base64,${gif}`,
						alt: "output"
					});
				}
				if (typeof data["image/svg+xml"] === "string") {
					const svg = data["image/svg+xml"];
					return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
						className: "dshj-output-image",
						src: svg.startsWith("data:") ? svg : `data:image/svg+xml;base64,${svg}`,
						alt: "output"
					});
				}
				if (typeof data["text/html"] === "string") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dshj-output dshj-output-html",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
						sandbox: "",
						title: "html output",
						srcDoc: `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:-apple-system,"system-ui","Segoe UI",Roboto,sans-serif}</style></head><body>${data["text/html"]}</body></html>`
					})
				});
				if (typeof data["text/markdown"] === "string") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dshj-output dshj-md",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshj-md-body",
						dangerouslySetInnerHTML: { __html: renderMarkdown(data["text/markdown"]) }
					})
				});
				if (typeof data["application/json"] !== "undefined") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dshj-output dshj-output-json",
					children: JSON.stringify(data["application/json"], null, 2)
				});
				const text = data["text/plain"];
				if (typeof text === "string") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dshj-output dshj-output-plain",
					children: text
				});
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dshj-output dshj-output-unsupported",
					children: t("unsupportedOutput")
				});
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dshj-output dshj-output-unsupported",
				children: t("unsupportedOutput")
			});
		}
		//#endregion
		//#region src/client/styles.ts
		/**
		* Notebook editor styles. The editor is the body of a native right-sidebar
		* tab, so it reuses the product's theme tokens (`--dsw-alias-*`, `--ds-font-*`)
		* and measured values (32px toolbars, 13px mono editors) — the notebook looks
		* like the built-in text preview. This stylesheet only adds the
		* notebook-specific structures (cell cards, output blocks) on top; the editor
		* root fills its tab body (no own positioning).
		* @module dsh-jupyter/client/styles
		*/
		/** The full stylesheet text injected once on mount. */
		const PANEL_CSS = `
/* ── editor root: fills the injected container ───────────────────────── */
.dshj-editor {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  background: var(--dsw-alias-bg-layer-1, #f9fafb);
  font-family: -apple-system, "system-ui", "Segoe UI", Roboto, sans-serif;
  font-size: 13px;
  color: var(--dsw-alias-label-primary, #000000);
}
.dshj-editor *,
.dshj-editor *::before,
.dshj-editor *::after {
  box-sizing: border-box;
}
.dshj-editor ::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.dshj-editor ::-webkit-scrollbar-thumb {
  background: var(--dsw-alias-border-l1, #e5e6eb);
  border-radius: 4px;
}
.dshj-editor ::-webkit-scrollbar-track {
  background: transparent;
}

/* ── toolbar (mirrors the preview toolbar) ────────────────────────────── */
.dshj-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 32px;
  padding: 0 10px;
  flex-shrink: 0;
  background: var(--dsw-alias-bg-layer-2, #f2f3f5);
  border-bottom: 1px solid var(--dsw-alias-border-l1, #e5e6eb);
  overflow-x: auto;
  scrollbar-width: none;
}
.dshj-toolbar::-webkit-scrollbar {
  display: none;
}
.dshj-toolbar-spacer {
  flex: 1;
}

.dshj-interpreter {
  height: 22px;
  max-width: 150px;
  margin-left: 8px;
  padding: 0 4px;
  border: 1px solid var(--dsw-alias-border-l1, #e5e6eb);
  border-radius: 4px;
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-secondary, #454d5f);
  font-family: inherit;
  font-size: 11px;
  flex-shrink: 0;
}
.dshj-interpreter:disabled {
  opacity: 0.5;
}

.dshj-path-badge {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #86909c);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.dshj-toolbar-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #454d5f);
  font-size: 12px;
  font-family: -apple-system, "system-ui", "Segoe UI", Roboto, sans-serif;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), color 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}
.dshj-toolbar-btn:hover {
  background: var(--dsw-alias-border-l1, #e5e6eb);
  color: var(--dsw-alias-label-primary, #000000);
}
.dshj-toolbar-btn:active {
  background: var(--dsw-alias-interactive-bg-active, #e5e6eb);
  color: var(--dsw-alias-label-primary, #000000);
}
.dshj-toolbar-btn:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #165dff);
  outline-offset: 2px;
}
.dshj-toolbar-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.dshj-toolbar-btn:disabled:hover {
  background: transparent;
  color: var(--dsw-alias-label-secondary, #454d5f);
}
.dshj-toolbar-btn.primary {
  color: var(--dsw-alias-brand-primary, #165dff);
}

.dshj-kernel-dot {
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  background: var(--dsw-alias-label-tertiary, #86909c);
  display: inline-block;
  flex-shrink: 0;
}
.dshj-kernel-dot.ready {
  background: var(--dsw-alias-state-success-primary, #00b42a);
}
.dshj-kernel-dot.busy {
  background: var(--dsw-alias-state-warn-primary, #ff7d00);
  animation: dshj-pulse 1.6s ease-in-out infinite;
}
@keyframes dshj-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* ── content region ───────────────────────────────────────────────────── */
.dshj-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--dsw-alias-label-secondary, #454d5f);
  font-size: 13px;
  padding: 24px;
  text-align: center;
}
.dshj-empty-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  max-width: 440px;
}
.dshj-empty-error .dshj-md-body {
  color: var(--dsw-alias-state-error-primary, #f53f3f);
  word-break: break-word;
}
.dshj-empty-actions {
  display: flex;
  gap: 8px;
}

.dshj-cells {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 14px 32px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ── cell card ────────────────────────────────────────────────────────── */
.dshj-cell {
  border: 1px solid var(--dsw-alias-border-l1, #e5e6eb);
  border-radius: 8px;
  background: var(--dsw-alias-bg-base, #ffffff);
  overflow: hidden;
  flex-shrink: 0;
}
.dshj-cell.running {
  border-color: var(--dsw-alias-brand-primary, #165dff);
  box-shadow: 0 0 0 1px var(--dsw-alias-brand-primary, #165dff);
}

.dshj-cell-head {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 8px;
  background: var(--dsw-alias-bg-layer-2, #f2f3f5);
  border-bottom: 1px solid var(--dsw-alias-border-l1, #e5e6eb);
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #86909c);
}
.dshj-cell-type {
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.dshj-cell-count {
  font-family: var(--ds-font-family-code, ui-monospace, monospace);
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #86909c);
}
.dshj-cell-actions {
  margin-left: auto;
  display: flex;
  gap: 2px;
}

.dshj-mini-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  height: 20px;
  padding: 0 6px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #86909c);
  font-size: 11px;
  font-family: -apple-system, "system-ui", "Segoe UI", Roboto, sans-serif;
  cursor: pointer;
  border-radius: 3px;
  transition: background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), color 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}
.dshj-mini-btn:hover {
  background: var(--dsw-alias-border-l1, #e5e6eb);
  color: var(--dsw-alias-label-primary, #000000);
}
.dshj-mini-btn.run {
  color: var(--dsw-alias-brand-primary, #165dff);
  font-weight: 600;
}
.dshj-mini-btn.warn:hover {
  color: var(--dsw-alias-state-error-primary, #f53f3f);
}
.dshj-mini-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.dshj-cell-body {
  padding: 0;
}

/* Source editor — identical to the built-in preview text editor; the height
   follows the content (AutoGrowTextarea sets it), min-height keeps empty
   cells usable. */
.dshj-source {
  width: 100%;
  min-height: 44px;
  border: none;
  outline: none;
  resize: none;
  overflow: hidden;
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #000000);
  font-family: var(--ds-font-family-code, ui-monospace, monospace);
  font-size: 13px;
  line-height: 1.6;
  padding: 10px 12px;
  tab-size: 2;
  display: block;
}
.dshj-source:focus-visible {
  box-shadow: inset 0 0 0 2px var(--dsw-alias-brand-primary, #165dff);
}

/* The shell's global focus ring is a heavy black outline; the editor uses the
   subtle inset shadow above instead. */
.dshj-editor textarea,
.dshj-editor textarea:focus,
.dshj-editor textarea:focus-visible,
.dshj-editor pre,
.dshj-code-wrap:focus-within,
.dshj-text-body:focus-within {
  outline: none !important;
  border: 0 !important;
}

/* Code cells: transparent textarea over a highlighted <pre>. */
.dshj-code-wrap {
  position: relative;
  width: 100%;
  background: var(--dsw-alias-bg-base, #ffffff);
}
.dshj-highlight {
  position: absolute;
  inset: 0;
  margin: 0;
  overflow: hidden;
  pointer-events: none;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: break-word;
  font-family: var(--ds-font-family-code, ui-monospace, monospace);
  font-size: 13px;
  line-height: 1.6;
  padding: 10px 12px;
  tab-size: 2;
  color: var(--dsw-alias-label-primary, #000000);
}
.dshj-source-overlay {
  position: relative;
  z-index: 1;
  background: transparent;
  color: transparent;
  -webkit-text-fill-color: transparent;
  caret-color: var(--dsw-alias-label-primary, #000000);
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: break-word;
}
.dshj-source-overlay::selection {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #165dff) 26%, transparent);
}
/* IME composition text must be visible; cover the overlay while composing. */
.dshj-source-overlay.composing {
  color: var(--dsw-alias-label-primary, #000000);
  -webkit-text-fill-color: currentColor;
  background: var(--dsw-alias-bg-base, #ffffff);
}

/* Plain text/code file editor. */
.dshj-text-editor {
  height: 100%;
}
.dshj-text-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: var(--dsw-alias-bg-base, #ffffff);
}
.dshj-text-body .dshj-code-wrap {
  min-height: 100%;
}
.dshj-dirty {
  font-size: 11px;
  color: var(--dsw-alias-state-warn-primary, #b86b00);
  white-space: nowrap;
}
.dshj-tok-kw { color: #a24fbd; color: light-dark(#a24fbd, #d7a2ff); }
.dshj-tok-builtin { color: #1f7acb; color: light-dark(#1f7acb, #7cb8ff); }
.dshj-tok-str { color: #2f8a57; color: light-dark(#2f8a57, #79d39a); }
.dshj-tok-num { color: #b86b00; color: light-dark(#b86b00, #e5b567); }
.dshj-tok-com { color: #8b919c; font-style: italic; }
.dshj-tok-fn { color: #9a6a00; color: light-dark(#9a6a00, #e0bd63); }
.dshj-tok-dec { color: #0d8f8f; color: light-dark(#0d8f8f, #63d6d6); }
.dshj-tok-magic { color: #1f7acb; color: light-dark(#1f7acb, #7cb8ff); font-weight: 600; }
.dshj-tok-self { color: #a24fbd; color: light-dark(#a24fbd, #d7a2ff); font-style: italic; }
.dshj-tok-op { color: #6b7280; color: light-dark(#6b7280, #a7adb8); }

/* Markdown cell: preview mirrors the built-in markdown viewer. */
.dshj-md {
  padding: 10px 14px 14px;
  overflow-x: auto;
}
.dshj-md .dshj-md-body {
  font-size: 14px;
  line-height: 1.7;
  color: var(--dsw-alias-label-primary, #000000);
  word-wrap: break-word;
}
.dshj-md .dshj-md-body h1 { font-size: 22px; font-weight: 600; margin: 20px 0 10px; padding-bottom: 6px; border-bottom: 1px solid var(--dsw-alias-border-l1, #e5e6eb); line-height: 1.3; }
.dshj-md .dshj-md-body h1:first-child { margin-top: 4px; }
.dshj-md .dshj-md-body h2 { font-size: 19px; font-weight: 600; margin: 18px 0 8px; line-height: 1.3; }
.dshj-md .dshj-md-body h3 { font-size: 16px; font-weight: 600; margin: 14px 0 6px; line-height: 1.3; }
.dshj-md .dshj-md-body h4, .dshj-md .dshj-md-body h5, .dshj-md .dshj-md-body h6 { font-size: 14px; font-weight: 600; margin: 12px 0 5px; line-height: 1.3; }
.dshj-md .dshj-md-body p { margin: 8px 0; }
.dshj-md .dshj-md-body ul, .dshj-md .dshj-md-body ol { margin: 8px 0; padding-left: 24px; }
.dshj-md .dshj-md-body li { margin: 3px 0; }
.dshj-md .dshj-md-body code {
  font-family: var(--ds-font-family-code, ui-monospace, monospace);
  font-size: 0.9em;
  background: var(--dsw-alias-bg-layer-2, #f2f3f5);
  border-radius: 3px;
  padding: 1px 5px;
  color: var(--dsw-alias-label-primary, #000000);
}
.dshj-md .dshj-md-body pre {
  margin: 10px 0;
  padding: 12px 14px;
  background: var(--dsw-alias-bg-layer-2, #f2f3f5);
  border-radius: 6px;
  overflow-x: auto;
  line-height: 1.5;
}
.dshj-md .dshj-md-body pre code { background: transparent; padding: 0; font-size: 13px; }
.dshj-md .dshj-md-body blockquote {
  margin: 10px 0;
  padding: 4px 14px;
  border-left: 3px solid var(--dsw-alias-border-l1, #e5e6eb);
  color: var(--dsw-alias-label-secondary, #454d5f);
}
.dshj-md .dshj-md-body blockquote p { margin: 4px 0; }
.dshj-md .dshj-md-body a { color: var(--dsw-alias-brand-primary, #165dff); text-decoration: none; }
.dshj-md .dshj-md-body a:hover { text-decoration: underline; }
.dshj-md .dshj-md-body hr { border: none; border-top: 1px solid var(--dsw-alias-border-l1, #e5e6eb); margin: 20px 0; }
.dshj-md .dshj-md-body table { border-collapse: collapse; margin: 10px 0; width: 100%; font-size: 13px; }
.dshj-md .dshj-md-body th, .dshj-md .dshj-md-body td { border: 1px solid var(--dsw-alias-border-l1, #e5e6eb); padding: 6px 10px; text-align: left; }
.dshj-md .dshj-md-body th { background: var(--dsw-alias-bg-layer-2, #f2f3f5); font-weight: 600; }
.dshj-md .dshj-md-body img { max-width: 100%; border-radius: 4px; }

/* ── outputs ──────────────────────────────────────────────────────────── */
.dshj-outputs {
  border-top: 1px solid var(--dsw-alias-border-l1, #e5e6eb);
  padding: 6px 10px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--dsw-alias-bg-layer-1, #f9fafb);
}

.dshj-output {
  font-size: 12.5px;
  line-height: 1.6;
  overflow-wrap: break-word;
  color: var(--dsw-alias-label-primary, #000000);
}

.dshj-output-stream {
  padding: 6px 8px;
  background: var(--dsw-alias-bg-layer-2, #f2f3f5);
  border-radius: 4px;
  white-space: pre-wrap;
  font-family: var(--ds-font-family-code, ui-monospace, monospace);
  font-size: 12px;
}
.dshj-output-stream.stderr {
  color: var(--dsw-alias-state-error-primary, #f53f3f);
}

.dshj-output-plain {
  padding: 6px 8px;
  background: var(--dsw-alias-bg-layer-2, #f2f3f5);
  border-radius: 4px;
  white-space: pre-wrap;
  font-family: var(--ds-font-family-code, ui-monospace, monospace);
  font-size: 12px;
}

.dshj-output-html {
  border: 1px solid var(--dsw-alias-border-l1, #e5e6eb);
  border-radius: 4px;
  overflow: auto;
  max-height: 420px;
  background: var(--dsw-alias-bg-base, #ffffff);
}
.dshj-output-html iframe {
  width: 100%;
  border: none;
  display: block;
}

.dshj-output-image {
  max-width: 100%;
  max-height: 480px;
  object-fit: contain;
  border-radius: 4px;
}

.dshj-output-error {
  padding: 8px;
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #f53f3f) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary, #f53f3f) 40%, transparent);
  border-radius: 4px;
  color: var(--dsw-alias-state-error-primary, #f53f3f);
  white-space: pre-wrap;
  font-family: var(--ds-font-family-code, ui-monospace, monospace);
  font-size: 12px;
  overflow-x: auto;
}

.dshj-output-json {
  padding: 6px 8px;
  background: var(--dsw-alias-bg-layer-2, #f2f3f5);
  border-radius: 4px;
  white-space: pre-wrap;
  font-family: var(--ds-font-family-code, ui-monospace, monospace);
  font-size: 12px;
}

.dshj-output-unsupported {
  padding: 4px 8px;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #86909c);
}

/* ── status bar ───────────────────────────────────────────────────────── */
.dshj-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #86909c);
  padding: 4px 10px;
  border-top: 1px solid var(--dsw-alias-border-l1, #e5e6eb);
  flex-shrink: 0;
  background: var(--dsw-alias-bg-layer-2, #f2f3f5);
}
.dshj-status.error {
  color: var(--dsw-alias-state-error-primary, #f53f3f);
}

/* Spinner. */
.dshj-spinner {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 2px solid var(--dsw-alias-border-l1, #e5e6eb);
  border-top-color: var(--dsw-alias-brand-primary, #165dff);
  border-radius: 50%;
  animation: dshj-spin 0.8s linear infinite;
}
@keyframes dshj-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .dshj-editor *,
  .dshj-editor *::before,
  .dshj-editor *::after {
    animation: none !important;
    transition: none !important;
  }
}
`;
		/** Inject or refresh the stylesheet (idempotent across plugin HMR reloads). */
		function injectPanelCss() {
			const existing = document.querySelector("style[data-dshj-css]");
			if (existing !== null) {
				existing.textContent = PANEL_CSS;
				return;
			}
			const tag = document.createElement("style");
			tag.dataset.dshjCss = "";
			tag.textContent = PANEL_CSS;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region src/client/text-editor.tsx
		/**
		* Plain-text/code editor body for the native right-sidebar tab. It reuses the
		* same tab surface as the notebook and the official text preview, adding
		* editing and a version-guarded save through the host filesystem routes.
		* @module dsh-jupyter/client/text-editor
		*/
		/** One editable text file in the right sidebar. */
		function TextEditor({ sessionId, useTabInfo, t }) {
			const { tab } = useTabInfo();
			const path = (0, react.useMemo)(() => fileOf(tab.contentId)?.path ?? "", [tab.contentId]);
			const api = (0, react.useMemo)(() => new JupyterApi(), []);
			const [text, setText] = (0, react.useState)("");
			const [savedText, setSavedText] = (0, react.useState)("");
			const [version, setVersion] = (0, react.useState)("");
			const [loading, setLoading] = (0, react.useState)(true);
			const [saving, setSaving] = (0, react.useState)(false);
			const [status, setStatus] = (0, react.useState)("");
			const [statusError, setStatusError] = (0, react.useState)(false);
			const loadSeq = (0, react.useRef)(0);
			const flashSeq = (0, react.useRef)(0);
			const flash = (0, react.useCallback)((message, isError = false) => {
				setStatus(message);
				setStatusError(isError);
				const seq = ++flashSeq.current;
				setTimeout(() => {
					if (flashSeq.current === seq) setStatus("");
				}, 3e3);
			}, []);
			const reload = (0, react.useCallback)(async () => {
				const seq = ++loadSeq.current;
				if (path === "") return;
				setLoading(true);
				const result = await api.readText(sessionId, path, tab.signal);
				if (seq !== loadSeq.current || tab.signal.aborted) return;
				setLoading(false);
				if (!result.ok) {
					setStatus(result.error.message);
					setStatusError(true);
					setText("");
					setSavedText("");
					return;
				}
				setText(result.value.text);
				setSavedText(result.value.text);
				setVersion(result.value.version);
				setStatus("");
				setStatusError(false);
			}, [
				api,
				path,
				sessionId,
				tab.signal
			]);
			(0, react.useEffect)(() => {
				reload();
			}, [reload]);
			(0, react.useEffect)(() => tab.actions.bindCommands({ refresh: () => void reload() }), [tab.actions, reload]);
			const dirty = text !== savedText;
			const save = (0, react.useCallback)(async () => {
				if (path === "" || !dirty) return;
				setSaving(true);
				const result = await api.writeText(sessionId, path, text, version);
				setSaving(false);
				if (!result.ok) {
					flash(result.error.message, true);
					return;
				}
				setVersion(result.value.version);
				setSavedText(text);
				flash(t("saved"));
			}, [
				api,
				path,
				sessionId,
				text,
				version,
				dirty,
				flash,
				t
			]);
			(0, react.useEffect)(() => {
				if (!tab.visible) return;
				const onKeyDown = (event) => {
					if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s" && !loading) {
						event.preventDefault();
						save();
					}
				};
				window.addEventListener("keydown", onKeyDown);
				return () => window.removeEventListener("keydown", onKeyDown);
			}, [
				loading,
				save,
				tab.visible
			]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dshj-editor dshj-text-editor",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dshj-toolbar",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dshj-path-badge",
								title: path,
								children: path
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "dshj-toolbar-spacer" }),
							dirty && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dshj-dirty",
								children: t("modified")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dshj-toolbar-btn primary",
								disabled: loading || saving || !dirty,
								onClick: () => void save(),
								children: saving ? t("saving") : t("save")
							})
						]
					}),
					loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshj-empty",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dshj-md-body",
							children: t("loading")
						})
					}) : statusError && text === "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshj-empty",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dshj-empty-error",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dshj-md-body",
								children: status
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dshj-empty-actions",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dshj-toolbar-btn",
									onClick: () => void reload(),
									children: t("reload")
								})
							})]
						})
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshj-text-body",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CodeEditor, {
							value: text,
							language: languageOf(path),
							onChange: setText
						})
					}),
					status !== "" && !statusError && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshj-status",
						children: status
					}),
					statusError && text !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshj-status error",
						children: status
					})
				]
			});
		}
		//#endregion
		//#region src/client/index.ts
		/** Tab-type identity: the package name (unique across every registration). */
		const TAB_ID = "@kikulmj/dsh-jupyter";
		/** Tab kind discriminator. */
		const TAB_KIND = "ipynb";
		/** Text-editor tab identity/kind. */
		const TEXT_TAB_ID = "@kikulmj/dsh-jupyter/text";
		const TEXT_TAB_KIND = "text-edit";
		/**
		* Editable text/code files. Markdown, HTML, CSV, images and office documents
		* keep the official viewer: their previews are richer than a raw text editor.
		*/
		const TEXT_PATTERNS = [
			"*.py",
			"*.pyw",
			"*.pyi",
			"*.js",
			"*.jsx",
			"*.mjs",
			"*.cjs",
			"*.ts",
			"*.tsx",
			"*.mts",
			"*.cts",
			"*.vue",
			"*.svelte",
			"*.java",
			"*.c",
			"*.h",
			"*.cc",
			"*.cpp",
			"*.cxx",
			"*.hpp",
			"*.hh",
			"*.cs",
			"*.go",
			"*.rs",
			"*.rb",
			"*.php",
			"*.lua",
			"*.r",
			"*.swift",
			"*.kt",
			"*.kts",
			"*.scala",
			"*.dart",
			"*.sh",
			"*.bash",
			"*.zsh",
			"*.fish",
			"*.ps1",
			"*.bat",
			"*.cmd",
			"*.sql",
			"*.json",
			"*.jsonc",
			"*.yaml",
			"*.yml",
			"*.toml",
			"*.ini",
			"*.cfg",
			"*.conf",
			"*.properties",
			"*.env",
			"*.txt",
			"*.text",
			"*.log",
			"*.md",
			"*.markdown",
			"*.mdx",
			"*.rst",
			"*.adoc",
			"*.css",
			"*.scss",
			"*.less",
			"*.sass",
			"*.xml",
			"*.gradle",
			"*.tex",
			"*.proto",
			"*.graphql",
			"*.gql",
			"LICENSE",
			"LICENCE",
			"README",
			"CHANGELOG",
			"NOTICE",
			"AUTHORS",
			"CONTRIBUTING",
			"Makefile",
			"Dockerfile",
			"Rakefile",
			"Gemfile",
			".gitignore",
			".gitattributes",
			".editorconfig",
			".npmrc",
			".prettierrc",
			".eslintrc"
		];
		/** The tab type this plugin contributes. */
		const DEFINITION = {
			id: TAB_ID,
			kind: TAB_KIND,
			patterns: ["*.ipynb"],
			priority: "extension",
			keepMounted: true,
			canOpen: (address) => {
				const file = fileOf(address);
				return file !== null && file.path.toLowerCase().endsWith(".ipynb");
			},
			title: titleOf
		};
		/** The editable-text tab type. */
		const TEXT_DEFINITION = {
			id: TEXT_TAB_ID,
			kind: TEXT_TAB_KIND,
			patterns: TEXT_PATTERNS,
			priority: "extension",
			keepMounted: true,
			canOpen: (address) => fileOf(address) !== null,
			title: titleOf
		};
		/** Required client services: slot registry, tab-type registry, copy. */
		const inject = [
			"slots",
			"sidebarRightTabs",
			"locale"
		];
		/**
		* Register the notebook tab type and its body.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			try {
				injectPanelCss();
				ctx.effect(() => ctx.locale.register(NS, dictionaries), "dsh-jupyter: dictionaries");
				ctx.effect(() => ctx.sidebarRightTabs.register(DEFINITION), "dsh-jupyter: ipynb tab type");
				ctx.effect(() => ctx.sidebarRightTabs.register(TEXT_DEFINITION), "dsh-jupyter: text tab type");
				ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
					name: "sidebar.right.pane.tab",
					key: TAB_ID,
					locale: NS,
					inject: (sessionId) => ({ sessionId })
				}, NotebookPanel)), "dsh-jupyter: notebook body");
				ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
					name: "sidebar.right.pane.tab",
					key: TEXT_TAB_ID,
					locale: NS,
					inject: (sessionId) => ({ sessionId })
				}, TextEditor)), "dsh-jupyter: text body");
			} catch (error) {
				console.warn("[dsh-jupyter] registration failed:", error);
			}
		}
		//#endregion
		exports.TAB_ID = TAB_ID;
		exports.TAB_KIND = TAB_KIND;
		exports.TEXT_TAB_ID = TEXT_TAB_ID;
		exports.TEXT_TAB_KIND = TEXT_TAB_KIND;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map