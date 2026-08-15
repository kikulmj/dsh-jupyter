/**
 * Browser-half entry for the dsh-jupyter plugin — runs inside the dsh web GUI.
 *
 * Registers the locale dictionaries and mounts the notebook editor INTO the
 * built-in preview column (aionui-panel): when the active preview tab is a
 * .ipynb, the editor overlays the tab's content container — the tab strip,
 * width drag, collapse and dark theme stay the built-in ones. Failure policy:
 * DOM mounting problems are logged, never thrown — the web shell fails the
 * whole boot when a plugin apply throws.
 *
 * Export discipline (packages/client rule): the /client surface carries what
 * cordis loading needs plus types only — all value exports stay internal.
 * @module dsh-jupyter/client
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type JupyterKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** dsh-jupyter surface copy. */
        'dsh-jupyter': JupyterKey;
    }
}
/** Required services: sessions (project root) and locale (copy). */
export declare const inject: string[];
/** Type-only surface (export discipline: no value exports beyond the plugin contract). */
export type { NotebookPanel } from './panel.tsx';
export type { TerminalPanel } from './terminal/panel.tsx';
/**
 * Mount the notebook editor into the built-in preview column, and the
 * terminal (sidebar entry + center-column panel, dsh-ssh style).
 * @param ctx - client root context (sessions + locale services).
 */
export declare function apply(ctx: ClientContext): void;
