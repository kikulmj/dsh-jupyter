/**
 * @kikulmj/dsh-jupyter — host half: the Session-scoped notebook file
 * service and the /dsh-jupyter/* HTTP routes (read/write/raw + NDJSON
 * streaming cell execution through the Python bridge) on the shared
 * webserver. The browser half (exports "./client") registers the notebook as a
 * native right-sidebar tab type for `.ipynb` files.
 *
 * The host half also announces the plugin to every agent through the
 * system-prompt section mechanism.
 * @module @kikulmj/dsh-jupyter
 */

import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-subprocess'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { NotebookService } from './host/notebook-service.ts'
import { KernelSessionManager } from './host/kernel.ts'
import { registerJupyterRoutes } from './host/routes.ts'

/** Required services: routes, managed subprocesses, filesystem, sessions, sandbox policy, and the prompt band. */
export const inject = ['webServer', 'subprocess', 'fs', 'sessions', 'sandboxPolicy', 'systemPrompt']

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 215

/** Model-facing announcement: plugin presence, capabilities, and limits. */
export const JUPYTER_GUIDANCE = '本机已安装 dsh-jupyter 插件（Jupyter notebook 预览/编辑/运行）：'
  + '在 Web GUI 右侧文件树中点击工作区内的 .ipynb 文件，会在右侧边栏（与文本预览同一个标签系统）打开笔记本标签页；'
  + '可编辑 code/markdown/raw 单元格、增删排序单元格、保存回磁盘（带磁盘版本冲突检查）。'
  + '代码单元格由宿主进程的 Python 内核执行（使用 dsh 自带 Python，内核状态在单元格间共享），'
  + '流式渲染 stdout/stderr、HTML、Markdown、PNG/JPEG/SVG 图片、JSON 和错误回溯，支持中断与重启内核；'
  + '支持 !命令、%pip、%cd、%pwd 等常用行内魔法（不支持 input() 和 %% 单元格魔法）；工具栏「内核环境」可选择 dsh 自带 Python 或 ~/.conda/environments.txt 中的 conda 环境，切换会重启内核，而 !conda activate 不会改变内核。'
  + '插件也接管常见代码/配置文件（.py/.js/.ts/.json/.yaml/.txt 等）的右侧标签页编辑与保存；markdown/HTML/图片/Office 仍由官方预览处理。'
  + '宿主端经 /dsh-jupyter/* 路由提供，所有读写都按 Session 工作区做边界检查并走统一的文件系统/沙箱策略。'
  + '用户提到「jupyter / notebook / .ipynb / 笔记本单元格 / 运行单元格」时即指本插件，请据此协作；执行会真实消耗本机资源，先确认再操作。'

/**
 * Mount the notebook services and routes.
 * @param ctx - context carrying webServer, subprocess, fs, sessions, systemPrompt.
 */
export function apply(ctx: Context): void {
  const notebooks = new NotebookService(ctx)
  // The bridge script ships next to the built host half (lib/kernel_bridge.py).
  const bridgeScript = fileURLToPath(new URL('./kernel_bridge.py', import.meta.url))
  const kernels = new KernelSessionManager(ctx, bridgeScript)
  ctx.effect(() => registerJupyterRoutes(ctx, notebooks, kernels), 'dsh-jupyter: /dsh-jupyter routes')
  ctx.effect(() => () => kernels.disposeAll(), 'dsh-jupyter: kernel sessions')
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'plugin:dsh-jupyter',
    order: SECTION_ORDER,
    text: JUPYTER_GUIDANCE,
  }), 'dsh-jupyter: prompt section')
}
