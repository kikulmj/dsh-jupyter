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

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { fileOf, titleOf } from './address.ts'
import { dictionaries, NS } from './locales.ts'
import { NotebookPanel } from './panel.tsx'
import { injectPanelCss } from './styles.ts'
import { TextEditor } from './text-editor.tsx'

/** Tab-type identity: the package name (unique across every registration). */
export const TAB_ID = '@kikulmj/dsh-jupyter'

/** Tab kind discriminator. */
export const TAB_KIND = 'ipynb'

/** Text-editor tab identity/kind. */
export const TEXT_TAB_ID = '@kikulmj/dsh-jupyter/text'
export const TEXT_TAB_KIND = 'text-edit'

/**
 * Editable text/code files. Markdown, HTML, CSV, images and office documents
 * keep the official viewer: their previews are richer than a raw text editor.
 */
const TEXT_PATTERNS = [
  '*.py', '*.pyw', '*.pyi', '*.js', '*.jsx', '*.mjs', '*.cjs', '*.ts', '*.tsx', '*.mts', '*.cts',
  '*.vue', '*.svelte', '*.java', '*.c', '*.h', '*.cc', '*.cpp', '*.cxx', '*.hpp', '*.hh', '*.cs',
  '*.go', '*.rs', '*.rb', '*.php', '*.lua', '*.r', '*.swift', '*.kt', '*.kts', '*.scala', '*.dart',
  '*.sh', '*.bash', '*.zsh', '*.fish', '*.ps1', '*.bat', '*.cmd', '*.sql',
  '*.json', '*.jsonc', '*.yaml', '*.yml', '*.toml', '*.ini', '*.cfg', '*.conf', '*.properties', '*.env',
  '*.txt', '*.text', '*.log', '*.md', '*.markdown', '*.mdx', '*.rst', '*.adoc',
  '*.css', '*.scss', '*.less', '*.sass', '*.xml', '*.gradle', '*.tex',
  '*.proto', '*.graphql', '*.gql',
  'LICENSE', 'LICENCE', 'README', 'CHANGELOG', 'NOTICE', 'AUTHORS', 'CONTRIBUTING',
  'Makefile', 'Dockerfile', 'Rakefile', 'Gemfile',
  '.gitignore', '.gitattributes', '.editorconfig', '.npmrc', '.prettierrc', '.eslintrc',
]

/** The tab type this plugin contributes. */
const DEFINITION: SidebarRightTabDefinition = {
  id: TAB_ID,
  kind: TAB_KIND,
  patterns: ['*.ipynb'],
  priority: 'extension',
  keepMounted: true,
  canOpen: (address) => {
    const file = fileOf(address)
    return file !== null && file.path.toLowerCase().endsWith('.ipynb')
  },
  title: titleOf,
}

/** The editable-text tab type. */
const TEXT_DEFINITION: SidebarRightTabDefinition = {
  id: TEXT_TAB_ID,
  kind: TEXT_TAB_KIND,
  patterns: TEXT_PATTERNS,
  priority: 'extension',
  keepMounted: true,
  canOpen: (address) => fileOf(address) !== null,
  title: titleOf,
}

/** Required client services: slot registry, tab-type registry, copy. */
export const inject = ['slots', 'sidebarRightTabs', 'locale']

/**
 * Register the notebook tab type and its body.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  try {
    injectPanelCss()
    ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-jupyter: dictionaries')
    ctx.effect(() => ctx.sidebarRightTabs.register(DEFINITION), 'dsh-jupyter: ipynb tab type')
    ctx.effect(() => ctx.sidebarRightTabs.register(TEXT_DEFINITION), 'dsh-jupyter: text tab type')
    ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
      name: 'sidebar.right.pane.tab',
      key: TAB_ID,
      locale: NS,
      inject: (sessionId) => ({ sessionId }),
    }, NotebookPanel)), 'dsh-jupyter: notebook body')
    ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
      name: 'sidebar.right.pane.tab',
      key: TEXT_TAB_ID,
      locale: NS,
      inject: (sessionId) => ({ sessionId }),
    }, TextEditor)), 'dsh-jupyter: text body')
  } catch (error) {
    // A broken notebook tab degrades that tab, never the whole shell boot.
    console.warn('[dsh-jupyter] registration failed:', error)
  }
}
