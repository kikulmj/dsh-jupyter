/**
 * Small tokenizer for the notebook and text editors. It returns escaped HTML
 * with token spans; editors paint it behind a transparent textarea, so the
 * textarea keeps native editing, selection and IME behavior.
 * @module dsh-jupyter/client/highlight
 */
/** A language family the tokenizer distinguishes. */
export type CodeLanguage = 'python' | 'javascript' | 'typescript' | 'c' | 'shell' | 'sql' | 'json' | 'yaml' | 'generic';
/**
 * Highlight source code.
 * @param source - the file or cell source.
 * @param language - the language family.
 * @returns escaped HTML with token spans.
 */
export declare function highlightCode(source: string, language?: CodeLanguage): string;
/** Highlight Python source (the notebook cell editor). */
export declare function highlightPython(source: string): string;
/** Map a file path to the tokenizer's language family. */
export declare function languageOf(path: string): CodeLanguage;
