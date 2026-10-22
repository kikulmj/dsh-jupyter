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
export const PANEL_CSS = `
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
`

/** Inject or refresh the stylesheet (idempotent across plugin HMR reloads). */
export function injectPanelCss(): void {
  const existing = document.querySelector<HTMLStyleElement>('style[data-dshj-css]')
  if (existing !== null) {
    existing.textContent = PANEL_CSS
    return
  }
  const tag = document.createElement('style')
  tag.dataset.dshjCss = ''
  tag.textContent = PANEL_CSS
  document.head.appendChild(tag)
}
