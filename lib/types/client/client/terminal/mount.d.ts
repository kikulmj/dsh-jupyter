/**
 * Panel view mounting (mirrors the dsh-ssh mount pattern).
 *
 * The `conversation` slot is single-occupant (ui-conversation) and external
 * plugins cannot declare slots, so the panel takes over the center column at
 * the DOM level: a container is appended inside the `[data-pane="conversation"]`
 * grid item (an extra trailing child React never manages), and a stylesheet
 * rule hides the conversation content while the panel is active. Toggling is
 * a data attribute on <html> — no React involvement, so the conversation
 * subtree underneath stays mounted and stateful.
 *
 * Cross-plugin exclusivity (ssh / task board): opening this panel evicts the
 * siblings both by removing their activation attributes and by dispatching
 * the shared `dsh-panel-activate` event; when a sibling activates, this panel
 * closes.
 * @module dsh-jupyter/client/terminal/mount
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import type { TerminalApi } from './api.ts';
import type { TerminalController } from './controller.ts';
/** The injected panel container (kept in the DOM, hidden when inactive). */
export declare const PANEL_VIEW_SELECTOR = "[data-dsh-terminal-view]";
/**
 * Mount the panel React tree into the center column and bind its visibility
 * to the controller's panelOpen state.
 * @param ctx - client root context (sessions for the project root).
 * @param controller - the panel state owner.
 * @param api - the terminal API client.
 * @returns disposer unmounting the tree and restoring the column.
 */
export declare function mountPanel(ctx: ClientContext, controller: TerminalController, api: TerminalApi): () => void;
