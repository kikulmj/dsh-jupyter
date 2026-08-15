/**
 * Notebook editor styles. The editor is injected into the built-in preview
 * column, so the visual language reuses the panel's design tokens (`--aion-*`,
 * injected globally by aionui-panel; `body[data-ds-dark-theme]` flips them)
 * and its measured values (36px bars, 32px toolbars, 13px mono editors) —
 * the notebook editor looks exactly like the built-in preview. This
 * stylesheet only adds the notebook-specific structures (cell cards, output
 * blocks) on top; the editor root fills its container (no own positioning).
 * @module dsh-jupyter/client/styles
 */

/** The full stylesheet text injected once on mount. */
export const PANEL_CSS = `
/* ── editor root: fills the injected container ───────────────────────── */
.dshj-editor {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  background: var(--aion-bg-1, #f9fafb);
  font-family: var(--aion-font-sans, -apple-system, "system-ui", "Segoe UI", Roboto, sans-serif);
  font-size: 13px;
  color: var(--aion-text-primary, #000000);
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
  background: var(--aion-bg-3, #e5e6eb);
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
  background: var(--aion-bg-2, #f2f3f5);
  border-bottom: 1px solid var(--aion-bg-3, #e5e6eb);
  overflow-x: auto;
  scrollbar-width: none;
}
.dshj-toolbar::-webkit-scrollbar {
  display: none;
}
.dshj-toolbar-spacer {
  flex: 1;
}

.dshj-path-badge {
  font-size: 11px;
  color: var(--aion-text-tertiary, #86909c);
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
  color: var(--aion-text-secondary, #454d5f);
  font-size: 12px;
  font-family: var(--aion-font-sans, sans-serif);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), color 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}
.dshj-toolbar-btn:hover {
  background: var(--aion-bg-3, #e5e6eb);
  color: var(--aion-text-primary, #000000);
}
.dshj-toolbar-btn:active {
  background: var(--aion-bg-active, #e5e6eb);
  color: var(--aion-text-primary, #000000);
}
.dshj-toolbar-btn:focus-visible {
  outline: 2px solid var(--aion-primary, #165dff);
  outline-offset: 2px;
}
.dshj-toolbar-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.dshj-toolbar-btn:disabled:hover {
  background: transparent;
  color: var(--aion-text-secondary, #454d5f);
}
.dshj-toolbar-btn.primary {
  color: var(--aion-primary, #165dff);
}

.dshj-kernel-dot {
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  background: var(--aion-text-tertiary, #86909c);
  display: inline-block;
  flex-shrink: 0;
}
.dshj-kernel-dot.ready {
  background: var(--aion-success, #00b42a);
}
.dshj-kernel-dot.busy {
  background: var(--aion-warning, #ff7d00);
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
  align-items: center;
  justify-content: center;
  color: var(--aion-text-secondary, #454d5f);
  font-size: 13px;
  padding: 24px;
  text-align: center;
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
  border: 1px solid var(--aion-bg-3, #e5e6eb);
  border-radius: 8px;
  background: var(--aion-bg-base, #ffffff);
  overflow: hidden;
  flex-shrink: 0;
}
.dshj-cell.running {
  border-color: var(--aion-primary, #165dff);
  box-shadow: 0 0 0 1px var(--aion-primary, #165dff);
}

.dshj-cell-head {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 8px;
  background: var(--aion-bg-2, #f2f3f5);
  border-bottom: 1px solid var(--aion-bg-3, #e5e6eb);
  font-size: 11px;
  color: var(--aion-text-tertiary, #86909c);
}
.dshj-cell-type {
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.dshj-cell-count {
  font-family: var(--aion-font-mono, ui-monospace, monospace);
  font-size: 11px;
  color: var(--aion-text-tertiary, #86909c);
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
  color: var(--aion-text-tertiary, #86909c);
  font-size: 11px;
  font-family: var(--aion-font-sans, sans-serif);
  cursor: pointer;
  border-radius: 3px;
  transition: background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), color 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}
.dshj-mini-btn:hover {
  background: var(--aion-bg-3, #e5e6eb);
  color: var(--aion-text-primary, #000000);
}
.dshj-mini-btn.run {
  color: var(--aion-primary, #165dff);
  font-weight: 600;
}
.dshj-mini-btn.warn:hover {
  color: var(--aion-danger, #f53f3f);
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
  background: var(--aion-bg-base, #ffffff);
  color: var(--aion-text-primary, #000000);
  font-family: var(--aion-font-mono, ui-monospace, monospace);
  font-size: 13px;
  line-height: 1.6;
  padding: 10px 12px;
  tab-size: 2;
  display: block;
}
.dshj-source:focus-visible {
  box-shadow: inset 0 0 0 2px var(--aion-primary, #165dff);
}

/* Markdown cell: preview mirrors the built-in markdown viewer. */
.dshj-md {
  padding: 10px 14px 14px;
  overflow-x: auto;
}
.dshj-md .dshj-md-body {
  font-size: 14px;
  line-height: 1.7;
  color: var(--aion-text-primary, #000000);
  word-wrap: break-word;
}
.dshj-md .dshj-md-body h1 { font-size: 22px; font-weight: 600; margin: 20px 0 10px; padding-bottom: 6px; border-bottom: 1px solid var(--aion-bg-3, #e5e6eb); line-height: 1.3; }
.dshj-md .dshj-md-body h1:first-child { margin-top: 4px; }
.dshj-md .dshj-md-body h2 { font-size: 19px; font-weight: 600; margin: 18px 0 8px; line-height: 1.3; }
.dshj-md .dshj-md-body h3 { font-size: 16px; font-weight: 600; margin: 14px 0 6px; line-height: 1.3; }
.dshj-md .dshj-md-body h4, .dshj-md .dshj-md-body h5, .dshj-md .dshj-md-body h6 { font-size: 14px; font-weight: 600; margin: 12px 0 5px; line-height: 1.3; }
.dshj-md .dshj-md-body p { margin: 8px 0; }
.dshj-md .dshj-md-body ul, .dshj-md .dshj-md-body ol { margin: 8px 0; padding-left: 24px; }
.dshj-md .dshj-md-body li { margin: 3px 0; }
.dshj-md .dshj-md-body code {
  font-family: var(--aion-font-mono, ui-monospace, monospace);
  font-size: 0.9em;
  background: var(--aion-bg-2, #f2f3f5);
  border-radius: 3px;
  padding: 1px 5px;
  color: var(--aion-text-primary, #000000);
}
.dshj-md .dshj-md-body pre {
  margin: 10px 0;
  padding: 12px 14px;
  background: var(--aion-bg-2, #f2f3f5);
  border-radius: 6px;
  overflow-x: auto;
  line-height: 1.5;
}
.dshj-md .dshj-md-body pre code { background: transparent; padding: 0; font-size: 13px; }
.dshj-md .dshj-md-body blockquote {
  margin: 10px 0;
  padding: 4px 14px;
  border-left: 3px solid var(--aion-bg-3, #e5e6eb);
  color: var(--aion-text-secondary, #454d5f);
}
.dshj-md .dshj-md-body blockquote p { margin: 4px 0; }
.dshj-md .dshj-md-body a { color: var(--aion-primary, #165dff); text-decoration: none; }
.dshj-md .dshj-md-body a:hover { text-decoration: underline; }
.dshj-md .dshj-md-body hr { border: none; border-top: 1px solid var(--aion-bg-3, #e5e6eb); margin: 20px 0; }
.dshj-md .dshj-md-body table { border-collapse: collapse; margin: 10px 0; width: 100%; font-size: 13px; }
.dshj-md .dshj-md-body th, .dshj-md .dshj-md-body td { border: 1px solid var(--aion-bg-3, #e5e6eb); padding: 6px 10px; text-align: left; }
.dshj-md .dshj-md-body th { background: var(--aion-bg-2, #f2f3f5); font-weight: 600; }
.dshj-md .dshj-md-body img { max-width: 100%; border-radius: 4px; }

/* ── outputs ──────────────────────────────────────────────────────────── */
.dshj-outputs {
  border-top: 1px solid var(--aion-bg-3, #e5e6eb);
  padding: 6px 10px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--aion-bg-1, #f9fafb);
}

.dshj-output {
  font-size: 12.5px;
  line-height: 1.6;
  overflow-wrap: break-word;
  color: var(--aion-text-primary, #000000);
}

.dshj-output-stream {
  padding: 6px 8px;
  background: var(--aion-bg-2, #f2f3f5);
  border-radius: 4px;
  white-space: pre-wrap;
  font-family: var(--aion-font-mono, ui-monospace, monospace);
  font-size: 12px;
}
.dshj-output-stream.stderr {
  color: var(--aion-danger, #f53f3f);
}

.dshj-output-plain {
  padding: 6px 8px;
  background: var(--aion-bg-2, #f2f3f5);
  border-radius: 4px;
  white-space: pre-wrap;
  font-family: var(--aion-font-mono, ui-monospace, monospace);
  font-size: 12px;
}

.dshj-output-html {
  border: 1px solid var(--aion-bg-3, #e5e6eb);
  border-radius: 4px;
  overflow: auto;
  max-height: 420px;
  background: var(--aion-bg-base, #ffffff);
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
  background: color-mix(in srgb, var(--aion-danger, #f53f3f) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--aion-danger, #f53f3f) 40%, transparent);
  border-radius: 4px;
  color: var(--aion-danger, #f53f3f);
  white-space: pre-wrap;
  font-family: var(--aion-font-mono, ui-monospace, monospace);
  font-size: 12px;
  overflow-x: auto;
}

.dshj-output-json {
  padding: 6px 8px;
  background: var(--aion-bg-2, #f2f3f5);
  border-radius: 4px;
  white-space: pre-wrap;
  font-family: var(--aion-font-mono, ui-monospace, monospace);
  font-size: 12px;
}

.dshj-output-unsupported {
  padding: 4px 8px;
  font-size: 11px;
  color: var(--aion-text-tertiary, #86909c);
}

/* ── status bar ───────────────────────────────────────────────────────── */
.dshj-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--aion-text-tertiary, #86909c);
  padding: 4px 10px;
  border-top: 1px solid var(--aion-bg-3, #e5e6eb);
  flex-shrink: 0;
  background: var(--aion-bg-2, #f2f3f5);
}
.dshj-status.error {
  color: var(--aion-danger, #f53f3f);
}

/* Spinner. */
.dshj-spinner {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 2px solid var(--aion-bg-3, #e5e6eb);
  border-top-color: var(--aion-primary, #165dff);
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
`

/** Inject the stylesheet once (idempotent). */
export function injectPanelCss(): void {
  if (document.querySelector('style[data-dshj-css]') !== null) return
  const tag = document.createElement('style')
  tag.dataset.dshjCss = ''
  tag.textContent = PANEL_CSS
  document.head.appendChild(tag)
}
