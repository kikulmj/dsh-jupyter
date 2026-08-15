/**
 * Generate src/client/terminal/xterm.css.ts — the xterm.css text embedded as
 * a TS string constant. The `?raw` suffix is not resolvable by the
 * tsdown/rolldown pipeline, so (following the dsh-ssh approach) the stylesheet
 * is embedded at build time and injected once per page load by the panel.
 *
 * The source is the profile's installed @xterm/xterm copy (also linked into
 * this plugin's node_modules for the client bundle).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const require = createRequire(import.meta.url)

try {
  const xtermDir = dirname(require.resolve('@xterm/xterm/package.json'))
  const xtermCss = join(xtermDir, 'css', 'xterm.css')
  if (!existsSync(xtermCss)) throw new Error(`xterm.css not found at ${xtermCss}`)
  const css = readFileSync(xtermCss, 'utf8')
  const escaped = css
    .replaceAll('\\', '\\\\')
    .replaceAll('`', '\\`')
    .replaceAll('${', '\\${')
  const out = join(root, 'src', 'client', 'terminal', 'xterm.css.ts')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, [
    '/**',
    ' * xterm.css text embedded at build-authoring time (the ?raw suffix is not',
    ' * resolvable by the tsdown/rolldown pipeline). Generated file — run',
    ' * `node scripts/gen-xterm-css.mjs` (part of `pnpm build`) to regenerate.',
    ' */',
    `export const XTERM_CSS: string = \`${escaped}\``,
    '',
  ].join('\n'))
  console.log(`generated xterm.css.ts (${css.length} chars)`)
} catch (error) {
  console.warn(`[gen-xterm-css] skipped: ${error instanceof Error ? error.message : String(error)}`)
}
