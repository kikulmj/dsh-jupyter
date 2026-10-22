/**
 * Notebook editor component — the body of the native `.ipynb` right-sidebar
 * tab. It edits code/markdown/raw cells, saves back through the host routes,
 * and runs cells through the shared kernel bridge (streaming outputs). Visual
 * language follows the product's theme tokens (`--dsw-*`).
 * @module dsh-jupyter/client/panel
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { UseSidebarRightTabInfo } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { InterpreterOption, NbCell, NbOutput, NotebookView } from '../core/types.ts'
import { fileOf } from './address.ts'
import { JupyterApi } from './api.ts'
import { CodeEditor } from './code-editor.tsx'
import { renderMarkdown, resolveMarkdownImage } from './markdown.ts'

/** One cell's runtime state (transient, not persisted). */
interface CellRuntime {
  editing: boolean
  running: boolean
  error: string | null
}

/** The kernel connection state shown in the toolbar. */
type KernelState = 'idle' | 'busy' | 'error'

/** The notebook editor (the body of one `.ipynb` tab). */
export interface NotebookPanelProps {
  /** The Session that authorizes file access (injected by the tab seat). */
  sessionId: string
  /** The tab's live information hook (body seat). */
  useTabInfo: UseSidebarRightTabInfo
  /** Copy for this plugin's locale namespace. */
  t: TranslateNS<'dsh-jupyter'>
}

/** The interpreter path saved in the notebook's metadata (empty = bundled). */
function savedPythonOf(metadata: Record<string, unknown>): string {
  const section = metadata.dsh_jupyter
  if (typeof section !== 'object' || section === null) return ''
  const value = (section as Record<string, unknown>).python
  return typeof value === 'string' ? value : ''
}

/** Build a resolveImageSrc for markdown cells (raw route serves workspace files). */
function imageResolver(api: JupyterApi, sessionId: string, notebookPath: string, src: string): string | null {
  if (notebookPath === '') return null
  const resolution = resolveMarkdownImage(notebookPath, src)
  if (resolution.kind === 'absolute') return src
  if (resolution.kind === 'escape') return null
  return api.rawUrl(sessionId, resolution.path, resolution.suffix)
}

/**
 * The notebook editor (the body of one `.ipynb` tab).
 * @param sessionId - the Session that authorizes file access.
 * @param useTabInfo - the tab's live information hook.
 * @param t - copy for this plugin's locale namespace.
 */
export function NotebookPanel({ sessionId, useTabInfo, t }: NotebookPanelProps): JSX.Element {
  const { tab } = useTabInfo()
  const path = useMemo(() => fileOf(tab.contentId)?.path ?? '', [tab.contentId])
  const api = useMemo(() => new JupyterApi(), [])
  const [notebook, setNotebook] = useState<NotebookView | null>(null)
  const [runtime, setRuntime] = useState<Record<string, CellRuntime>>({})
  const [kernelState, setKernelState] = useState<KernelState>('idle')
  const [interpreters, setInterpreters] = useState<InterpreterOption[]>([])
  const [python, setPython] = useState('')
  const [status, setStatus] = useState<string>('')
  const [statusError, setStatusError] = useState(false)
  const [statusCode, setStatusCode] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const runSeq = useRef(0)
  const loadSeq = useRef(0)
  /** The id of the most recently added cell — drives auto-focus into the fresh
   *  textarea so typing can start immediately (Jupyter-style). */
  const lastAddedIdRef = useRef<string | null>(null)

  /** Reload the notebook from disk (also the sidebar refresh command). */
  const reload = useCallback(async (): Promise<void> => {
    const seq = ++loadSeq.current
    if (path === '') {
      setNotebook(null)
      setRuntime({})
      lastAddedIdRef.current = null
      return
    }
    const result = await api.read(sessionId, path, tab.signal)
    if (seq !== loadSeq.current || tab.signal.aborted) return
    if (!result.ok) {
      setStatus(result.error.message)
      setStatusError(true)
      setStatusCode(result.error.code)
      setNotebook(null)
      return
    }
    setNotebook(result.value)
    setPython(savedPythonOf(result.value.metadata))
    setRuntime({})
    setKernelState('idle')
    setStatus('')
    setStatusError(false)
    setStatusCode(undefined)
    lastAddedIdRef.current = null
  }, [api, path, sessionId, tab.signal])

  // Open the requested notebook; a path change reloads it.
  useEffect(() => {
    setNotebook(null)
    void reload()
  }, [reload])

  // The sidebar's refresh command reloads from disk without remounting.
  useEffect(() => tab.actions.bindCommands({ refresh: () => void reload() }), [tab.actions, reload])

  // Closing the tab ends its kernel; switching tabs or closing the sidebar
  // does not abort this signal (the body stays mounted).
  useEffect(() => {
    if (path === '') return
    const release = (): void => { void api.dispose(sessionId, path) }
    tab.signal.addEventListener('abort', release, { once: true })
    return () => tab.signal.removeEventListener('abort', release)
  }, [api, sessionId, path, tab.signal])

  const flashStatus = useCallback((message: string, isError = false): void => {
    setStatus(message)
    setStatusError(isError)
    setStatusCode(undefined)
    const seq = ++runSeq.current
    setTimeout(() => {
      if (runSeq.current === seq) setStatus('')
    }, 4000)
  }, [])

  // Load the interpreter list once per tab.
  useEffect(() => {
    let cancelled = false
    void api.interpreters(tab.signal).then((result) => {
      if (cancelled || tab.signal.aborted || !result.ok) return
      setInterpreters(result.value)
    })
    return () => { cancelled = true }
  }, [api, tab.signal])

  // A saved environment that no longer exists falls back to the bundled one.
  useEffect(() => {
    if (interpreters.length === 0 || python === '') return
    if (!interpreters.some((option) => option.python === python)) {
      setPython('')
      flashStatus(t('interpreterUnavailable'), true)
    }
  }, [interpreters, python, flashStatus, t])

  /** Patch one cell's transient runtime state. */
  const patchRuntime = useCallback((cellId: string, patch: Partial<CellRuntime>): void => {
    setRuntime((prev) => ({ ...prev, [cellId]: { ...(prev[cellId] ?? { editing: false, running: false, error: null }), ...patch } }))
  }, [])

  /** Save the notebook back (filesystem version checked host-side). */
  const save = useCallback(async (): Promise<void> => {
    if (notebook === null || path === '') return
    setSaving(true)
    const result = await api.write(sessionId, path, { cells: notebook.cells, metadata: notebook.metadata }, notebook.version)
    setSaving(false)
    if (!result.ok) {
      flashStatus(result.error.message, true)
      return
    }
    setNotebook((prev) => (prev === null ? prev : { ...prev, version: result.value.version }))
    flashStatus(t('saved'))
  }, [notebook, path, sessionId, api, flashStatus, t])

  /** Replace a non-notebook file with a fresh notebook after confirmation. */
  const openAsEmpty = useCallback(async (): Promise<void> => {
    if (path === '' || !window.confirm(t('createEmptyConfirm'))) return
    const result = await api.create(sessionId, path, true)
    if (!result.ok) {
      flashStatus(result.error.message, true)
      return
    }
    setNotebook(result.value)
    setRuntime({})
    setStatus('')
    setStatusError(false)
    setStatusCode(undefined)
    lastAddedIdRef.current = null
  }, [api, path, sessionId, flashStatus, t])

  /** Switch the notebook kernel to another interpreter and restart it. */
  const selectInterpreter = useCallback((value: string): void => {
    if (value === python) return
    setPython(value)
    setKernelState('idle')
    if (path !== '') void api.dispose(sessionId, path)
    setNotebook((prev) => {
      if (prev === null) return prev
      const current = typeof prev.metadata.dsh_jupyter === 'object' && prev.metadata.dsh_jupyter !== null
        ? prev.metadata.dsh_jupyter as Record<string, unknown>
        : {}
      const section = { ...current }
      if (value === '') delete section.python
      else section.python = value
      return { ...prev, metadata: { ...prev.metadata, dsh_jupyter: section } }
    })
    flashStatus(t('interpreterChanged'))
  }, [python, path, sessionId, api, flashStatus, t])

  /** Update one cell's source in the notebook. */
  const editCell = useCallback((cellId: string, source: string): void => {
    setNotebook((prev) => (prev === null ? prev : {
      ...prev,
      cells: prev.cells.map((cell) => (cell.id === cellId ? { ...cell, source } : cell)),
    }))
  }, [])

  /** Run one code cell through the kernel bridge. */
  const runCell = useCallback(async (cell: NbCell): Promise<void> => {
    if (notebook === null || path === '') return
    patchRuntime(cell.id, { running: true, error: null })
    setKernelState('busy')
    // Clear prior outputs, stream new ones in.
    setNotebook((prev) => (prev === null ? prev : {
      ...prev,
      cells: prev.cells.map((c) => (c.id === cell.id ? { ...c, outputs: [], execution_count: null } : c)),
    }))
    try {
      const result = await api.execute(sessionId, path, cell.id, cell.source, (output) => {
        setNotebook((prev) => (prev === null ? prev : {
          ...prev,
          cells: prev.cells.map((c) => (c.id === cell.id ? { ...c, outputs: [...c.outputs, output] } : c)),
        }))
      }, python)
      setNotebook((prev) => (prev === null ? prev : {
        ...prev,
        cells: prev.cells.map((c) => (c.id === cell.id ? { ...c, execution_count: result.executionCount } : c)),
      }))
      patchRuntime(cell.id, { running: false })
      if (result.status === 'error') flashStatus(t('cellError'), true)
    } catch (error) {
      patchRuntime(cell.id, { running: false, error: error instanceof Error ? error.message : String(error) })
      flashStatus(error instanceof Error ? error.message : String(error), true)
    } finally {
      setKernelState('idle')
    }
  }, [notebook, path, sessionId, api, python, flashStatus, patchRuntime, t])

  /** Run every code cell in order. */
  const runAll = useCallback(async (): Promise<void> => {
    if (notebook === null) return
    for (const cell of notebook.cells) {
      if (cell.cell_type !== 'code') continue
      if (cell.source.trim() === '') continue
      await runCell(cell)
    }
  }, [notebook, runCell])

  /** Restart the kernel (fresh state). */
  const restartKernel = useCallback(async (): Promise<void> => {
    if (notebook === null || path === '') return
    const result = await api.restart(sessionId, path)
    flashStatus(result.ok ? t('kernelRestarted') : result.error.message, !result.ok)
  }, [notebook, path, sessionId, api, flashStatus, t])

  /** Interrupt the running cell. */
  const interrupt = useCallback(async (): Promise<void> => {
    if (notebook === null || path === '') return
    await api.interrupt(sessionId, path)
  }, [notebook, path, sessionId, api])

  /** Add a cell after the given index. */
  const addCell = useCallback((afterIndex: number, cellType: NbCell['cell_type']): void => {
    const cellId = `cell-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    lastAddedIdRef.current = cellId
    setNotebook((prev) => (prev === null ? prev : {
      ...prev,
      cells: [
        ...prev.cells.slice(0, afterIndex + 1),
        {
          id: cellId,
          cell_type: cellType,
          source: '',
          execution_count: null,
          outputs: [],
          metadata: {},
          path: prev.path,
        },
        ...prev.cells.slice(afterIndex + 1),
      ],
    }))
    // A freshly added cell must STAY in edit mode. Markdown cards otherwise
    // fall back to preview as soon as the source is non-empty, which flips
    // the card right after the very first keystroke (runtime.editing is never
    // pinned, so the empty-source fallback vanishes on the first character).
    // Pin editing:true so typing is continuous until the user toggles.
    patchRuntime(cellId, { editing: true })
  }, [patchRuntime])

  /** Delete one cell. */
  const deleteCell = useCallback((cellId: string): void => {
    setNotebook((prev) => (prev === null ? prev : { ...prev, cells: prev.cells.filter((cell) => cell.id !== cellId) }))
  }, [])

  /** Move a cell up/down. */
  const moveCell = useCallback((index: number, delta: -1 | 1): void => {
    setNotebook((prev) => {
      if (prev === null) return prev
      const target = index + delta
      if (target < 0 || target >= prev.cells.length) return prev
      const cells = [...prev.cells]
      const [cell] = cells.splice(index, 1)
      if (cell === undefined) return prev
      cells.splice(target, 0, cell)
      return { ...prev, cells }
    })
  }, [])

  /** Clear all outputs (and execution counts). */
  const clearOutputs = useCallback((): void => {
    setNotebook((prev) => (prev === null ? prev : {
      ...prev,
      cells: prev.cells.map((cell) => (cell.cell_type === 'code' ? { ...cell, outputs: [], execution_count: null } : cell)),
    }))
  }, [])

  /** Toggle markdown cell edit/preview. */
  const toggleEditing = useCallback((cellId: string): void => {
    setRuntime((prev) => {
      const current = prev[cellId] ?? { editing: false, running: false, error: null }
      return { ...prev, [cellId]: { ...current, editing: !current.editing } }
    })
  }, [])

  // Keyboard: Cmd/Ctrl+S saves, only for the foreground tab (bodies stay
  // mounted in the background).
  useEffect(() => {
    if (!tab.visible) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's' && notebook !== null) {
        event.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [notebook, save, tab.visible])

  const renderedCells = useMemo(() => {
    return (notebook?.cells ?? []).map((cell, index) => {
      const rt = runtime[cell.id] ?? { editing: false, running: false, error: null }
      return (
        <CellCard
          key={cell.id}
          cell={cell}
          index={index}
          total={notebook?.cells.length ?? 0}
          runtime={rt}
          sessionId={sessionId}
          api={api}
          autoFocus={cell.id === lastAddedIdRef.current}
          t={t}
          onEdit={(source) => editCell(cell.id, source)}
          onRun={() => void runCell(cell)}
          onDelete={() => deleteCell(cell.id)}
          onMove={(delta) => moveCell(index, delta)}
          onToggleEditing={() => toggleEditing(cell.id)}
          onAddCode={() => addCell(index, 'code')}
          onAddMarkdown={() => addCell(index, 'markdown')}
        />
      )
    })
  }, [notebook, runtime, sessionId, api, editCell, runCell, deleteCell, moveCell, toggleEditing, addCell])

  return (
    <div className="dshj-editor">
      <div className="dshj-toolbar">
        <span className="dshj-path-badge" title={path ?? ''}>
          {path ?? ''}
        </span>
        <select
          className="dshj-interpreter"
          title={t('interpreter')}
          value={python}
          disabled={notebook === null || kernelState === 'busy'}
          onChange={(event) => selectInterpreter(event.target.value)}
        >
          <option value="">{t('bundledPython')}</option>
          {interpreters.filter((option) => option.id !== 'bundled').map((option) => (
            <option key={option.id} value={option.python}>{option.label}</option>
          ))}
        </select>
        <div className="dshj-toolbar-spacer" />
        <button type="button" className="dshj-toolbar-btn primary" disabled={notebook === null || saving} onClick={() => void save()}>
          {saving ? t('saving') : t('save')}
        </button>
        <button type="button" className="dshj-toolbar-btn" disabled={notebook === null} onClick={() => void runAll()}>
          {t('runAll')}
        </button>
        <button type="button" className="dshj-toolbar-btn" disabled={notebook === null} onClick={() => void interrupt()}>
          {t('interrupt')}
        </button>
        <button type="button" className="dshj-toolbar-btn" disabled={notebook === null} onClick={() => void restartKernel()}>
          {t('restartKernel')}
        </button>
        <button type="button" className="dshj-toolbar-btn" disabled={notebook === null} onClick={clearOutputs}>
          {t('clearOutputs')}
        </button>
        <button
          type="button"
          className="dshj-toolbar-btn"
          disabled={notebook === null}
          onClick={() => addCell((notebook?.cells.length ?? 0) - 1, 'code')}
        >
          + {t('code')}
        </button>
        <button
          type="button"
          className="dshj-toolbar-btn"
          disabled={notebook === null}
          onClick={() => addCell((notebook?.cells.length ?? 0) - 1, 'markdown')}
        >
          + {t('markdown')}
        </button>
        <span
          className={`dshj-kernel-dot ${kernelState === 'busy' ? 'busy' : kernelState === 'idle' ? 'ready' : ''}`}
          aria-hidden="true"
        />
      </div>

      {notebook === null ? (
        <div className="dshj-empty">
          {statusError ? (
            <div className="dshj-empty-error">
              <div className="dshj-md-body">{status}</div>
              <div className="dshj-empty-actions">
                <button type="button" className="dshj-toolbar-btn" onClick={() => void reload()}>
                  {t('reload')}
                </button>
                {statusCode === 'not-notebook' && (
                  <button type="button" className="dshj-toolbar-btn primary" onClick={() => void openAsEmpty()}>
                    {t('createEmpty')}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="dshj-md-body">{t('loading')}</div>
          )}
        </div>
      ) : notebook.cells.length === 0 ? (
        <div className="dshj-empty">
          <div className="dshj-md-body">{t('noCells')}</div>
          <div className="dshj-empty-actions">
            <button type="button" className="dshj-toolbar-btn primary" onClick={() => addCell(-1, 'code')}>
              + {t('code')}
            </button>
            <button type="button" className="dshj-toolbar-btn" onClick={() => addCell(-1, 'markdown')}>
              + {t('markdown')}
            </button>
          </div>
        </div>
      ) : (
        <div className="dshj-cells">{renderedCells}</div>
      )}

      {(status !== '' || statusError) && (
        <div className={`dshj-status${statusError ? ' error' : ''}`}>{status}</div>
      )}
    </div>
  )
}

/** One cell card: header (type/count/actions) + body (editor or preview) + outputs. */
function CellCard({
  cell,
  index,
  total,
  runtime,
  sessionId,
  api,
  autoFocus,
  t,
  onEdit,
  onRun,
  onDelete,
  onMove,
  onToggleEditing,
  onAddCode,
  onAddMarkdown,
}: {
  cell: NbCell
  index: number
  total: number
  runtime: CellRuntime
  sessionId: string
  api: JupyterApi
  /** The cell was just added — its textarea should grab focus (edit mode). */
  autoFocus: boolean
  t: TranslateNS<'dsh-jupyter'>
  onEdit: (source: string) => void
  onRun: () => void
  onDelete: () => void
  onMove: (delta: -1 | 1) => void
  onToggleEditing: () => void
  onAddCode: () => void
  onAddMarkdown: () => void
}): JSX.Element {
  const isCode = cell.cell_type === 'code'
  const isMarkdown = cell.cell_type === 'markdown'
  const editing = runtime.editing || (isMarkdown && cell.source === '')
  const mdHtml = useMemo(() => {
    if (!isMarkdown) return ''
    return renderMarkdown(cell.source, { resolveImageSrc: (src) => imageResolver(api, sessionId, cell.path ?? '', src) })
  }, [cell, isMarkdown, api, sessionId])

  return (
    <div className={`dshj-cell${runtime.running ? ' running' : ''}`}>
      <div className="dshj-cell-head">
        <span className="dshj-cell-type">{cell.cell_type}</span>
        {isCode && cell.execution_count !== null && <span className="dshj-cell-count">[{cell.execution_count}]</span>}
        {runtime.running && <span className="dshj-spinner" aria-label="running" />}
        <div className="dshj-cell-actions">
          {isCode && (
            <button type="button" className="dshj-mini-btn run" disabled={runtime.running} onClick={onRun}>
              {runtime.running ? t('running') : `▶ ${t('run')}`}
            </button>
          )}
          {isMarkdown && (
            <button type="button" className="dshj-mini-btn" onClick={onToggleEditing}>
              {editing ? t('preview') : t('edit')}
            </button>
          )}
          <button type="button" className="dshj-mini-btn" onClick={onAddCode}>+ {t('code')}</button>
          <button type="button" className="dshj-mini-btn" onClick={onAddMarkdown}>+ {t('markdown')}</button>
          <button type="button" className="dshj-mini-btn" disabled={index === 0} onClick={() => onMove(-1)}>↑</button>
          <button type="button" className="dshj-mini-btn" disabled={index === total - 1} onClick={() => onMove(1)}>↓</button>
          <button type="button" className="dshj-mini-btn warn" onClick={onDelete}>{t('delete')}</button>
        </div>
      </div>

      <div className="dshj-cell-body">
        {isCode ? (
          <CodeEditor
            value={cell.source}
            autoFocus={autoFocus}
            onChange={(source) => onEdit(source)}
            onKeyDown={(event) => {
              // Shift+Enter runs the cell (Jupyter muscle memory).
              if (event.shiftKey && event.key === 'Enter') {
                event.preventDefault()
                onRun()
              }
            }}
          />
        ) : isMarkdown ? (
          editing ? (
            <AutoGrowTextarea
              className="dshj-source"
              value={cell.source}
              autoFocus={autoFocus}
              onChange={(source) => onEdit(source)}
              onKeyDown={(event) => {
                // Shift+Enter renders the markdown cell back to preview
                // (Jupyter muscle memory; replaces the old Ctrl/Cmd+Enter).
                if (event.shiftKey && event.key === 'Enter') {
                  event.preventDefault()
                  onToggleEditing()
                }
              }}
            />
          ) : (
            // Double-click the rendered markdown to jump back into edit mode.
            <div className="dshj-md" onDoubleClick={onToggleEditing}>
              <div className="dshj-md-body" dangerouslySetInnerHTML={{ __html: mdHtml }} />
            </div>
          )
        ) : (
          <AutoGrowTextarea
            className="dshj-source"
            value={cell.source}
            autoFocus={autoFocus}
            onChange={(source) => onEdit(source)}
          />
        )}

        {runtime.error !== null && <div className="dshj-output-error">{runtime.error}</div>}

        {isCode && cell.outputs.length > 0 && (
          <div className="dshj-outputs">
            {cell.outputs.map((output, outputIndex) => (
              <OutputView key={outputIndex} output={output} t={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}


/**
 * A textarea whose height follows its content (auto-grow). A fixed pixel
 * height would clip or waste space; this keeps the visible box exactly as
 * tall as the text needs, with a small minimum for empty cells.
 *
 * Height measurement is layout-aware: useLayoutEffect runs synchronously
 * after the DOM update but BEFORE paint, so the width is already resolved
 * (a too-narrow first measure would wrap long lines and inflate
 * scrollHeight). A ResizeObserver re-measures whenever the element's width
 * changes (panel resize, split drag), so re-wrapped lines never leave stale
 * extra height.
 */
function AutoGrowTextarea({
  className,
  value,
  autoFocus,
  onChange,
  onKeyDown,
}: {
  className: string
  value: string
  autoFocus?: boolean
  onChange: (source: string) => void
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
}): JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null)

  // Measure at layout time (before paint) so the width is final; re-measure
  // when the value or the element's width changes.
  useLayoutEffect(() => {
    const el = ref.current
    if (el === null) return
    const resize = (): void => {
      // Height = visible line count × line-height + vertical padding, computed
      // from scrollHeight but clamped to a sane per-line metric so a single
      // long unwrapped line never inflates the box. scrollHeight already
      // accounts for soft wrapping; overflow visible lets it report the full
      // content height instead of the clipped one.
      const prevOverflow = el.style.overflow
      el.style.overflow = 'visible'
      el.style.height = 'auto'
      const contentHeight = el.scrollHeight
      el.style.height = `${contentHeight}px`
      el.style.overflow = prevOverflow
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(el)
    return () => observer.disconnect()
  }, [value])

  return (
    <textarea
      ref={ref}
      className={className}
      value={value}
      spellCheck={false}
      rows={1}
      autoFocus={autoFocus}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
    />
  )
}

/** Render one nbformat output. */
function OutputView({ output, t }: { output: NbOutput; t: TranslateNS<'dsh-jupyter'> }): JSX.Element {
  if (output.output_type === 'stream') {
    return (
      <div className={`dshj-output dshj-output-stream${output.name === 'stderr' ? ' stderr' : ''}`}>
        {output.text}
      </div>
    )
  }
  if (output.output_type === 'error') {
    const trace = output.traceback.length > 0
      ? output.traceback.join('\n').replaceAll('\x1b[', '')
      : `${output.ename}: ${output.evalue}`
    return <div className="dshj-output dshj-output-error">{trace}</div>
  }
  if (output.output_type === 'execute_result' || output.output_type === 'display_data') {
    const data = output.data
    const png = data['image/png']
    if (typeof png === 'string') {
      // nbformat stores images as bare base64 (no data: prefix); the browser
      // needs the full data URL to render them.
      const src = png.startsWith('data:') ? png : `data:image/png;base64,${png}`
      return <img className="dshj-output-image" src={src} alt="output" />
    }
    const jpeg = data['image/jpeg']
    if (typeof jpeg === 'string') {
      const src = jpeg.startsWith('data:') ? jpeg : `data:image/jpeg;base64,${jpeg}`
      return <img className="dshj-output-image" src={src} alt="output" />
    }
    if (typeof data['image/gif'] === 'string') {
      const gif = data['image/gif'] as string
      const src = gif.startsWith('data:') ? gif : `data:image/gif;base64,${gif}`
      return <img className="dshj-output-image" src={src} alt="output" />
    }
    if (typeof data['image/svg+xml'] === 'string') {
      const svg = data['image/svg+xml'] as string
      const src = svg.startsWith('data:') ? svg : `data:image/svg+xml;base64,${svg}`
      return <img className="dshj-output-image" src={src} alt="output" />
    }
    if (typeof data['text/html'] === 'string') {
      return (
        <div className="dshj-output dshj-output-html">
          <iframe
            sandbox=""
            title="html output"
            srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:-apple-system,"system-ui","Segoe UI",Roboto,sans-serif}</style></head><body>${data['text/html']}</body></html>`}
          />
        </div>
      )
    }
    if (typeof data['text/markdown'] === 'string') {
      return (
        <div className="dshj-output dshj-md">
          <div className="dshj-md-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(data['text/markdown']) }} />
        </div>
      )
    }
    if (typeof data['application/json'] !== 'undefined') {
      return <div className="dshj-output dshj-output-json">{JSON.stringify(data['application/json'], null, 2)}</div>
    }
    const text = data['text/plain']
    if (typeof text === 'string') {
      return <div className="dshj-output dshj-output-plain">{text}</div>
    }
    return <div className="dshj-output dshj-output-unsupported">{t('unsupportedOutput')}</div>
  }
  return <div className="dshj-output dshj-output-unsupported">{t('unsupportedOutput')}</div>
}
