/**
 * Copy non-TS assets into lib/ after bundling: the Python kernel bridge ships
 * next to the built host half (index.ts resolves it via
 * `new URL('./kernel_bridge.py', import.meta.url)`).
 */
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const bridgeDest = join(root, 'lib', 'kernel_bridge.py')
mkdirSync(dirname(bridgeDest), { recursive: true })
copyFileSync(join(root, 'src', 'host', 'kernel_bridge.py'), bridgeDest)
console.log('copied kernel_bridge.py -> lib/kernel_bridge.py')
