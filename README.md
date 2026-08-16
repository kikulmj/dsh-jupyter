# dsh-jupyter

Jupyter notebook 编辑 / 运行 + Web 终端的 dsh 插件（profile bundle 层安装，不改 dsh 源码）。

## 功能

- **Notebook**：右侧预览面板点击 `.ipynb` 打开，编辑 code/markdown/raw 单元格、增删移动、保存回磁盘；单元格由宿主真实 Jupyter 内核（`jupyter_client`）执行，输出流式渲染（文本 / HTML / 图片 / JSON / 错误），支持中断与重启内核。
- **终端**：左侧边栏「终端」入口（New Session 下方，dsh-ssh 同款设计）展开中间列面板——node-pty 真实 PTY（TERM=xterm-256color）+ xterm.js，**透明磨砂玻璃**风格；复制 / 粘贴走标准键盘快捷键，支持清屏 / 重启 / 关闭，关闭面板不销毁 shell。
  <img width="2877" height="1627" alt="终端面板" src="https://github.com/user-attachments/assets/95fb2d5e-56da-4daf-9832-728b0221c4da" />

## 终端键盘快捷键

复制 / 粘贴没有工具栏按钮，**全部走键盘**（浏览器原生剪贴板路径，不依赖权限）：

| 按键 | 行为 |
| --- | --- |
| `Ctrl+C` / `Cmd+C` | 有文本选区 → 复制选区；无选区 → 照常发送 SIGINT 中断前台命令 |
| `Ctrl+Shift+C` / `Cmd+Shift+C` | 复制选区（无选区时吞掉，避免误触浏览器快捷键） |
| `Ctrl+V` / `Cmd+V` / `Ctrl+Shift+V` | 从系统剪贴板粘贴，绝不进入 shell（`^V`） |

- 右键 / 触控板双指点击只抑制浏览器菜单，**不会粘贴**。
- 选中文本后双击是 xterm 原生单词选择，与粘贴无关。
- 工具栏仅保留：清屏、重启会话、关闭面板。

## 安装

远程（GitHub）：

```sh
dsh plugin --profile web add github:kikulmj/dsh-jupyter#master
# 或完整 URL：
dsh plugin --profile web add git+https://github.com/kikulmj/dsh-jupyter.git#master
```

本地开发（指向本地仓库，改代码 → `pnpm build` → 刷新即生效）：

```sh
dsh plugin --profile web add link:/path/to/dsh-jupyter
```

> 远端默认分支 `main` 是占位（仅 LICENSE）；插件代码在 `master` 分支，故显式指定 `#master`。构建产物（`lib/`）已随仓库提交，远端安装无需本机构建。
>
> **首次安装需放行 node-pty 原生构建**（pnpm 11 默认阻止依赖的 build 脚本）：第一次执行后 dsh 会在 `~/.dsh/profiles/web/pnpm-workspace.yaml` 自动预写 `allowBuilds: { node-pty: set this to true or false }`，把它改成 `node-pty: true`，再重跑同一条安装命令（node-pty 将本地编译，约 10 秒）。安装完成后重启 `dsh web` 生效。
>
> **本地 link 安装**时，`node-pty` 会从插件自身目录（仓库）解析，因此需先在仓库里 `pnpm install`（仓库自带 `pnpm-workspace.yaml`，已放行 node-pty 构建）。

## 卸载

```sh
dsh plugin --profile web remove @dsh-local/dsh-jupyter
```

自动移除 `dependencies` 与 `bundles` 中的插件条目；重启 `dsh web` 后界面入口消失。若之后再安装，按上文流程（含 allowBuilds 引导）重新执行即可。

## 验证

```sh
curl -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3080/dsh-terminal/xterm.css   # 200 = 宿主路由已注册
```

- 左侧边栏 New Session 下方出现「终端」入口，点击展开中间列终端面板。
- 远端安装后 `~/.dsh/profiles/web/node_modules/@dsh-local/dsh-jupyter/lib/` 含 `index.js` / `client.js`；本地 link 安装时该路径是指向仓库的软链接。

## 使用

1. 进入任意项目会话。
2. **Notebook**：右侧 Explorer 点击 `.ipynb`，`Shift+Enter` 运行单元格。
3. **终端**：左侧边栏「终端」入口；shell 初始目录为当前项目根，`cd` 任意；复制 / 粘贴用上表快捷键。

## 开发

```sh
pnpm install   # 首次：装依赖并编译 node-pty（原生模块）
pnpm build     # 生成 xterm.css.ts → tsc → tsdown → 复制 kernel_bridge.py / xterm.css
```

- `node-pty` 是原生模块，运行时经 `createRequire(import.meta.url)` 从插件自身目录解析——本地 link 安装时仓库必须有自己的 `node_modules`。
- `@xterm/xterm` 在构建时内联进 client bundle。
- 客户端 bundle 改动：刷新页面（或 HMR）即生效；宿主端（路由 / PTY）改动需重启 `dsh web`。

## 架构

```
src/
  index.ts             宿主端：注册 /dsh-jupyter/* + /dsh-terminal/* 路由 + agent 通告
  core/                wire 类型（notebook + terminal）
  host/                notebook 服务/内核桥（jupyter_client）；终端 PTY 管理器（node-pty）+ 路由
  client/              notebook 预览列注入；终端（侧边栏入口 + 中间列面板）
```

## 安全

- 所有路由 loopback-only + same-origin 校验（CSRF 防线），变更类 POST 要求 `application/json`。
- notebook 路由有 workspace 门禁；终端是真实 shell（宿主用户全权限、可 `cd` 任意目录），不设门禁——真实防线是 loopback 同源校验（仅本机同源浏览器可开会话）。

## 限制

- 内核桥需宿主 Python 安装 `jupyter_client`、`ipykernel`。
- 终端为单会话面板：关闭面板不销毁 shell，重启 / `exit` 才结束 PTY；宿主卸载时全部回收。
- 宿主端（路由 / PTY）改动需重启 `dsh web`；客户端 bundle 改动走 HMR 自动重载。