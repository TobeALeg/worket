# 本地 Codex 会话发现与标题搜索

2026-10-13；基线 `986244f`；本机 `codex-cli 0.162.0-alpha.17.2`。本轮只修本地发现，不安装日常 App、不恢复归档任务、不增加人工来源。

## 问题与修复

通过应用工具创建的真实本地合成任务（`threadSource=agent_created_thread`、`source=vscode`）可以由 `thread/read` 与分页历史读取，但默认 `thread/list` 的 rollout 扫描路径未返回该任务。保持同一 ID、配置和 `updated_at` 排序，只设置 `useStateDbOnly=true` 就能在第一页找到；官方 `searchTerm` 也可准确查到。此证据说明发现入口不同，不说明所有 dot 任务都存放在本机。

客户端使用官方 stateDB 列表；历史面板把 Codex 标题查询传递给官方搜索，翻页保留同一查询。列表按来源 ID 去重、排除显式归档行，拒绝无效响应和重复游标。旧版本仅在明确返回不支持字段的 `-32602` 时降级；兼容提示说明可能遗漏工具创建的任务或仅搜索已加载页，连接/权限错误不冒充空结果。旧服务静默忽略搜索参数时也按返回页标题过滤。

发现只读元数据。搜索、刷新与翻页不会创建工作或读取会话正文；仍需用户点击“开始记录”。异步搜索立即撤销旧结果的有效性，迟到的成功或错误不会覆盖新查询。

## 验证

- 新协议回归先失败后通过：agent-created 任务、去重/归档、查询分页、旧参数降级与缓存、真实错误、无效响应与重复游标。
- 业务层回归：`searchTerm` 和游标传入指定来源，兼容提示返回 UI；候选查询不产生 WorkInstance 或历史读取。
- 独立浏览器组件 QA：合成 RPC、隔离浏览器配置、无第三方页面；验证过期成功/错误丢弃、分页保留查询/去重、仅明确点击才提交记录请求。按仓库惯例独立于默认 Node 测试，未将系统 Chrome 加为默认测试要求。
- 修复后的真实适配器复测指定合成 ID：默认第一页发现、标题搜索唯一匹配、分页历史可读、可见助手回复仍包含 `WKC2C-20261013-READONLY`。没有读取其他会话正文、没有 resume。
- 完整默认回归 318 项通过，`npm run typecheck` 与构建通过；`git diff --check` 通过。

```sh
npm test
npm run typecheck
npm run qa:codex-search
```

`qa:codex-search` 使用已安装 Chrome 的独立临时配置，不访问用户日常浏览器或 Codex。真实 ID 的复测材料保留在接替任务工作区 `task-3/fixed-live-discovery-report.json`，不提交聊天正文。

## 验收边界与最小人工操作

真实桌面 Codex→Worket 点击记录→新 Codex 发送→绑定/回流尚未通过。电脑控制工具对 `cua.getApp("com.openai.codex")` 返回明确禁止，未绕过。组件点击和业务接口实验不代替真实桌面证据；日常安装仍是原版本，不含本次修复。

下一次使用包含本提交的测试构建：

1. 用户在普通本地 Codex 新建聊天并发送：`只读合成测试 WKC2C-CONTROL：只回复已确认只读；下一步是读取 Worket 工作包并复述。不要调用工具或修改文件。`
2. 回复完成后保持该聊天打开。在 Worket 历史聊天选择 Codex、按该标题搜索，点击该行“开始记录”，确认保存的工作与来源一致。
3. 在该工作的交接菜单选择 Codex，确认新聊天草稿，再由用户发送。检查同一 WorkInstance 下的新真实会话绑定、MCP 读取和回复回流；测试接收端必须实际连接持有该记录的 Worket。此步骤不能只凭打开或复制工作包算成功。

本次工具创建任务的初始 Prompt 出现在任务预览，但规范化历史没有对应 `user.prompt` 事件。因此它不能代替上述人工创建对照，也没有把预览伪造成用户原始消息。

## dot / durable 任务另案

旧指定任务由平台读接口可读取，元数据 `kind=codex, hostId=durable`，最后一轮 interrupted；同一本地 App Server 的 `thread/read` 首次调用即返回 `-32600 thread not loaded`，非分页读取错误。覆盖所有官方来源种类的本地归档/非归档标题搜索，以及本机指定 ID 的索引/会话文件元数据检查均未找到。不能靠本轮 stateDB 选项使该远端任务自动出现，也不能仅凭错误推断全部 dot 任务的物理存储。

本机成功返回的 `status=notLoaded` 与 JSON-RPC 读取错误不同。官方支持不经 resume 读取持久历史，故不将恢复旧归档任务作为录制前提。

协议依据：[本机 App Server 文档](https://learn.chatgpt.com/docs/app-server)（另已核对本机生成的 schema）、[Work/dot 的云端协调与本地执行边界](https://learn.chatgpt.com/docs/enterprise/cloud-local-access)。当前公开资料未保证外部 Worket 可直接读取 dot 的协调历史；第二阶段须单独建立受支持、明确授权的来源契约，不抓私有接口或令牌。
