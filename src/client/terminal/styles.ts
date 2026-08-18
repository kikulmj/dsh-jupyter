/**
 * Terminal panel styles — frosted-glass (transparent blur) design.
 *
 * The center-column takeover keeps the conversation subtree mounted UNDER the
 * panel (not hidden): the panel container is a translucent layer with
 * `backdrop-filter: blur()` over the live conversation, so the terminal floats
 * on a true frosted-glass surface that follows the active theme (light/dark
 * via `body[data-ds-dark-theme]`). All chrome rides the dsh --dsw-* tokens;
 * the terminal card itself is a deeper translucent pane so glyphs stay legible
 * over whatever the blurred conversation shows behind.
 *
 * Scoped by the plugin's own data attributes and class prefixes so nothing
 * leaks into the rest of the GUI. The takeover rules are attribute-scoped and
 * must stay in this stylesheet (it is injected on mount).
 * @module dsh-jupyter/client/terminal/styles
 */

/** The full stylesheet text injected once on mount. */
export const TERMINAL_PANEL_CSS = `
/* --- center-column takeover (global rules, scoped to the plugin's own
       data attributes; the column is matched by data-pane — ≤0.1.0-rc.6 —
       or by a css-module class containing "centerCol" — 0.1.0-rc.7+, which
       dropped the attribute) ----------------------------------------------- */

[data-pane='conversation'], [class*='centerCol'] {
  position: relative;
}

/* The frosted-glass layer: translucent tint + backdrop blur over the live
   conversation (which stays mounted underneath — NOT display:none, so the
   blur has real content to refract). Kept noticeably transparent so the
   blurred conversation tints through; the terminal card stacks its own pane
   on top. */
[data-dsh-terminal-view] {
  position: absolute;
  inset: 0;
  display: none;
  /* Above the conversation composer (z-index 7 in the 0.1.0-rc.6 shell). */
  z-index: 60;
  /* Frosted tint + a faint ambient-light wash so the glass reads even over an
     empty conversation; the backdrop blur refracts whatever is underneath. */
  background:
    radial-gradient(1200px 640px at 12% -12%, rgba(120, 170, 240, 0.14), rgba(120, 170, 240, 0) 58%),
    radial-gradient(900px 500px at 108% 112%, rgba(160, 130, 240, 0.1), rgba(160, 130, 240, 0) 55%),
    rgba(247, 249, 252, 0.38);
  -webkit-backdrop-filter: blur(22px) saturate(170%);
  backdrop-filter: blur(22px) saturate(170%);
}
body[data-ds-dark-theme] [data-dsh-terminal-view] {
  background:
    radial-gradient(1200px 640px at 12% -12%, rgba(80, 130, 220, 0.16), rgba(80, 130, 220, 0) 58%),
    radial-gradient(900px 500px at 108% 112%, rgba(120, 90, 200, 0.12), rgba(120, 90, 200, 0) 55%),
    rgba(9, 12, 17, 0.45);
}

/* The center column is single-occupant; the :not() guards keep the three
   sibling panels (task board / ssh / terminal) from fighting over visibility
   if two activation attributes ever coexist. */
html[data-dsh-terminal-active]:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]) [data-dsh-terminal-view] {
  display: block;
}

/* --- sidebar entry row (mirrors the ssh entry) ------------------------------ */

.dst-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 32px;
  padding: 0 12px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}

.dst-entry:hover {
  background: var(--dsw-specific-sidebar-nav-item-hover);
  color: var(--dsw-alias-label-primary);
}

.dst-entry[data-active] {
  background: var(--dsw-specific-sidebar-nav-item-active);
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}

.dst-entry-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

.dst-entry-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Collapsed rail: icon-only, centered, matching the shell's 56px rail. */
[data-dsh-frame][data-sidebar-collapsed] .dst-entry {
  justify-content: center;
  padding: 0;
  width: 100%;
}

[data-dsh-frame][data-sidebar-collapsed] .dst-entry-label {
  display: none;
}

/* --- panel frame (frosted) -------------------------------------------------- */

.dst-view {
  overflow: hidden;
}

.dst-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  min-height: 0;
  padding: 16px 18px 18px;
  gap: 12px;
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family);
}

.dst-panel-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}

.dst-title-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  color: var(--dsw-alias-state-business-primary);
}

.dst-panel-title {
  margin: 0;
  flex: none;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.2px;
  color: var(--dsw-alias-label-primary);
  white-space: nowrap;
}

.dst-shell-badge {
  display: inline-block;
  padding: 2px 9px;
  font-size: 11px;
  line-height: 1.5;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.dst-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
  white-space: nowrap;
}

.dst-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dsw-alias-state-success-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-success-primary) 22%, transparent);
  flex: none;
}

.dst-status[data-status='connecting'] .dst-status-dot {
  background: var(--dsw-alias-state-warn-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-warn-primary) 22%, transparent);
}

.dst-status[data-status='exited'] .dst-status-dot {
  background: var(--dsw-alias-state-error-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-error-primary) 22%, transparent);
}

.dst-toolbar-spacer {
  flex: 1;
}

/* Icon buttons: 28px glass chips, SVG glyphs. */
.dst-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: rgba(127, 127, 127, 0.12);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 55%, transparent);
  border: 1px solid rgba(127, 127, 127, 0.2);
  border: 1px solid color-mix(in srgb, var(--dsw-alias-border-l2) 65%, transparent);
  border-radius: 8px;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  transition: background var(--ds-transition-duration-fast) var(--ds-ease-in-out),
    color var(--ds-transition-duration-fast) var(--ds-ease-in-out),
    border-color var(--ds-transition-duration-fast) var(--ds-ease-in-out);
}

.dst-icon-btn svg {
  display: block;
}

.dst-icon-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-border-l2);
}

.dst-icon-btn[data-danger='true']:hover {
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent);
  color: var(--dsw-alias-state-error-primary);
  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, transparent);
}

.dst-icon-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.dst-icon-btn:disabled:hover {
  background: rgba(127, 127, 127, 0.12);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 55%, transparent);
  color: var(--dsw-alias-label-secondary);
  border-color: rgba(127, 127, 127, 0.2);
  border-color: color-mix(in srgb, var(--dsw-alias-border-l2) 65%, transparent);
}

/* --- terminal body (frosted pane) ------------------------------------------- */

.dst-term-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.dst-term-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 12px;
  overflow: hidden;
  /* Frosted pane — NOT a solid black card: a strong translucent tint plus a
     top edge highlight, so the blurred conversation clearly reads through.
     Alpha is kept low on purpose (terminal glyphs stay crisp thanks to the
     bright Nord foreground). */
  background:
    linear-gradient(180deg, rgba(148, 163, 184, 0.16), rgba(148, 163, 184, 0.05) 34%, rgba(148, 163, 184, 0) 62%),
    rgba(13, 18, 27, 0.4);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 12px 32px rgba(0, 0, 0, 0.24);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
}

body[data-ds-dark-theme] .dst-term-wrap {
  background:
    linear-gradient(180deg, rgba(148, 163, 184, 0.14), rgba(148, 163, 184, 0.04) 34%, rgba(148, 163, 184, 0) 62%),
    rgba(12, 16, 24, 0.38);
}

/* Fallback for browsers without backdrop-filter: raise the tint so the pane
   stays readable even though the glass has nothing to refract. */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .dst-term-wrap {
    background: rgba(10, 14, 21, 0.82);
  }
}

.dst-term-container {
  position: absolute;
  inset: 0;
  padding: 10px 12px;
}

/* The xterm canvas must not paint its own background: the glass shows through. */
.dst-term-container .xterm,
.dst-term-container .xterm-screen,
.dst-term-container canvas {
  background: transparent !important;
}

.dst-term-container .xterm-viewport {
  background: transparent !important;
}

.dst-term-placeholder {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 24px;
  text-align: center;
  font-size: 12.5px;
  color: var(--dsw-alias-label-tertiary);
  background: rgba(13, 18, 27, 0.45);
}

/* --- xterm helper textarea (IME): keep it out of the way -------------------- */
.dst-term-container .xterm-helper-textarea {
  position: absolute;
  opacity: 0;
  left: -9999em;
}
`

/** Inject the panel stylesheet once (idempotent). */
export function injectTerminalPanelCss(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById('dsh-terminal-panel-css') !== null) return
  const style = document.createElement('style')
  style.id = 'dsh-terminal-panel-css'
  style.textContent = TERMINAL_PANEL_CSS
  document.head.appendChild(style)
}
