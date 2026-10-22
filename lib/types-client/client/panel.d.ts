/**
 * Notebook editor component — the body of the native `.ipynb` right-sidebar
 * tab. It edits code/markdown/raw cells, saves back through the host routes,
 * and runs cells through the shared kernel bridge (streaming outputs). Visual
 * language follows the product's theme tokens (`--dsw-*`).
 * @module dsh-jupyter/client/panel
 */
import type { JSX } from 'react';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { UseSidebarRightTabInfo } from '@deepseek-ai/dsh-client-ui-sidebar-right/client';
/** The notebook editor (the body of one `.ipynb` tab). */
export interface NotebookPanelProps {
    /** The Session that authorizes file access (injected by the tab seat). */
    sessionId: string;
    /** The tab's live information hook (body seat). */
    useTabInfo: UseSidebarRightTabInfo;
    /** Copy for this plugin's locale namespace. */
    t: TranslateNS<'dsh-jupyter'>;
}
/**
 * The notebook editor (the body of one `.ipynb` tab).
 * @param sessionId - the Session that authorizes file access.
 * @param useTabInfo - the tab's live information hook.
 * @param t - copy for this plugin's locale namespace.
 */
export declare function NotebookPanel({ sessionId, useTabInfo, t }: NotebookPanelProps): JSX.Element;
