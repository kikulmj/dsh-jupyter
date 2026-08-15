/**
 * @dsh-local/dsh-jupyter — host half: the workspace-gated notebook fs
 * service and the /dsh-jupyter/* HTTP routes (read/write/list + NDJSON
 * streaming cell execution through a real Jupyter kernel bridge), plus the
 * left-edge Web terminal (/dsh-terminal/*: a real node-pty shell per
 * browser session, streamed as NDJSON) on the shared webserver. The browser
 * half (exports "./client") is served by client-modules from the same
 * package's dsh.client declaration.
 *
 * The host half also announces the plugin to every agent through the
 * system-prompt section mechanism, so agents know the notebook panel and the
 * terminal exist and how to cooperate with them.
 * @module @dsh-local/dsh-jupyter
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-subprocess'
import type {} from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { createWorkspaceGate } from './host/gate.ts'
import { NotebookService } from './host/notebook-service.ts'
import { KernelSessionManager, defaultSpawnKernel } from './host/kernel.ts'
import { registerJupyterRoutes, kernelNameOf } from './host/routes.ts'
import { TerminalSessionManager } from './host/terminal.ts'
import { registerTerminalRoutes } from './host/terminal-routes.ts'

/** Required services: the route registry, the managed subprocess seam, the workspace registry, and the prompt band. */
export const inject = ['webServer', 'subprocess', 'workspaceRegistry', 'systemPrompt']

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 215

/** Model-facing announcement: plugin presence, capabilities, and limits. */
export const JUPYTER_GUIDANCE = '本机已安装 dsh-jupyter 插件（Jupyter notebook 预览/编辑/运行 + Web 界面左端终端）：'
  + '① notebook：左侧侧边栏「Notebook」入口打开右侧笔记本面板，可打开工作区内的 .ipynb 文件，编辑 code/markdown/raw 单元格、增删排序单元格、保存回磁盘；单元格通过宿主进程的真实 Jupyter 内核（jupyter_client/python3，内核状态在单元格间共享）执行并流式渲染输出（stdout/stderr、富文本 HTML、PNG/JPEG 图片、JSON、错误回溯），支持中断与重启内核。'
  + '② 终端：Web GUI 左侧边栏「终端」入口行（New Session 下方，dsh-ssh 同款设计）展开中间列终端面板——真实 PTY（node-pty，TERM=xterm-256color）连接宿主本机 shell（$SHELL 或 bash，登录式），初始工作目录为当前会话 cwd（缺省用户家目录），支持输入、列行自适应、清屏、重启、关闭面板。'
  + '宿主端经 /dsh-jupyter/* 与 /dsh-terminal/* 路由提供；notebook 路由带 workspace 门禁，终端是真实用户 shell（可访问宿主用户的全部权限与目录，故不施加 workspace 门禁——真实防线是 loopback+same-origin CSRF 校验，仅本机同源浏览器可访问）。'
  + '用户提到「jupyter / notebook / .ipynb / 笔记本单元格 / 运行单元格」时即指①，提到「终端 / terminal / shell / 跑命令」时即指②，请据此协作；两者都会真实消耗本机资源，先确认再操作。'

/**
 * Mount the notebook data services and their routes, plus the terminal PTY
 * registry and its routes.
 * @param ctx - context carrying webServer, subprocess, workspaceRegistry, systemPrompt.
 */
export function apply(ctx: Context): void {
  const gate = createWorkspaceGate(ctx)
  const notebooks = new NotebookService(gate)
  // The bridge script ships next to the built host half (lib/kernel_bridge.py).
  const bridgeScript = new URL('./kernel_bridge.py', import.meta.url).pathname
  const kernels = new KernelSessionManager(
    notebooks,
    defaultSpawnKernel(ctx),
    bridgeScript,
    (view) => kernelNameOf(view.metadata),
  )
  const terminals = new TerminalSessionManager()
  ctx.effect(() => registerJupyterRoutes(ctx, notebooks, kernels), 'dsh-jupyter: /dsh-jupyter routes')
  ctx.effect(() => registerTerminalRoutes(ctx, terminals), 'dsh-jupyter: /dsh-terminal routes')
  ctx.effect(() => () => kernels.disposeAll(), 'dsh-jupyter: kernel sessions')
  ctx.effect(() => () => terminals.disposeAll(), 'dsh-jupyter: terminal sessions')
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'plugin:dsh-jupyter',
    order: SECTION_ORDER,
    text: JUPYTER_GUIDANCE,
  }), 'dsh-jupyter: prompt section')
}
