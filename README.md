# dsh-jupyter

Jupyter notebook 编辑 / 运行 + Web 终端的 dsh 插件。

## 功能

- **Notebook**：右侧预览面板点击 `.ipynb` 打开，编辑 code/markdown/raw 单元格、增删移动、保存回磁盘；单元格由宿主真实 Jupyter 内核（`jupyter_client`）执行，输出流式渲染（文本 / HTML / 图片 / JSON / 错误），支持中断与重启内核。
- **终端**：左侧边栏「终端」入口（New Session 下方）展开中间列面板——node-pty 真实 PTY（TERM=xterm-256color）+ xterm.js，支持清屏 / 重启 / 关闭，关闭面板不销毁 shell。
  <img width="2877" height="1627" alt="image" src="https://github.com/user-attachments/assets/95fb2d5e-56da-4daf-9832-728b0221c4da" />


  

## 安装

```sh
dsh plugin --profile web add github:kikulmj/dsh-jupyter
# 或完整 URL：
dsh plugin --profile web add git+https://github.com/kikulmj/dsh-jupyter.git
```

安装后重启 `dsh web` 生效。构建产物（`lib/`）已随仓库提交，无需本机构建。

## 使用

1. 进入任意项目会话。
2. **Notebook**：右侧 Explorer 点击 `.ipynb`，`Shift+Enter` 运行单元格。
3. **终端**：左侧边栏「终端」入口；shell 初始目录为当前项目根，`cd` 任意。

## 开发

```sh
pnpm build   # 生成 xterm.css.ts → tsc → tsdown → 复制 kernel_bridge.py / xterm.css
```

依赖：`node-pty`（原生模块，运行时经 `createRequire` 解析）、`@xterm/xterm`（构建时内联进 client bundle）。

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
