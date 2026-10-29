# Codex 自动发起与中间修改验证

2026-10-29，Asia/Shanghai。结论：真实接口验证通过，Worket 客户端尚未接入。

## 本轮目标

用户确认必须自动发起执行，成果收回不是本轮强制要求，执行中允许修改和验收节点。本轮验证程序直接启动 Codex、执行真实文件操作、停在待修改状态，并在同一聊天继续；不测试完整视频制作或无人值守工作流。

## 方法与实际环境

- 可复现脚本：[probe-codex-autostart.mjs](../../scripts/probe-codex-autostart.mjs)。脚本必须显式传入 `--run` 和二进制路径；会使用真实模型服务。
- 本机二进制：`/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex`，版本 `0.165.0-alpha.1.2`。
- 使用已有登录和默认模型；本次服务返回 `gpt-6-astra`。任务目录为 `/private/tmp/worket-autostart-Uigoce`，`sandbox=workspace-write`、`approvalPolicy=on-request`。
- 独立 stdio app-server 经 `initialize → initialized → thread/start → turn/start` 发起执行。没有点击发送、操作桌面、调用 app 专属的创建聊天工具或调用 Worket 成果提交。
- 第一轮完成后关闭该 app-server，重新建立连接，通过 `thread/resume` 及 `turn/start` 发出验证脚本模拟的修改意见。修改意见不是用户对业务内容的验收。
- 脚本不自动批准权限请求；遇到交互请求会报告失败。本次两轮都没有 server request。

首次在受限命令沙箱内启动 app-server 返回 `Operation not permitted`，尚未创建聊天。经正常执行审批允许本机运行后完成验证；没有修改全局权限、登录或 MCP 配置。

## 验证结果

| 项目 | 实际证据 | 结果 |
| --- | --- | --- |
| 自动启动 | `turn/start` 返回 `inProgress`，随后收到 `turn/started` | 通过 |
| 确实执行 | Agent 自行读取 `input.json` 并生成 `draft.json`；脚本逐字段核对本次随机请求 ID 和输入内容 | 通过 |
| 中间停留 | 第一轮正常结束，回复“草稿已生成，等待修改或验收”；文件阶段为 `draft` | 通过 |
| 重连与继续 | 新 app-server 恢复原 thread ID，第二轮将标题改为“海边慢慢走”、阶段改为 `revised`；原请求 ID 和正文保持 | 通过 |
| 修改后再次停留 | 第二轮回复“已按意见修改，等待验收”；未生成或提交成片 | 通过 |
| 桌面侧历史可读 | Codex app 的 `read_thread` 能读取同一聊天的两轮用户消息、真实命令及最终回复 | 通过；未测试原生 UI 内输入或运行中抢占 |

聊天 ID：`01a1858b-e1c4-73f3-9f26-c7b9b0385e5a`。

第一轮：`01a1858b-e23c-71b3-8275-86a1af85d2a5`，10:44:59–10:45:17，`completed`。

第二轮：`01a1858c-29e0-78e0-be59-e6f99c192135`，10:45:17–10:45:37，`completed`。

两轮没有 UI 点击、没有自动权限批准。业务文件仅有输入与草稿；`completed` 只表示执行回合结束，不表示成果已被 Worket 验收。

本机原始证据已保存在 `reports/codex-autostart-2026-10-29/`：`evidence.json`、`input.json`、`draft.json`。脚本语法检查与本轮文件 diff whitespace 检查通过；没有运行无关产品回归。

## 结论与接入边界

本机 Codex 的官方 app-server 通道可以承担“发来本次输入即启动”的传输职责，同时保留同一聊天里的修改与待验收状态；无需增加计算机控制权限。[官方协议说明](https://learn.chatgpt.com/docs/app-server)于 2026-10-29 核对，实际参数另以本机生成的协议 schema 核对。

这不是 Worket 产品端到端验收：现有 `src/adapters/codex/executor.ts` 仍使用预填草稿的 deep link，生产 Worket 数据库和正式应用没有变化。没有验证其他执行者、VideoCreator 技能与媒体服务、运行中修改、取消、重复发起恢复或并发。

正式接入时应把发起成功关联到返回的 thread/turn 身份并保留真实状态；回合结束可停在待修改或待验收，不自动等同于工作完成。请求超时不能盲目重发，避免创建重复任务。自动收回、验收和下游放行按具体工作另行决定，不作为自动发起的必要前置。

## 复现

从仓库根目录执行以下命令会新建一次真实验证聊天及独立临时目录。需要本机 Codex 的正常运行权限、有效登录及模型服务访问；脚本不会放宽权限或自动回答审批。

```sh
WORKET_PROBE_CODEX_BINARY=/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex node scripts/probe-codex-autostart.mjs --run
```
