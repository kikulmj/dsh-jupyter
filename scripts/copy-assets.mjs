/**
 * Copy non-TS assets into lib/ after bundling:
 * - the Python kernel bridge script ships next to the built host half
 *   (index.ts resolves it via `new URL('./kernel_bridge.py', import.meta.url)`);
 * - the xterm.css stylesheet ships next to the built host half and is served
 *   by the /dsh-terminal/xterm.css route (terminal-routes.ts resolves it via
 *   `new URL('./xterm.css', import.meta.url)`). The source is the profile's
 *   installed @xterm/xterm copy (also linked into this plugin's node_modules
 *   for the client bundle).
 */
import { copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const require = createRequire(import.meta.url)

// 1. The Jupyter kernel bridge.
const bridgeDest = join(root, 'lib', 'kernel_bridge.py')
mkdirSync(dirname(bridgeDest), { recursive: true })
copyFileSync(join(root, 'src', 'host', 'kernel_bridge.py'), bridgeDest)
console.log('copied kernel_bridge.py -> lib/kernel_bridge.py')

// 2. xterm.css — resolve @xterm/xterm through the plugin's node_modules
//    (symlink into the profile's copy), then copy its stylesheet.
try {
  const xtermDir = dirname(require.resolve('@xterm/xterm/package.json'))
  const xtermCss = join(xtermDir, 'css', 'xterm.css')
  if (!existsSync(xtermCss)) throw new Error(`xterm.css not found at ${xtermCss}`)
  const cssDest = join(root, 'lib', 'xterm.css')
  copyFileSync(xtermCss, cssDest)
  console.log(`copied xterm.css -> lib/xterm.css`)
} catch (error) {
  console.warn(`[copy-assets] xterm.css copy skipped: ${error instanceof Error ? error.message : String(error)}`)
}
