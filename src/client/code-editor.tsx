/**
 * Code editor: a transparent textarea over a highlighted `<pre>`.
 * Editing, selection, IME and the caret stay native; the overlay only paints
 * tokens. Tab indents, Shift+Tab dedents, Enter keeps indentation.
 * @module dsh-jupyter/client/code-editor
 */

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import { highlightCode, type CodeLanguage } from './highlight.ts'

/** Props for {@link CodeEditor}. */
export function CodeEditor({
  value,
  autoFocus,
  language = 'python',
  onChange,
  onKeyDown,
}: {
  value: string
  autoFocus?: boolean
  language?: CodeLanguage
  onChange: (source: string) => void
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
}): JSX.Element {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const preRef = useRef<HTMLPreElement>(null)
  const pendingSelection = useRef<[number, number] | null>(null)
  const [composing, setComposing] = useState(false)
  const highlighted = useMemo(() => highlightCode(value, language), [value, language])
  const unit = language === 'python' || language === 'c' || language === 'shell' || language === 'sql' || language === 'generic'
    ? '    '
    : '  '

  useLayoutEffect(() => {
    const el = taRef.current
    if (el === null) return
    const resize = (): void => {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(el)
    return () => observer.disconnect()
  }, [value])

  useLayoutEffect(() => {
    const el = taRef.current
    if (el === null || pendingSelection.current === null) return
    const [start, end] = pendingSelection.current
    pendingSelection.current = null
    el.setSelectionRange(start, end)
  }, [value])

  const apply = (next: string, start: number, end = start): void => {
    pendingSelection.current = [start, end]
    onChange(next)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Enter' && event.shiftKey) {
      onKeyDown?.(event)
      return
    }
    const el = event.currentTarget
    if (event.key === 'Tab') {
      event.preventDefault()
      const start = el.selectionStart
      const end = el.selectionEnd
      const lineStart = el.value.lastIndexOf('\n', start - 1) + 1
      const lineEnd = el.value.indexOf('\n', end)
      const blockEnd = lineEnd === -1 ? el.value.length : lineEnd
      if (start !== end || event.shiftKey) {
        const lines = el.value.slice(lineStart, blockEnd).split('\n')
        const changed = event.shiftKey
          ? lines.map((line) => line.replace(/^( {1,4}|\t)/, ''))
          : lines.map((line) => `${unit}${line}`)
        const replacement = changed.join('\n')
        apply(el.value.slice(0, lineStart) + replacement + el.value.slice(blockEnd), lineStart, lineStart + replacement.length)
      } else {
        apply(`${el.value.slice(0, start)}${unit}${el.value.slice(end)}`, start + unit.length)
      }
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const start = el.selectionStart
      const end = el.selectionEnd
      const lineStart = el.value.lastIndexOf('\n', start - 1) + 1
      const line = el.value.slice(lineStart, start)
      const indent = /^[ \t]*/.exec(line)?.[0] ?? ''
      const trimmed = line.trimEnd()
      const opens = language === 'python'
        ? trimmed.endsWith(':')
        : language === 'yaml'
          ? trimmed.endsWith(':')
          : /[{[(]$/.test(trimmed)
      const insertion = `\n${indent}${opens ? unit : ''}`
      apply(el.value.slice(0, start) + insertion + el.value.slice(end), start + insertion.length)
      return
    }
    onKeyDown?.(event)
  }

  return (
    <div className="dshj-code-wrap">
      <pre
        ref={preRef}
        className="dshj-highlight"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: `${highlighted}\n` }}
      />
      <textarea
        ref={taRef}
        className={composing ? 'dshj-source dshj-source-overlay composing' : 'dshj-source dshj-source-overlay'}
        value={value}
        spellCheck={false}
        rows={1}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => setComposing(false)}
        onScroll={() => {
          const pre = preRef.current
          const ta = taRef.current
          if (pre !== null && ta !== null) {
            pre.scrollTop = ta.scrollTop
            pre.scrollLeft = ta.scrollLeft
          }
        }}
      />
    </div>
  )
}
