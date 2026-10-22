/**
 * Small tokenizer for the notebook and text editors. It returns escaped HTML
 * with token spans; editors paint it behind a transparent textarea, so the
 * textarea keeps native editing, selection and IME behavior.
 * @module dsh-jupyter/client/highlight
 */

import { escapeHtml } from './markdown.ts'

/** A language family the tokenizer distinguishes. */
export type CodeLanguage =
  | 'python' | 'javascript' | 'typescript' | 'c' | 'shell' | 'sql' | 'json' | 'yaml' | 'generic' | 'plain'

const PYTHON_KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue',
  'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import',
  'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while',
  'with', 'yield', 'match', 'case',
])

const JS_KEYWORDS = new Set([
  'as', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
  'default', 'delete', 'do', 'else', 'export', 'extends', 'false', 'finally', 'for', 'from',
  'function', 'get', 'if', 'import', 'in', 'instanceof', 'interface', 'let', 'new', 'null',
  'of', 'return', 'set', 'static', 'super', 'switch', 'this', 'throw', 'true', 'try', 'type',
  'typeof', 'undefined', 'var', 'void', 'while', 'yield', 'enum', 'implements', 'declare',
  'namespace', 'private', 'protected', 'public', 'readonly', 'abstract', 'satisfies', 'keyof',
])

const C_KEYWORDS = new Set([
  'auto', 'bool', 'break', 'case', 'catch', 'char', 'class', 'const', 'constexpr', 'continue',
  'default', 'delete', 'do', 'double', 'else', 'enum', 'explicit', 'extern', 'false', 'float',
  'for', 'friend', 'if', 'inline', 'int', 'long', 'namespace', 'new', 'nullptr', 'operator',
  'override', 'private', 'protected', 'public', 'return', 'short', 'signed', 'sizeof', 'static',
  'struct', 'switch', 'template', 'this', 'throw', 'true', 'try', 'typedef', 'typename', 'union',
  'unsigned', 'using', 'virtual', 'void', 'volatile', 'while', 'var', 'fun', 'val', 'when',
  'package', 'func', 'go', 'defer', 'chan', 'select', 'range', 'interface', 'impl', 'mut', 'match',
  'pub', 'use', 'mod', 'crate', 'let', 'fn', 'trait', 'where', 'loop', 'move', 'ref', 'dyn',
])

const SHELL_KEYWORDS = new Set([
  'case', 'do', 'done', 'elif', 'else', 'esac', 'export', 'fi', 'for', 'function', 'if', 'in',
  'local', 'readonly', 'return', 'select', 'then', 'until', 'while', 'time', 'alias', 'source',
])

const SQL_KEYWORDS = new Set([
  'add', 'all', 'alter', 'and', 'as', 'asc', 'begin', 'between', 'by', 'case', 'create', 'delete',
  'desc', 'distinct', 'drop', 'else', 'end', 'exists', 'foreign', 'from', 'group', 'having',
  'in', 'index', 'inner', 'insert', 'into', 'is', 'join', 'key', 'left', 'like', 'limit', 'not',
  'null', 'offset', 'on', 'or', 'order', 'outer', 'primary', 'references', 'right', 'select',
  'set', 'table', 'then', 'union', 'unique', 'update', 'values', 'view', 'when', 'where', 'with',
])

const GENERIC_KEYWORDS = new Set([...JS_KEYWORDS, ...C_KEYWORDS, ...SHELL_KEYWORDS, ...SQL_KEYWORDS])

const BUILTINS = new Set([
  'abs', 'all', 'any', 'bool', 'bytearray', 'bytes', 'callable', 'chr', 'classmethod', 'dict',
  'dir', 'divmod', 'enumerate', 'eval', 'exec', 'filter', 'float', 'format', 'frozenset',
  'getattr', 'globals', 'hasattr', 'hash', 'help', 'hex', 'id', 'input', 'int', 'isinstance',
  'issubclass', 'iter', 'len', 'list', 'locals', 'map', 'max', 'min', 'next', 'object', 'oct',
  'open', 'ord', 'pow', 'print', 'property', 'range', 'repr', 'reversed', 'round', 'set',
  'setattr', 'slice', 'sorted', 'staticmethod', 'str', 'sum', 'super', 'tuple', 'type', 'vars',
  'zip', 'Exception', 'BaseException', 'ValueError', 'TypeError', 'KeyError', 'IndexError',
  'RuntimeError', 'StopIteration', 'True', 'False', 'None',
])

const IDENT_START = /[A-Za-z_]/
const IDENT_BODY = /[A-Za-z0-9_]/

/** Keywords for one language family. */
function keywordsOf(language: CodeLanguage): Set<string> {
  switch (language) {
    case 'python': return PYTHON_KEYWORDS
    case 'javascript':
    case 'typescript': return JS_KEYWORDS
    case 'c': return C_KEYWORDS
    case 'shell': return SHELL_KEYWORDS
    case 'sql': return SQL_KEYWORDS
    case 'json': return new Set()
    default: return GENERIC_KEYWORDS
  }
}

/** The line-comment marker, or undefined for a language without one. */
function lineCommentOf(language: CodeLanguage): string | undefined {
  if (language === 'python' || language === 'shell' || language === 'yaml' || language === 'generic') return '#'
  if (language === 'sql') return '--'
  if (language === 'json') return undefined
  return '//'
}

/** Span one token. */
function token(kind: string, text: string): string {
  return `<span class="dshj-tok-${kind}">${escapeHtml(text)}</span>`
}

/** Read a quoted string starting at `start` (the opening quote). */
function readString(source: string, start: number): number {
  const quote = source[start]
  const triple = quote !== '`' && source.startsWith(quote.repeat(3), start)
  const delimiter = triple ? quote.repeat(3) : quote
  let i = start + delimiter.length
  while (i < source.length) {
    if (source[i] === '\\') {
      i += 2
      continue
    }
    if (source.startsWith(delimiter, i)) return i + delimiter.length
    if (!triple && quote !== '`' && source[i] === '\n') return i
    i += 1
  }
  return source.length
}

/**
 * Highlight source code.
 * @param source - the file or cell source.
 * @param language - the language family.
 * @returns escaped HTML with token spans.
 */
export function highlightCode(source: string, language: CodeLanguage = 'generic'): string {
  if (language === 'plain') return escapeHtml(source)
  const python = language === 'python'
  const keywords = keywordsOf(language)
  const lineComment = lineCommentOf(language)
  const blockComments = language === 'javascript' || language === 'typescript' || language === 'c'
  const backticks = language === 'javascript' || language === 'typescript'
  const decorators = python
  let html = ''
  let i = 0
  let lineStart = true
  let afterDef = false

  while (i < source.length) {
    const ch = source[i]

    if (ch === '\n') {
      html += '\n'
      i += 1
      lineStart = true
      continue
    }

    // IPython line magics: paint the whole line, not as Python.
    if (lineStart && python) {
      let j = i
      while (j < source.length && (source[j] === ' ' || source[j] === '\t')) j += 1
      if (source[j] === '!' || source[j] === '%') {
        const end = source.indexOf('\n', j)
        const stop = end === -1 ? source.length : end
        html += escapeHtml(source.slice(i, j))
        html += `<span class="dshj-tok-magic">${escapeHtml(source.slice(j, stop))}</span>`
        i = stop
        lineStart = false
        continue
      }
    }
    lineStart = false

    if (ch === ' ' || ch === '\t') {
      html += ch
      i += 1
      continue
    }

    if (lineComment !== undefined && source.startsWith(lineComment, i)) {
      const end = source.indexOf('\n', i)
      const stop = end === -1 ? source.length : end
      html += token('com', source.slice(i, stop))
      i = stop
      continue
    }

    if (blockComments && source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i + 2)
      const stop = end === -1 ? source.length : end + 2
      html += token('com', source.slice(i, stop))
      i = stop
      continue
    }

    // String prefixes (r, b, f, rb, fr, ...) directly before a quote.
    if (IDENT_START.test(ch)) {
      let j = i
      while (j < source.length && IDENT_BODY.test(source[j])) j += 1
      const word = source.slice(i, j)
      if (python && /^[rRuUbBfF]{1,2}$/.test(word) && (source[j] === '"' || source[j] === "'")) {
        const stop = readString(source, j)
        html += token('str', source.slice(i, stop))
        i = stop
        afterDef = false
        continue
      }
      if (keywords.has(word)) {
        html += token('kw', word)
        afterDef = python && (word === 'def' || word === 'class')
      } else if (python && (word === 'self' || word === 'cls')) {
        html += token('self', word)
        afterDef = false
      } else if (python && BUILTINS.has(word)) {
        html += token('builtin', word)
        afterDef = false
      } else if (afterDef) {
        html += token('fn', word)
        afterDef = false
      } else {
        html += escapeHtml(word)
        afterDef = false
      }
      i = j
      continue
    }

    if (ch === '"' || ch === "'" || (backticks && ch === '`')) {
      const stop = readString(source, i)
      html += token('str', source.slice(i, stop))
      i = stop
      continue
    }

    if (decorators && ch === '@' && IDENT_START.test(source[i + 1] ?? '')) {
      let j = i + 1
      while (j < source.length && (IDENT_BODY.test(source[j]) || source[j] === '.')) j += 1
      html += token('dec', source.slice(i, j))
      i = j
      continue
    }

    if (/[0-9]/.test(ch)) {
      let j = i
      if (source[i] === '0' && /[xXoObB]/.test(source[i + 1] ?? '')) {
        j += 2
        while (j < source.length && /[0-9a-fA-F_]/.test(source[j])) j += 1
      } else {
        while (j < source.length && /[0-9_]/.test(source[j])) j += 1
        if (source[j] === '.') {
          j += 1
          while (j < source.length && /[0-9_]/.test(source[j])) j += 1
        }
        if (/[eE]/.test(source[j] ?? '')) {
          j += 1
          if (/[+-]/.test(source[j] ?? '')) j += 1
          while (j < source.length && /[0-9_]/.test(source[j])) j += 1
        }
        if (/[jJ]/.test(source[j] ?? '')) j += 1
      }
      html += token('num', source.slice(i, j))
      i = j
      continue
    }

    if ('=+-*/%<>!&|^~:'.includes(ch)) {
      html += token('op', ch)
      i += 1
      continue
    }

    html += escapeHtml(ch)
    i += 1
  }

  return html
}

/** Highlight Python source (the notebook cell editor). */
export function highlightPython(source: string): string {
  return highlightCode(source, 'python')
}

/** Map a file path to the tokenizer's language family. */
export function languageOf(path: string): CodeLanguage {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase()
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : ''
  if (ext === '') return 'plain'
  if (['md', 'markdown', 'mdx', 'txt', 'text', 'rst', 'adoc', 'log'].includes(ext)) return 'plain'
  if (ext === 'py' || ext === 'pyw' || ext === 'pyi') return 'python'
  if (ext === 'ts' || ext === 'tsx' || ext === 'mts' || ext === 'cts') return 'typescript'
  if (ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs' || ext === 'vue' || ext === 'svelte') return 'javascript'
  if (['c', 'h', 'cc', 'cpp', 'cxx', 'hpp', 'hh', 'cs', 'java', 'go', 'rs', 'kt', 'kts', 'scala', 'swift', 'php', 'dart'].includes(ext)) return 'c'
  if (['sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd'].includes(ext)) return 'shell'
  if (ext === 'sql') return 'sql'
  if (ext === 'json' || ext === 'jsonc') return 'json'
  if (['yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'properties', 'env'].includes(ext)) return 'yaml'
  return 'generic'
}
