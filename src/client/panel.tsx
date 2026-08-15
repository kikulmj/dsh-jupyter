/**
 * Notebook editor component — the content injected into the built-in preview
 * column. It opens a .ipynb (path prop), edits code/markdown/raw cells, saves
 * back through the host routes, and runs cells through the shared kernel
 * bridge (streaming outputs). Visual language mirrors the built-in preview
 * panel (--aion-* tokens).
 * @module dsh-jupyter/client/panel
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { NbCell, NbOutput, NotebookView } from '../core/types.ts'
import type { JupyterApi } from './api.ts'
import { renderMarkdown, resolveMarkdownImage } from './markdown.ts'
import { t } from './locales.ts'

/** One cell's runtime state (transient, not persisted). */
interface CellRuntime {
  editing: boolean
  running: boolean
  error: string | null
}

/** The kernel connection state shown in the toolbar. */
type KernelState = 'idle' | 'busy' | 'error'

/** Build a resolveImageSrc for markdown cells (raw route serves workspace files). */
function imageResolver(root: string, notebookPath: string, src: string): string | null {
  if (root === '' || notebookPath === '') return null
  const resolution = resolveMarkdownImage(notebookPath, src)
  if (resolution.kind === 'absolute') return src
  if (resolution.kind === 'escape') return null
  return `/dsh-jupyter/raw?root=${encodeURIComponent(root)}&path=${encodeURIComponent(resolution.path)}${resolution.suffix}`
}

/**
 * The notebook editor (embedded in the preview column).
 * @param root - the active workspace root (from the current session cwd).
 * @param api - the /dsh-jupyter API client.
 * @param path - the notebook path to open (null = empty state).
 */
export function NotebookPanel({
  root,
  api,
  path,
}: {
  root: string
  api: JupyterApi
  path: string | null
}): JSX.Element {
  const [notebook, setNotebook] = useState<NotebookView | null>(null)
  const [runtime, setRuntime] = useState<Record<string, CellRuntime>>({})
  const [kernelState, setKernelState] = useState<KernelState>('idle')
  const [status, setStatus] = useState<string>('')
  const [statusError, setStatusError] = useState(false)
  const [saving, setSaving] = useState(false)
  const runSeq = useRef(0)

  // Open the requested notebook; a path change reloads it.
  useEffect(() => {
    if (root === '' || path === null || path === '') {
      setNotebook(null)
      setRuntime({})
      return
    }
    let cancelled = false
    setNotebook(null)
    void api.read(root, path).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setStatus(result.error.message)
        setStatusError(true)
        setNotebook(null)
        return
      }
      setNotebook(result.value)
      setRuntime({})
      setKernelState('idle')
      setStatus('')
      setStatusError(false)
    })
    return () => {
      cancelled = true
    }
  }, [root, path, api])

  const flashStatus = useCallback((message: string, isError = false): void => {
    setStatus(message)
    setStatusError(isError)
    const seq = ++runSeq.current
    setTimeout(() => {
      if (runSeq.current === seq) setStatus('')
    }, 4000)
  }, [])

  /** Patch one cell's transient runtime state. */
  const patchRuntime = useCallback((cellId: string, patch: Partial<CellRuntime>): void => {
    setRuntime((prev) => ({ ...prev, [cellId]: { ...(prev[cellId] ?? { editing: false, running: false, error: null }), ...patch } }))
  }, [])

  /** Save the notebook back (mtime conflict checked host-side). */
  const save = useCallback(async (): Promise<void> => {
    if (notebook === null || root === '') return
    setSaving(true)
    const result = await api.write(root, notebook.path, { cells: notebook.cells, metadata: notebook.metadata }, notebook.mtime)
    setSaving(false)
    if (!result.ok) {
      flashStatus(result.error.message, true)
      return
    }
    setNotebook((prev) => (prev === null ? prev : { ...prev, mtime: result.value.mtime }))
    flashStatus(t('saved'))
  }, [notebook, root, api, flashStatus])

  /** Update one cell's source in the notebook. */
  const editCell = useCallback((cellId: string, source: string): void => {
    setNotebook((prev) => (prev === null ? prev : {
      ...prev,
      cells: prev.cells.map((cell) => (cell.id === cellId ? { ...cell, source } : cell)),
    }))
  }, [])

  /** Run one code cell through the kernel bridge. */
  const runCell = useCallback(async (cell: NbCell): Promise<void> => {
    if (notebook === null || root === '') return
    patchRuntime(cell.id, { running: true, error: null })
    setKernelState('busy')
    // Clear prior outputs, stream new ones in.
    setNotebook((prev) => (prev === null ? prev : {
      ...prev,
      cells: prev.cells.map((c) => (c.id === cell.id ? { ...c, outputs: [], execution_count: null } : c)),
    }))
    try {
      const result = await api.execute(root, notebook.path, cell.id, cell.source, (output) => {
        setNotebook((prev) => (prev === null ? prev : {
          ...prev,
          cells: prev.cells.map((c) => (c.id === cell.id ? { ...c, outputs: [...c.outputs, output] } : c)),
        }))
      })
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
  }, [notebook, root, api, flashStatus, patchRuntime])

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
    if (notebook === null || root === '') return
    const result = await api.restart(root, notebook.path)
    flashStatus(result.ok ? t('kernelRestarted') : result.error.message, !result.ok)
  }, [notebook, root, api, flashStatus])

  /** Interrupt the running cell. */
  const interrupt = useCallback(async (): Promise<void> => {
    if (notebook === null || root === '') return
    await api.interrupt(root, notebook.path)
  }, [notebook, root, api])

  /** Add a cell after the given index. */
  const addCell = useCallback((afterIndex: number, cellType: NbCell['cell_type']): void => {
    setNotebook((prev) => (prev === null ? prev : {
      ...prev,
      cells: [
        ...prev.cells.slice(0, afterIndex + 1),
        {
          id: `cell-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
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
  }, [])

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

  // Keyboard: Cmd/Ctrl+S saves.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's' && notebook !== null) {
        event.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [notebook, save])

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
          root={root}
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
  }, [notebook, runtime, root, editCell, runCell, deleteCell, moveCell, toggleEditing, addCell])

  return (
    <div className="dshj-editor">
      <div className="dshj-toolbar">
        <span className="dshj-path-badge" title={path ?? ''}>
          {path ?? ''}
        </span>
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
        <span
          className={`dshj-kernel-dot ${kernelState === 'busy' ? 'busy' : kernelState === 'idle' ? 'ready' : ''}`}
          aria-hidden="true"
        />
      </div>

      {notebook === null ? (
        <div className="dshj-empty">
          <div className="dshj-md">
            <div className="dshj-md-body">{t('emptyHint')}</div>
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
  root,
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
  root: string
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
    return renderMarkdown(cell.source, { resolveImageSrc: (src) => imageResolver(root, cell.path ?? '', src) })
  }, [cell, isMarkdown, root])

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
          <AutoGrowTextarea
            className="dshj-source"
            value={cell.source}
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
              onChange={(source) => onEdit(source)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault()
                  onToggleEditing()
                }
              }}
            />
          ) : (
            <div className="dshj-md">
              <div className="dshj-md-body" dangerouslySetInnerHTML={{ __html: mdHtml }} />
            </div>
          )
        ) : (
          <AutoGrowTextarea
            className="dshj-source"
            value={cell.source}
            onChange={(source) => onEdit(source)}
          />
        )}

        {runtime.error !== null && <div className="dshj-output-error">{runtime.error}</div>}

        {isCode && cell.outputs.length > 0 && (
          <div className="dshj-outputs">
            {cell.outputs.map((output, outputIndex) => (
              <OutputView key={outputIndex} output={output} />
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
  onChange,
  onKeyDown,
}: {
  className: string
  value: string
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
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
    />
  )
}

/** Render one nbformat output. */
function OutputView({ output }: { output: NbOutput }): JSX.Element {
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
