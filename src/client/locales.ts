/**
 * Locale strings for the notebook editor surfaces (zh/en). The client
 * registers the dictionary through the locale service like the sibling
 * plugins; copy is deliberately short and technical.
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
  'kernelBusy': '内核忙',
  'kernelReady': '内核就绪',
  'cellError': '单元格执行出错',
  'preview': '预览',
  'edit': '编辑',
  'delete': '删除',
  'code': '代码',
  'markdown': 'Markdown',
  'clearOutputs': '清空输出',
  'emptyHint': '点击左侧文件树中的 .ipynb 文件在预览面板中打开笔记本。',
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
  'kernelBusy': 'kernel busy',
  'kernelReady': 'kernel ready',
  'cellError': 'cell execution failed',
  'preview': 'Preview',
  'edit': 'Edit',
  'delete': 'Delete',
  'code': 'Code',
  'markdown': 'Markdown',
  'clearOutputs': 'Clear Outputs',
  'emptyHint': 'Click a .ipynb file in the file tree to open it in the preview panel.',
  'unsupportedOutput': 'Unsupported output',
}

/** One editor copy key (derived from the zh source of truth). */
export type JupyterKey = keyof typeof zh

/** The locale namespace this plugin owns. */
export const NS = 'dsh-jupyter'

/** Both dictionaries, as the locale service expects. */
export const dictionaries: Record<'zh' | 'en', Record<JupyterKey, string>> = { zh, en }

/** Switch the active dictionary. */
export function setLanguage(language: string): void {
  current = language.startsWith('zh') ? zh : en
}

/** The active dictionary (defaults to zh until the shell language is known). */
let current: Record<JupyterKey, string> = zh

/** Translate one key. */
export function t(key: JupyterKey): string {
  return current[key]
}
