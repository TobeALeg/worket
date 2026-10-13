# Codex 真实接力追查（2026-10-13）

## 已核验事实

同一测试工作 `f218b1b4-d9e3-4f9b-9765-de072d0a0073`，原交付 `65377e53-7622-4147-9512-31110394714b` 的真实目标为 `01a134cf-7142-7f40-b818-290e6abad975`，标题“读取 Worket 工作包”。10:29 UTC 的实际用户消息包含原交付与工作标记，目标回复“已确认只读”。此前“没有找到接收目标”判断已纠正；不能凭打开函数返回证明历史草稿可见，但也不能把既存、已发送的目标当作未交付。

原 URL 为 2653 ASCII 字节，解码提示约 600 字符，符合已安装客户端 `codex://new?prompt=` 解析契约。macOS 只读 LaunchServices 查询将 `codex` 路由到 `/Applications/ChatGPT.app`、`com.openai.codex`（26.1007.30912），未路由到 DOVE。实际目标消息保留交付正文，存在空白格式变化；没有 URL 截断或错误应用的证据。

原隔离实例的桥接端口与日常实例不同。Codex 现有 MCP 命令指向日常安装位置，Hook 默认读取用户级桥接配置；测试启动使用 `WORKPET_SKIP_INTEGRATIONS=1`，没有把目标路由到隔离实例。已有目标又受旧“不要调用工具”测试要求限制，没有 MCP 读取。

对已验证目标提交一次现有公开 `ConversationUpdated` 通知，Worket 自行读取真实用户标记并将同一个 pending binding 确认到真实目标；并非伪造 Hook 或直接写数据库。绑定 ID 仍为 `d850abac-adf5-4cd9-97a6-2aef27dac5e8`，原回复已导入。

## 一次授权补发的结果

用户明确批准后，经正式 `send_message_to_thread` 只补发一次只读指令，限定既有目标与原 Work/Delivery，只允许隔离 stdio MCP 读取命令，不改配置、文件或读取其他会话。发送工具确认成功，目标真实执行命令后在 15 秒超时，最终如实报告未取得工作包。失败回复已自动回流为事件 `1249f330-9b56-46a8-b90a-4a572fc26180`，绑定保持原身份；本次工作包 `read_at` 仍为空。

定位：默认沙箱阻止 loopback 连接。初始化-only 重现中代理收到带 ID 的请求，fetch 失败却返回 `id:null`；接收程序按请求 ID 匹配，因此忽略真实错误直到超时。经正常审批的初始化-only 检查可收到 HTTP 200；诊断未调用工作包工具，不冒充目标已读。

## 修复与验证

MCP stdio 代理的失败请求保留原 string/number/zero ID；无 ID 的合法通知不返回响应，无法解析的 JSON 仍返回 null ID。HTTP 客户端错误携带底层网络错误码，例如 EPERM，不更改沙箱权限或配置。

新增 `test/connectors/mcp-proxy-errors.test.ts` 覆盖错误关联与通知语义。324 项完整回归、typecheck、build、diff check 通过。修复后原隔离读取脚本在诊断进程约 85ms 返回 EPERM，未取得工作包；此复现不计为目标读取。

本机证据位于 `task-3/ui-acceptance/actual-approved-target-read-result.json`、`actual-target-bound-report.json`、`helper-fast-error-proof.json` 与 `real-read-outcome.json`。目标命令、可见失败回复和 Worket 接收事件分别核验。

## 边界

绑定：通过。真实目标命令执行：通过。工作包读取：失败。失败回复回流：通过。完整真实接力验收：未通过。没有再次发送、重发原交付或创建第二个目标，没有覆盖日常 App、改全局 MCP/Hook、push/merge/deploy 或操作被禁止的 Codex 原生 UI。

若继续，目标须通过正常审批重新执行同一只读命令。一次补发授权已使用；本轮不再消息触发它，也不由诊断进程读取后冒充目标接手。
