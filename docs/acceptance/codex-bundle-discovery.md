# Codex bundle 发现修复（2026-09-30）

用户报告 `conversations:history` 返回“未找到 Codex App Server”。用未修改的默认客户端读取一页会话，稳定复现同一错误。

## 原因与修复

本机桌面主进程来自 `/Applications/ChatGPT.app`。更新后的 CLI 0.159.0 位于 `Contents/Resources/codex-cli/`，包内 `codex-package.json` 指定入口为 `bin/codex`；旧 `Contents/Resources/codex` 已不存在。使用包内官方入口读取会话成功；`app-server --stdio` 仍受支持。

发现逻辑优先使用系统与用户 Applications 下 ChatGPT.app / Codex.app 的新入口，再尝试旧单文件与插件位置。跳过目录与不可执行文件。历史分页、来源投影与连接协议沿用原实现。

## 验证

- `npm test`：291/291 通过。受限环境首次运行因无法监听本机临时端口失败，正常权限完整重跑通过。
- 新回归测试使用真实 stdio 子进程覆盖两种应用名、两个安装目录、新旧两种布局，以及目录/不可执行候选。
- 默认客户端真实读取一页会话及完整历史成功，`history.complete=true`。
- 打包版实际点击“最近活动 → 历史聊天”，显示 30 条 Codex 会话；原生 `conversations:history` 与 `conversations:preview` 成功，未创建或导入工作。
- 对 `/Applications/Worket.app` 的安装版重复同一原生隔离验证，显示 30 条会话，历史预览读取成功。
- 打包代码与编译输出一致；本地数据库、环境文件、密钥与评测数据审计为空；ad-hoc 签名严格校验通过。

## 本机安装

已备份旧应用与 SQLite 工作库，替换 `/Applications/Worket.app` 并普通重启。版本仍为 0.1.7，本次是本机兼容修复，未发布新 GitHub Release、未修改生产后台。

安装前后均为 4 项工作、1,573 条来源事件、1 份定义，数据库 `quick_check=ok`；来源事件按 ID 排序后的逐行摘要一致。备份位于本地忽略目录 `output/app-backups/codex-update-20260930/`。

安装 ASAR 与打包 ASAR 相同：`1acc93c43518758bdff0b3e8307fa250f09339e25be05b54a2377c3dbc6a2b0b`。本地核验脚本及报告位于 `output/playwright/codex-update/`；不包含会话正文输出。

用户随后要求发布新更新包，已正式发布 v0.1.8 并安装最终包；以上 0.1.7 本机修复属于发布前历史验收，最终附件及安装状态见 [v0.1.8 发布验收](../releases/v0.1.8-verification.md)。
