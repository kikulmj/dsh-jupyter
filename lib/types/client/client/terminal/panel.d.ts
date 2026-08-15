/**
 * Terminal panel (mirrors the dsh-ssh panel + terminal-tab design).
 *
 * The panel shell is a header (title + shell badge + actions) above the
 * terminal body; the xterm view is one PTY session spawned on first open.
 * The panel lives inside the center-column takeover container and stays
 * mounted across open/close (visibility is html-attribute driven by mount.tsx),
 * so a closed panel keeps its shell, scrollback and stream alive — the shell
 * only ends on an explicit restart, `exit`, or panel unmount.
 *
 * xterm's stylesheet ships as an embedded string (xterm.css.ts, generated at
 * build time — the ?raw suffix is not resolvable by the tsdown pipeline, same
 * approach as dsh-ssh) and is injected once per page load.
 * @module dsh-jupyter/client/terminal/panel
 */
import type { TerminalApi } from './api.ts';
import type { TerminalController } from './controller.ts';
/** Panel props (controller + api + spawn root). */
export interface TerminalPanelProps {
    controller: TerminalController;
    api: TerminalApi;
    /** The current project root (session cwd) to spawn the shell in ('' = host default). */
    root: string;
}
/** The terminal panel view. */
export declare function TerminalPanel({ controller, api, root }: TerminalPanelProps): import("react").JSX.Element;
