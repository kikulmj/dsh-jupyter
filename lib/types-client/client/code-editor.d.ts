/**
 * Code editor: a transparent textarea over a highlighted `<pre>`.
 * Editing, selection, IME and the caret stay native; the overlay only paints
 * tokens. Tab indents, Shift+Tab dedents, Enter keeps indentation.
 * @module dsh-jupyter/client/code-editor
 */
import type { JSX } from 'react';
import { type CodeLanguage } from './highlight.ts';
/** Props for {@link CodeEditor}. */
export declare function CodeEditor({ value, autoFocus, language, onChange, onKeyDown, }: {
    value: string;
    autoFocus?: boolean;
    language?: CodeLanguage;
    onChange: (source: string) => void;
    onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}): JSX.Element;
