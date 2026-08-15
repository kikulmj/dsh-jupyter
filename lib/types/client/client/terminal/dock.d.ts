/**
 * Terminal dock component (browser half). A fixed-position layer pinned to
 * the left edge of the viewport, above the three-column shell. Hosts one
 * xterm.js Terminal bound to one host PTY session:
 *
 * Lifecycle: the xterm Terminal + its container stay mounted for the dock's
 * lifetime (never disposed on collapse — only hidden via CSS), so a collapsed
 * terminal keeps its shell, scrollback and stream alive. The PTY is created
 * lazily on first expand; dispose happens on explicit "close" or dock unmount.
 *
 * Output: NDJSON stream → term.write(data); on exit the status dot turns red.
 * Input: term.onData → api.input(id, data). Resize: ResizeObserver + fit() →
 * api.resize(id, cols, rows).
 *
 * The chrome (header, rail, borders, buttons) uses the harness --dsw-* design
 * tokens so it matches the built-in shell; the terminal viewport carries a
 * fixed dark theme (standard for terminals).
 * @module dsh-jupyter/client/terminal/dock
 */
import type { TerminalApi } from './api.ts';
/** Props injected by the mount closure. */
export interface TerminalDockProps {
    /** The terminal API client. */
    api: TerminalApi;
    /** The current project root (session cwd) to spawn the shell in ('' = host default). */
    root: string;
}
/**
 * The terminal dock.
 * @param props - api + current project root.
 */
export declare function TerminalDock({ api, root }: TerminalDockProps): import("react").JSX.Element;
