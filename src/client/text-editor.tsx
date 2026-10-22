/**
 * Plain-text/code editor body for the native right-sidebar tab. It reuses the
 * same tab surface as the notebook and the official text preview, adding
 * editing and a version-guarded save through the host filesystem routes.
 * @module dsh-jupyter/client/text-editor
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { UseSidebarRightTabInfo } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { fileOf } from './address.ts'
import { JupyterApi } from './api.ts'
import { CodeEditor } from './code-editor.tsx'
import { languageOf } from './highlight.ts'

/** The text editor body props (tab seat). */
export interface TextEditorProps {
  sessionId: string
  useTabInfo: UseSidebarRightTabInfo
  t: TranslateNS<'dsh-jupyter'>
}

/** One editable text file in the right sidebar. */
export function TextEditor({ sessionId, useTabInfo, t }: TextEditorProps): JSX.Element {
  const { tab } = useTabInfo()
  const path = useMemo(() => fileOf(tab.contentId)?.path ?? '', [tab.contentId])
  const api = useMemo(() => new JupyterApi(), [])
  const [text, setText] = useState('')
  const [savedText, setSavedText] = useState('')
  const [version, setVersion] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [statusError, setStatusError] = useState(false)
  const loadSeq = useRef(0)
  const flashSeq = useRef(0)

  const flash = useCallback((message: string, isError = false): void => {
    setStatus(message)
    setStatusError(isError)
    const seq = ++flashSeq.current
    setTimeout(() => {
      if (flashSeq.current === seq) setStatus('')
    }, 3000)
  }, [])

  const reload = useCallback(async (): Promise<void> => {
    const seq = ++loadSeq.current
    if (path === '') return
    setLoading(true)
    const result = await api.readText(sessionId, path, tab.signal)
    if (seq !== loadSeq.current || tab.signal.aborted) return
    setLoading(false)
    if (!result.ok) {
      setStatus(result.error.message)
      setStatusError(true)
      setText('')
      setSavedText('')
      return
    }
    setText(result.value.text)
    setSavedText(result.value.text)
    setVersion(result.value.version)
    setStatus('')
    setStatusError(false)
  }, [api, path, sessionId, tab.signal])

  useEffect(() => {
    void reload()
  }, [reload])

  // The sidebar's refresh command reloads from disk without remounting.
  useEffect(() => tab.actions.bindCommands({ refresh: () => void reload() }), [tab.actions, reload])

  const dirty = text !== savedText

  const save = useCallback(async (): Promise<void> => {
    if (path === '' || !dirty) return
    setSaving(true)
    const result = await api.writeText(sessionId, path, text, version)
    setSaving(false)
    if (!result.ok) {
      flash(result.error.message, true)
      return
    }
    setVersion(result.value.version)
    setSavedText(text)
    flash(t('saved'))
  }, [api, path, sessionId, text, version, dirty, flash, t])

  // Cmd/Ctrl+S saves the foreground tab.
  useEffect(() => {
    if (!tab.visible) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's' && !loading) {
        event.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [loading, save, tab.visible])

  return (
    <div className="dshj-editor dshj-text-editor">
      <div className="dshj-toolbar">
        <span className="dshj-path-badge" title={path}>{path}</span>
        <div className="dshj-toolbar-spacer" />
        {dirty && <span className="dshj-dirty">{t('modified')}</span>}
        <button
          type="button"
          className="dshj-toolbar-btn primary"
          disabled={loading || saving || !dirty}
          onClick={() => void save()}
        >
          {saving ? t('saving') : t('save')}
        </button>
      </div>

      {loading ? (
        <div className="dshj-empty">
          <div className="dshj-md-body">{t('loading')}</div>
        </div>
      ) : statusError && text === '' ? (
        <div className="dshj-empty">
          <div className="dshj-empty-error">
            <div className="dshj-md-body">{status}</div>
            <div className="dshj-empty-actions">
              <button type="button" className="dshj-toolbar-btn" onClick={() => void reload()}>
                {t('reload')}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="dshj-text-body">
          <CodeEditor
            value={text}
            language={languageOf(path)}
            onChange={setText}
          />
        </div>
      )}

      {status !== '' && !statusError && <div className="dshj-status">{status}</div>}
      {statusError && text !== '' && <div className="dshj-status error">{status}</div>}
    </div>
  )
}
