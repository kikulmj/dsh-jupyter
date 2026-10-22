/**
 * Plain-text/code editor body for the native right-sidebar tab. It reuses the
 * same tab surface as the notebook and the official text preview, adding
 * editing and a version-guarded save through the host filesystem routes.
 * @module dsh-jupyter/client/text-editor
 */
import type { JSX } from 'react';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { UseSidebarRightTabInfo } from '@deepseek-ai/dsh-client-ui-sidebar-right/client';
/** The text editor body props (tab seat). */
export interface TextEditorProps {
    sessionId: string;
    useTabInfo: UseSidebarRightTabInfo;
    t: TranslateNS<'dsh-jupyter'>;
}
/** One editable text file in the right sidebar. */
export declare function TextEditor({ sessionId, useTabInfo, t }: TextEditorProps): JSX.Element;
