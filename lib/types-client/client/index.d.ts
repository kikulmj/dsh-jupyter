/**
 * Browser-half entry for the dsh-jupyter plugin.
 *
 * Registers `.ipynb` as a native right-sidebar tab type: clicking the file in
 * the built-in Files tree opens it in the same docking surface as the text
 * preview (tabs, split, fullscreen, persistence and theme are the product's
 * own), and the body slot renders the notebook editor. No DOM injection and no
 * polling: the product's tab registry owns routing.
 * @module dsh-jupyter/client
 */
import type { Context } from '@deepseek-ai/cordis';
/** Tab-type identity: the package name (unique across every registration). */
export declare const TAB_ID = "@dsh-local/dsh-jupyter";
/** Tab kind discriminator. */
export declare const TAB_KIND = "ipynb";
/** Text-editor tab identity/kind. */
export declare const TEXT_TAB_ID = "@dsh-local/dsh-jupyter/text";
export declare const TEXT_TAB_KIND = "text-edit";
/** Required client services: slot registry, tab-type registry, copy. */
export declare const inject: string[];
/**
 * Register the notebook tab type and its body.
 * @param ctx - client root context.
 */
export declare function apply(ctx: Context): void;
