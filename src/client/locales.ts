/**
 * Locale strings for the notebook tab (zh/en). The client registers the
 * dictionary through the locale service; the slot seat then synthesizes the
 * typed `t` prop from this namespace.
 * @module dsh-jupyter/client/locales
 */

const zh = {
  'save': '保存',
  'saving': '保存中…',
  'saved': '已保存',
  'runAll': '全部运行',
  'run': '运行',
  'running': '运行中…',
  'interrupt': '中断',
  'restartKernel': '重启内核',
  'kernelRestarted': '内核已重启',
  'cellError': '单元格执行出错',
  'preview': '预览',
  'edit': '编辑',
  'delete': '删除',
  'code': '代码',
  'markdown': 'Markdown',
  'raw': 'Raw',
  'clearOutputs': '清空输出',
  'loading': '正在加载…',
  'modified': '未保存',
  'reload': '重新加载',
  'createEmpty': '以空笔记本打开',
  'createEmptyConfirm': '该文件不是有效的 notebook JSON。要用一个新的空笔记本覆盖它吗？原内容将丢失。',
  'unsupportedOutput': '不支持的输出类型',
} as const

const en: Record<keyof typeof zh, string> = {
  'save': 'Save',
  'saving': 'Saving…',
  'saved': 'Saved',
  'runAll': 'Run All',
  'run': 'Run',
  'running': 'Running…',
  'interrupt': 'Interrupt',
  'restartKernel': 'Restart Kernel',
  'kernelRestarted': 'Kernel restarted',
  'cellError': 'cell execution failed',
  'preview': 'Preview',
  'edit': 'Edit',
  'delete': 'Delete',
  'code': 'Code',
  'markdown': 'Markdown',
  'raw': 'Raw',
  'clearOutputs': 'Clear Outputs',
  'loading': 'Loading…',
  'modified': 'Unsaved',
  'reload': 'Reload',
  'createEmpty': 'Open as empty notebook',
  'createEmptyConfirm': 'This file is not valid notebook JSON. Replace it with a new empty notebook? Its current content will be lost.',
  'unsupportedOutput': 'Unsupported output',
}

/** One notebook copy key (derived from the zh source of truth). */
export type JupyterKey = keyof typeof zh

/** The locale namespace this plugin owns. */
export const NS = 'dsh-jupyter'

/** Both dictionaries, as the locale service expects. */
export const dictionaries: Record<'zh' | 'en', Record<JupyterKey, string>> = { zh, en }

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** dsh-jupyter tab copy. */
    'dsh-jupyter': JupyterKey
  }
}
