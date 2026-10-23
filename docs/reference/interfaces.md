# Worket 接口手册

入口：[架构总览](README.md) · [字段字典](fields.md) · [完整代码索引](code-index.md)。核对日期：2026-10-23。

接口的约定包括参数、返回值、允许调用的状态、错误与副作用。本页先按调用方区分接口，再列常用操作。精确可选字段与方法签名见代码索引；没有完整逐 action 静态类型的入口，必须核对处理分支。

## 1. 接口分层

| 调用关系 | 入口 | 参数风格 | 结果 / 错误 |
| --- | --- | --- | --- |
| 页面 → Electron 主进程 | `window.workpet` → preload → IPC handler | 一般为 camelCase；部分方法为位置参数，三组业务入口为 action + input | Promise；主进程异常使 invoke 拒绝，错误展示由页面处理 |
| 主进程 → 业务模块 | AppService / Desktop / Core / Repository | 类型化对象或位置参数；不少 Desktop input 为 unknown 后转型校验 | 对象、ID、void 或 Promise；抛 Error/ContractError |
| 外部执行者 → 本机桥 | POST `/mcp`，JSON-RPC tools/call | MCP 参数使用 snake_case，如 work_id | MCP content；异常转 JSON-RPC error.code=-32000 与 message |
| Hook/选定内容 → 本机桥 | `/hooks/:executorId`、`/selected/stage`、`/web/transfer` | 适配器 payload / SelectedContent / 网页回执 | JSON；桥接错误 HTTP 400 + `{error}` |
| 客户端 → 云端 | `/v1/*` HTTP | JSON + Bearer；分析提交额外带 Idempotency-Key | JSON；code/message/retryable 错误，状态码见后文 |
| 管理员 → 后台管理 | `/admin/*` | 管理会话与 CSRF | 管理配置/样本/反馈，不是桌面业务接口；部署说明要求回环/隧道访问 |

来源：[preload](../../src/preload.cjs)、[main](../../src/main.ts)、[http-bridge](../../src/bridge/http-bridge.ts)、[MCP handler](../../src/bridge/mcp-handler.ts)、[server](../../server/service.mjs)、[admin](../../server/admin/http.mjs)。

## 2. 页面常用 IPC

以下方法均挂在 `window.workpet`。通道逐条完整清单见[代码索引](code-index.md)。

| 方法 | 主要输入 | 返回 / 副作用 | 处理模块 |
| --- | --- | --- | --- |
| `getDashboard(workId?)` | 可选工作 ID | DashboardView，聚合列表与选中工作 | AppService.dashboardWithContext |
| `listExecutors()` | 无 | ExecutorView[]，含可用性、可交付性和能力 | AppService |
| `listConversations(executorId)` / `listRecentConversations()` | 执行者 ID / 无 | 前者 ConversationView[]；后者分执行者的最近来源与提示 | AppService |
| `listConversationHistory(executorId,cursor?,searchTerm?)` | 分页、搜索 | ConversationPageView | AppService |
| `previewConversation(executorId,threadId)` | 外部会话身份 | ConversationPreview，统计与预览 | AppService |
| `createWorkFromConversation(request)` | executorId/threadId；兼容 allowCloudExtraction? | DashboardView；记录范围按当前动作处理，不由旧兼容字段独立授权 | AppService |
| `createWorkFromMessage(request)` | sourceWorkId/startExternalId | DashboardView；从消息切出新工作 | AppService |
| `refreshWork(workId)` | 工作 ID | 同步来源并返回 DashboardView | AppService |
| `completeWork / archiveWork / resumeWork` | 工作 ID | 更新生命周期并返回 DashboardView | AppService → Core |
| `handoff(workId,executorId)` | 同一工作 + 新执行者 | 准备接续、保存交接并启动交付；返回 DashboardView | AppService |
| `reopenHandoff(workId)` | 工作 ID | 再打开交付入口；不凭打开动作确认接手 | AppService |
| `cancelHandoff / cancelRecording` | workId/confirmation | 明确取消相应操作，返回 DashboardView | AppService |
| `previewSelectedContent / importSelectedContent` | SelectedContent | 规范化预览/范围提示，或导入并返回 DashboardView | AppService |
| `openArtifact(workId,itemId)` | 已登记引用 ID | 校验引用后交系统打开；不接受任意文件路径替代 itemId | main → AppService.artifactPath |
| `exportWorkPackage / copyWorkPackage` | workId | 保存 Markdown / 复制工作包文本 | main → buildWorkPackage |
| `configureWorketService / getWorketServiceStatus` | 连接配置 / 无 | 更新连接 / 查询服务状态 | main → connection |

`feedback(action,input)`、`distillation(action,input)`、`workflow(action,input)` 是三组不同分发器，输入结构不能互换。窗口/文件操作与业务命令混合存在于 preload，但领域写入最终由对应模块处理。

## 3. distillation 命令

调用：`window.workpet.distillation(action, input)` → IPC `distillation:command` → `DistillationDesktop.call`。

| action | 关键输入 | 结果与副作用 |
| --- | --- | --- |
| `prepare` | `{workIds, includedFileIds, fileRoles?, baseDefinitionId?}` | Snapshot；固定来源范围和附件选择，不调用模型 |
| `start` | `{preparationId,expectedContentHash,consentVersion,commandId}`，preparationId 来自 Snapshot.id | 本地 Job；固定当前范围，异步提交前校验来源、能力与服务身份 |
| `job / jobs / activity` | `{jobId}` / 无 / 无 | 单任务、任务列表或活动投影；列表增加来源标题 |
| `snapshot / draft` | `{id}` | 固定来源快照 / 当前候选 |
| `cancel / retry / seen` | jobId；retry 另有操作/范围字段 | 取消、重试或记录已查看状态；见 Service 方法签名 |
| `update` | `{draftId,expectedRevision,content,issueResolutions,replaceResolutions?,materialBindings?}` | Draft；编辑与审阅，检查修订及失效依赖 |
| `publish` | `{draftId,expectedRevision,materialBindings,commandId,sourceReviewHash?}` | Definition；确认保存固定版本，存在演化专用结果分支 |
| `definitions / definition / versions` | 分页 / `{id}` / `{key}` | 系列最新列表、某版定义、某系列版本 |
| `revise / deleteDefinition / setDefinitionCategory` | 版本 ID 与相应命令参数 | 创建修订候选 / 删除定义 / 更新分类元数据 |
| `create` | CreateFromDefinition，另可携带改进授权版本 | WorkSnapshot；创建新工作与本次固定输入 |
| `dispatch` | `{workId,executorId,commandId}` | DashboardView；持久派发占位、防重并调用 AppService.handoff |
| `package / artifacts / attach / accept` | 工作 ID 与操作字段 | 读取工作包/成果，登记产物，关联具体成果与逐项验收 |
| `sourceReview / evidence` | 候选 ID / 引用定位字段 | 来源审阅投影 / 原文证据；不得把展示摘要当原文 |
| `previewDocumentRevision / adoptDocumentRevision` | 规范文件修订字段 | 检查/采纳规范变化并更新相关审阅 |
| `materialRecovery / recoverMaterial / instanceFiles / updateInstanceFiles` | 固定材料或本次输入身份 | 查询问题、恢复相同固定版本，或显式更新本次输入 |
| `continuousEvolution / setContinuousEvolution / evolutionSources / evolutionHistory` | definitionId、启用与授权信息 | 持续比较状态/设置、可用新来源、版本演化历史 |
| `improvementPreference / setImprovementPreference / improvementSamples / stopImprovement / deleteImprovement / syncImprovement / recordingNotice` | 按动作传 enabled/id/confirmation 等 | 改进样本及授权管理，与确认定义是独立流程 |
| `capabilities / examples` | 无 / `{definitionId}` | 后台能力 / 定义来源工作的示例成果引用 |

完整 action 索引与精确方法签名：[代码索引](code-index.md)。源码：[Desktop](../../src/distillation/desktop.ts)、[Service](../../src/distillation/service.ts)、[Repository](../../src/definitions/repository.ts)。

**创建与派发分开：**create 返回工作不表示执行者已接手；dispatch 失败仍使用原 workId 重试。pending_dispatches 与本次读取回执负责区分 STARTING/WAITING/FAILED、真实绑定和已读取。

## 4. workflow 命令

调用：`window.workpet.workflow(action,input)` → IPC `workflow:command` → `WorkflowDesktop.call`。

| action | 输入 | 返回 / 业务影响 |
| --- | --- | --- |
| `catalog` | `{}` | `{definitions,contracts}`，流程版本与可选 Contract 列表 |
| `confirmPorts` | 见 confirmOutputTypes 的参数 | 固定交付端口类型，供流程连线使用 |
| `drafts / draft` | `{}` / `{id}` | DraftSummary[] / WorkflowDraft |
| `saveDraft` | `{id,expectedRevision,content,selectedNode,baseId?}` | WorkflowDraft；允许暂不完整，校验基本形状与容量 |
| `publishDraft` | `{id,expectedRevision,commandId}` | WorkflowDefinition；过滤未使用总输入，再验证正式流程并固定版本 |
| `removeDraft` | `{id,expectedRevision}` | void；只移除未发布且修订匹配的草稿 |
| `definition / save` | `{id}` / `{content,baseId?,commandId}` | 固定版本 / 新 WorkflowDefinition |
| `queryRuns` | `{workflowKey?,status?,search?,review?,cursor?,limit?}` | RunPage；轻量分页列表 |
| `runs / detail` | `{workflowId?}` / `{runId}` | RunDetail[] / RunDetail；runs 的筛选是固定版本 ID |
| `create` | `{workflowId,name,inputs,commandId}` | RunDetail；初始修订为 1，固定总输入 |
| `dispatch` | NodeCommand + executorId | RunDetail；先 prepare 创建本轮 workId，再 dispatch |
| `submit` | NodeCommand + `{outputs}` | RunDetail；固定输出并进入 SUBMITTED |
| `review` | NodeCommand + `{decision,criteria,note?}` | RunDetail；PASS 须全部通过，REVISE 要求返工说明并创建新代次 |
| `rework` | NodeCommand + `{note}` | RunDetail；旧代次标 SUPERSEDED，再建新代次 |
| `impact` | `{runId,nodeId}` | string[]，受上游变化影响的后续节点 ID，不写运行 |
| `adopt` | NodeCommand | RunDetail；源节点当前成果先验收，再重做有依赖的后续 |
| `status` | RunCommand + `{status:RUNNING/PAUSED/CANCELLED}` | RunDetail；按当前状态限制转换 |
| `openOutput / previewOutput` | `{runId,nodeId,generation,key}` | 系统打开结果 / `{text:string或null}`；只读已登记固定材料并校验 hash |

`RunCommand={runId,expectedRevision,commandId}`；`NodeCommand=RunCommand+{nodeId,generation}`。修改运行时既检查 revision，又检查当前 generation。`dispatch` 还拆出稳定的 `:prepare` / `:dispatch` 子命令 ID，重试不要随意换 ID。

常见错误：REVISION_CONFLICT（状态已变化）、STALE_GENERATION（旧轮提交）、WORKFLOW_NOT_RUNNING（暂停/取消）、WORKFLOW_NODE_NOT_READY（依赖未就绪）、WORKFLOW_NODE_NOT_ACTIVE（已提交/被替代）、INPUT_REQUIRED（必填/验收缺口）、SOURCE_CHANGED（固定文件校验不一致）。

源码：[desktop](../../src/workflows/desktop.ts)、[core](../../src/workflows/core.ts)、[outputs](../../src/workflows/outputs.ts)、[drafts](../../src/workflows/drafts.ts)、[output-ports](../../src/definitions/output-ports.ts)。

## 5. 外部执行者接口

### 本机 MCP

桥监听 `127.0.0.1`，端口默认动态分配；配置写入 host/port/token。HTTP 请求必须 POST、带 `x-workpet-token`，且不能带 Origin。MCP 支持 initialize、tools/list、tools/call；通知无 id 时不返回 JSON-RPC 结果。

| 工具 | 参数 | 返回 / 副作用 |
| --- | --- | --- |
| `get_work_context` | `work_id` 必填；`delivery_id?`；`context_version?` 为 1/2/3/4，默认 4 | v4 返回执行说明文本；1–3 返回兼容结构。成功读取可记录审计；带匹配 delivery_id 才确认本次交付读取 |
| `get_work_evidence` | `work_id`；`event_ids?` 最多100；`after_sequence?`；`limit?` 1–100，默认20 | 当前有效证据分页 |
| `get_work_archive` | `work_id`；`after_sequence?` | 历史 events、当前有效 currentEventIds、修订解释；不等于只返回当前有效事件 |
| `get_artifact_refs` | `work_id` | 当前工作资料路径及校验信息，记录读取审计 |
| `submit_workflow_outputs` | `work_id,command_id,outputs` | `{status:SUBMITTED,runId,nodeId,generation,acceptanceRequired:true}`；反查当前节点归属，用统一提交逻辑；没有批准验收权限 |

工具结构结果通常放入 MCP `content:[{type:'text',text:JSON.stringify(...)}]`；v4 context 直接为说明文本。HTTP 200 不代表工具成功，仍须检查 JSON-RPC error。

源码：[MCP handler](../../src/bridge/mcp-handler.ts)、[上下文投影](../../src/bridge/handoff-context.ts)、[Bridge](../../src/bridge/http-bridge.ts)。

### Adapter 与来源规范化

| 接口 | 调用约定 |
| --- | --- |
| `ConversationSource.readThread(id)` | 返回 NormalizedThread，带 threadId/title/cwd/时间/events，历史完整时还带 history |
| `listThreadPage? / listRecentThreads?` | 可选分页与最近会话；能力由适配器决定 |
| `ExecutorAdapter.resolveCurrent(application)` | 从前台应用信息定位会话，无法定位可返回 null |
| `inspect / inspectDelivery?` | 分别检查应用/历史可用性与交付能力 |
| `deliver?(DeliveryRequest)` | 接收应用已装配的 prompt，返回 DeliveryReceipt；打开/预填草稿不代表发送或读取 |
| `normalizeHook? / reconcileHistory?` | 将应用事件转为选定内容，或对齐历史观察 |

源码：[executor types](../../src/executors/types.ts)、[adapter types](../../src/adapters/types.ts)、[registry](../../src/executors/registry.ts)。

## 6. 云端 HTTP

源码定义的协议如下；这不是实时线上路由/能力检查。`/v1/installations` 在认证前由注册处理器接收，是否开放取决于自动注册配置。其余业务请求使用当前主体的 Bearer 认证并隔离数据。

| 方法 / 路径 | 请求 | 返回与用途 |
| --- | --- | --- |
| GET `/health` | 无 | `{ok,configured}` |
| POST `/v1/installations` | `{secret,recoveryCode}` | 注册/恢复匿名用户设备并获取身份结果；见 AdminStore.enrollInstallation |
| GET `/v1/capabilities` | Bearer | 各种 schemaVersions、limits、fileTypes、数据政策与改进设置 |
| POST `/v1/definition-extractions` | ExtractionRequest + Idempotency-Key | 202 `{requestId,status}`；同主体同键同请求复用，异内容冲突 |
| POST `/v1/continuations` | ContinuationRequest + Idempotency-Key | 202 作业视图；与提取共用作业基础设施 |
| GET `/v1/{definition-extractions或continuations}/:id` | Bearer | 作业视图，成功时可含 result |
| DELETE 同上 | Bearer | 取消并清理短期结果，返回 CANCELLED |
| POST 同上 `/:id/ack` | Bearer | 确认已接收并清理结果；仅允许指定终态 |
| POST `/v1/improvement-samples` | SampleUpload | 授权改进样本接收结果；独立于模型作业 |
| DELETE `/v1/improvement-samples/:id` | Bearer | 删除当前主体对应样本 |
| POST / GET `/v1/problem-reports` | 报告包 / Bearer | 报告回执 / 本人报告列表 |
| GET / DELETE `/v1/problem-reports/:id` | Bearer | 本人报告详情 / 删除 |

能力版本相互独立，包括 schemaVersions、ruleSchemaVersions、evolutionSchemaVersions、evidenceSchemaVersions、skillSchemaVersions、analysisSchemaVersions、continuationSchemaVersions、problemReportSchemaVersions。客户端须检查实际支持值，不能因连通就推定支持某种请求。

通用模型服务错误为 `{code,message,retryable}`；认证失败为 401，找不到 404，额度/并发/报告速率为 429，幂等冲突为 409，其他校验一般为 400。模型作业异步失败可体现在成功 HTTP 响应中的 job.error，须同时检查 status。

后台管理接口另含会话、配置/测试、用户设备管理、样本审阅和报告处理；入口完整实现见 [admin/http](../../server/admin/http.mjs)，不将其混入桌面接口调用路径。部署限制见 [server/README](../../server/README.md)。

## 7. 反馈命令与一致性边界

`feedback:command` 包含 draft/save/add-image/remove-image/discard/fault/submit/list/get/remote/remote-detail/retry/cancel/delete-remote/capture/add-capture/export/renderer-error，完整来源见[索引](code-index.md)。输入有的为对象，有的直接为报告 ID 字符串，不统一包装成 `{id}`。截图只由显式 capture 动作产生，submit 冻结发送包，重试复用原包与目的地身份。

当前没有统一覆盖所有 IPC 的逐命令请求/响应注册表。部分函数有严格领域类型，部分分发入口保留 `unknown` 或 `any`，再由具体运行时分支检查。本手册描述当前调用约定，不表示本轮新增了类型校验或统一协议。
