/**
 * Preview-column injection: the notebook editor mounts INSIDE the built-in
 * preview column (aionui-panel). Clicking a .ipynb in the explorer opens a
 * preview tab whose content is an "unsupported" placeholder (the panel's
 * content-type table is hardcoded and has no extension point); this plugin
 * detects the active .ipynb tab and overlays the notebook editor on the
 * column's content area. The tab strip, width drag, collapse and dark theme
 * all stay the built-in ones.
 *
 * Injection placement (important): the editor host is appended as a direct
 * child of the preview COLUMN, not of the React-managed content container.
 * The column is plain DOM created by aionui-panel's layout controller, so
 * React reconciliation never touches the host — no re-inject loop, no DOM
 * churn during handle drags. The host covers the content region (below the
 * tab bar + toolbar) via absolute positioning and follows the column size
 * with a ResizeObserver.
 *
 * Side-effect discipline: nothing observes document.body once the column is
 * found; a cheap interval syncs the editor with the active tab. Dragging the
 * built-in handles mutates frame/body styles, never the column's subtree, so
 * it never wakes this plugin.
 * @module dsh-jupyter/client/mount
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import type { JupyterApi } from './api.ts';
/**
 * Mount the notebook editor into the built-in preview column.
 * @param ctx - client root context (sessions for the project root).
 * @param api - the /dsh-jupyter API client.
 * @returns disposer removing the observer and any injected tree.
 */
export declare function mountPanel(ctx: ClientContext, api: JupyterApi): () => void;
