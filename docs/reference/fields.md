# Worket 字段字典

入口：[架构总览](README.md) · [接口手册](interfaces.md) · [精确类型索引](code-index.md)。核对日期：2026-10-23。

本页解释核心业务字段的含义、归属与存储。`?` 表示 TypeScript 允许缺省，`null` 表示显式空值；是否能提交仍受运行时校验和当前状态约束。完整嵌套类型以代码索引为准。

## 1. 身份、版本和校验字段

| 字段（所属对象） | 含义 / 类型 | 由谁提供或产生 | 不能混用的地方 |
| --- | --- | --- | --- |
| `workId / WorkInstance.id` | 一次工作的独立 ID，string | Core/Repository 创建实例 | 外部 threadId 变化不要求更换 workId |
| `WorkDefinition.id / Definition.id / definitionId` | 某个固定工作定义版本的 ID | Core/Repository | id 不是定义系列 key |
| `WorkDefinition.key / Definition.definitionKey` | 同类工作定义的系列标识，string | 创建首版时产生，修订沿用 | 与内容条目 key 不同 |
| `Definition.version` | 已确认版本的递增序号，number | publish | 修订草稿 revision 不等于正式版本 |
| `WorkflowDefinition.id / WorkflowRun.workflowId` | 固定流程定义版本 ID | WorkflowCore.save；运行引用 | 不自动跟随最新定义 |
| `WorkflowDefinition.key` | 同一流程的系列 ID | 首次 save 产生，修订沿用 | 查询筛选 workflowKey 与某版 workflowId 不同 |
| `WorkflowRun.id / runId` | 某一次流程运行 ID | create | 同流程另一次运行有新 ID |
| `WorkflowNode.id / nodeId` | 流程定义内的节点标识 | 编辑者/构建器提供，保存时校验 | 单独 nodeId 不足以确定一次节点执行 |
| `WorkflowNode.contractId` | 节点使用的固定 Definition.id | 编辑者选择并经校验 | 不是 workflowId，也不是 definitionKey |
| `NodeRun.generation` | 某节点第几轮执行，number | 初始 1，返工增加 | 定位需 runId + nodeId + generation |
| `revision / expectedRevision` | 可变草稿/流程运行的修订号与调用者预期值 | 模块保存时递增；调用者带旧值校验 | 不匹配报 REVISION_CONFLICT；不同对象各自计数 |
| `commandId` | 本地业务操作去重键，string | 调用者产生并在同次重试复用 | 同 ID 传不同输入报 IDEMPOTENCY_CONFLICT；并非所有写入口都采用此机制 |
| `Job.id / jobId` | 本地提取任务 ID | DistillationService | 不是远端 requestId |
| `requestId` | 云端提取/接续作业 ID | 云端服务 | GET/DELETE/ack 使用这个 ID |
| `snapshotId` | 本地冻结提取范围的 ID | prepare | 与即时的 WorkSnapshot 聚合视图不同 |
| `deliveryId / packageDeliveryId` | 本次交付所对应的交接包 ID | 交接时生成/关联 | 正确回执属于某次交付，不代表工作永远已读 |
| `contentHash / hash / sha256` | 对各自内容或字节的摘要，string | 相关模块计算 | 必须结合对象和摘要算法输入解释；不是统一版本号 |

源码：[core/types](../../src/core/types.ts)、[repository](../../src/definitions/repository.ts)、[workflow/types](../../src/workflows/types.ts)、[package-receipts](../../src/core/package-receipts.ts)。

## 2. 工作、执行片段与来源

### WorkInstance / WorkRecord / ExecutionEpisode / CaptureBinding

| 对象.字段 | 含义与结构 | 归属 / 落点 |
| --- | --- | --- |
| `WorkInstance.definitionId` | 本次工作引用的定义版本 | Core；work_instances.definition_id |
| `WorkInstance.status` | OPEN / COMPLETED / ARCHIVED | Core；work_instances.status |
| `createdAt / updatedAt` | ISO 时间字符串 | 所属对象模块写入；不要与后台毫秒时间戳混用 |
| `WorkRecord.id / workInstanceId` | 记录自身 ID 与所属工作 ID | Core；work_records，一次工作一个记录 |
| `ExecutionEpisode.executor` | `{type: HUMAN/AGENT/TOOL/SAAS, name}` | Core；execution_episodes.executor_json |
| `ExecutionEpisode.environment` | `{type, name}`，执行所在环境 | environment_json；执行者与环境分别表达 |
| `ExecutionEpisode.status / startedAt / endedAt` | ACTIVE/ENDED、起止时间；结束时间可为 null | execution_episodes |
| `CaptureBinding.episodeId / workInstanceId` | 来源归属的执行片段和工作 | capture_bindings_v2 |
| `CaptureBinding.adapter / conversationId` | 来源适配器 ID、外部会话 ID | capture_bindings_v2；pending:/waiting: 前缀可表达尚未确定的交付绑定 |
| `CaptureBinding.sourceLocator` | 可空的来源定位线索 | capture_bindings_v2.source_locator |
| `CaptureBinding.status` | ACTIVE/INACTIVE | Core 更新；不等于外部应用运行状态 |

### WorkState 与 WorkStateItem

八个字段均为 `WorkStateItem[]`：`objective` 目标、`successCriteria` 完成标准、`constraints` 约束、`facts` 事实、`decisions` 决定、`completedActions` 已完成、`pendingActions` 下一步、`artifacts` 资料与产物线索。

每项的 `id` 标识条目，`text` 是正文；`origin` 为 USER_STATED / AGENT_PROPOSED / SYSTEM_INFERRED / USER_EDITED；`sourceMessageIds` 是来源引用；`editedAt? / originalText?` 保留人工编辑信息。原始状态保存在 `work_records.state_json`。页面 StateItemView 可追加文件链接，接续投影也可能改变展示的内容，因此页面不是直接列出数据库 JSON。

源码：[core/types](../../src/core/types.ts)、[WorkCore](../../src/core/work-core.ts)、[continuationWorkState](../../src/handoff/work-state.ts)、[ui-contract](../../src/ui-contract.ts)。

### SourceEvent / ArtifactRef

| 对象.字段 | 含义 / 使用约束 |
| --- | --- |
| `SourceEvent.id / externalId` | Worket 内部事件 ID / 来源侧事件身份；引用时要核对所在协议是否做了映射 |
| `workInstanceId / episodeId` | 所属工作和可空执行片段 |
| `sequence` | 当前协议内事件顺序；冻结 Snapshot 时会重新顺序编号，不可跨快照直接比较 |
| `kind / content / timestamp` | 事件种类、可空正文、时间字符串 |
| `executorType / environmentType` | 事件观察归属的执行者类型与环境 |
| `metadata` | 扩展信息；来源修订、可见范围等规则由生产与读取模块解释 |
| `artifactRefs` | 关联 ArtifactRef ID 数组 |
| `ArtifactRef.id / path / filename / role` | 资料引用身份、本机路径、文件名、用途 |
| `mimeType / size / sha256 / lastModifiedAt` | 可空类型、字节数、内容摘要、最后修改时间 |
| `availability` | AVAILABLE / CHANGED / MISSING；描述引用对应的文件情况 |

来源档案保留历史观察；`currentSourceEvents` 与 `workEvidence` 负责选当前有效事件和适合整理的证据。`source.absent` 表示目前不可见，不自动撤销已确认约定。`ArtifactRef` 是引用；只有明确固定并保存为 `Material` 的内容才有固定副本语义。

源码：[source-revisions](../../src/core/source-revisions.ts)、[work-evidence](../../src/core/work-evidence.ts)、[storage](../../src/definitions/storage.ts)。

## 3. 可复用定义与审阅

### Definition / Draft / DefinitionContent

| 字段 | 含义 / 归属 |
| --- | --- |
| `Definition.kind` | 完整沉淀定义固定为 REUSABLE；核心简要类型还可表达 GENERAL |
| `Definition.content` | 不可变版本的完整约定，结构见下表 |
| `refs / confirmedAt / contentHash / materials` | 来源引用、确认时间、内容摘要、固定材料；Repository 管理 |
| `category?` | 按 definitionKey 保存并合并读取的分类元数据，不属于不可变 content |
| `Draft.id / revision` | 可编辑候选身份与乐观锁修订号 |
| `jobId? / baseDefinitionId?` | 来自哪个提取任务、基于哪个正式版本修订 |
| `content / originalContent` | 当前编辑内容 / 初始候选内容 |
| `issues / resolutions` | 待解决问题 / 针对问题的处理说明 |
| `refs / materials? / evolution?` | 候选来源、材料及增量变化审阅信息 |
| `publishedId? / invalidated?` | 保存产生的版本身份 / 候选是否失效 |

`DefinitionContent.schemaVersion=1`；`name` 为定义名称；以下条目均以 key 标识，不靠正文定位：

| content 字段 | 数据类型 / 意义 |
| --- | --- |
| `purpose` | DefinedItem，工作目的 |
| `inputs[]` | InputSpec；本次需提供的参数或文件，带 valueType、required、choices?、defaultValue? |
| `deliverables[]` | DefinedItem；交付物，可选 valueType；流程使用前需确认端口类型 |
| `constraints[]` | DefinedItem；限制与约束 |
| `acceptanceCriteria[]` | DefinedItem；验收要求 |
| `methods[]` | DefinedItem + obligation: REFERENCE/REQUIRED；参考或必需方法 |
| `materialRoles[]` | DefinedItem + required，kind? 可为 SKILL；固定资料角色 |

每个 `DefinedItem` 的 `text` 是内容，`basis` 是依据，`rule?` 是适用/生效策略，`document?` 固定规范原文范围，`valueType?/choices?` 表达端口类型。

`Basis` 是三选一结构：SOURCE 带 origin 与 refs；INFERRED 带 refs 与 rationale；USER_AUTHORED 带 reviewEventId。`SourceRef` 包含 snapshotId/workId/eventId，可带 excerpt、role:CONTEXT、deleted。它与远端 WireEvent.key 不是同一个命名空间。

`RulePolicy.scope` 是 REUSABLE/INSTANCE/UNCERTAIN，`status` 是 ACTIVE/PROPOSED/RETIRED；可带 condition 及 relation（DUPLICATE/SUPPLEMENTS/REPLACES/CONFLICT + target）。target 是 `section.key` 地址。`DocumentClause` 带 source/startLine/endLine/hash/name，行号从 1 开始，绑定固定文件版本。

`Issue` 为 id/type/field/message/blocking；`Resolution` 为 issueId/action/explanation。REWRITE/DELETE/CHOOSE/ACCEPT 是处理动作，不自动表示所有内容都可发布；发布仍要通过依赖与内容检查。

源码：[definition contract](../../src/contracts/definition.ts)、[rules](../../src/contracts/rules.ts)、[Repository](../../src/definitions/repository.ts)、[review](../../src/definitions/review.ts)。

## 4. 固定材料、本次输入与工作包

| 对象.字段 | 含义 / 归属 |
| --- | --- |
| `Material.id / hash` | 普通冻结文件以内容 hash 标识；技能包按目录清单固定，见 SkillBundle |
| `path / originalPath` | 固定副本位置 / 原选择位置；执行时校验固定版本 |
| `size / role / bundle?` | 字节数、绑定角色、可选技能目录清单 |
| `Inputs` | `Record<string, string \| number \| boolean>`；FILE 也以路径 string 传入，随后固定副本 |
| `CreateFromDefinition.definitionId / inputs / referenceExampleIds` | 选定定义版本、本次输入、显式参考的旧示例 |
| `ruleOverrides?` | `{target,text}[]`，本次的规则例外，不修改定义 |
| `InstanceInputs.inputMaterials? / inputs` | 固定后的输入副本及值；instance_inputs.payload_json |
| `WorkPackage.packageVersion / purpose / workId / generatedAt` | 工作包协议版本 1、START/CONTINUE、工作 ID、生成时间 |
| `definition / fixedMaterials / skills / referenceExamples` | 完整定义或 null、固定资料、技能入口、显式参考；由现有记录装配 |
| `state / nextStep` | 本次状态投影与下一步，不表示另建一个工作 |
| `continuation? / stateStatus?` | 可用接续结构；RESOLVED/PARTIAL/UNRESOLVED/STALE |
| `acceptanceChecks? / ruleSources? / acceptanceRequired` | 本次有效验收要求、展开规范出处、是否要求验收 |
| `workflow?` | 工作所属运行/节点/代次的投影，不复制另一份流程运行 |
| `fileAccess / sourceNotice?` | 材料访问说明与来源可用性提示 |
| `HandoffPackage.id / workDefinition / generatedAt` | 交接包 ID、定义系列与版本、生成时间；交接包持久存表 |
| `HandoffPackage.state / neededArtifacts / workPackage? / continuation?` | 生成时的状态、所需引用和可选完整工作包/接续快照 |

工作包是组装后的执行投影；交接包是可回查的交付记录。当前 `buildWorkPackage` 会展开有效规则、验证文件并过滤不适合直接执行的来源片段；不能把它当成 Definition 原文的无损序列化。

源码：[storage](../../src/definitions/storage.ts)、[instance-files](../../src/definitions/instance-files.ts)、[work-package](../../src/definitions/work-package.ts)、[core/types](../../src/core/types.ts)。

## 5. 提取快照、作业与模型协议

| 对象.字段 | 含义 / 落点 |
| --- | --- |
| `Snapshot.id / capturedAt / contentHash` | 本地冻结提取范围的身份、时间和摘要；source_snapshots.payload_json |
| `Snapshot.sources[]` | workId/key/title/status/events/files/deleted?；事件和文件均保留固定 hash |
| `Snapshot.analysis?` | 规则版本、事件 KEEP/OMIT 等输入投影信息；不删除原始档案 |
| `baseDefinitionId? / baseContentHash?` | 增量比较所固定的基准版本 |
| `Job.snapshotId / attempt / commandId` | 固定来源、尝试次数、提交操作身份；distillation_jobs.payload_json |
| `Job.requestId? / draftId? / result?` | 远端作业、本地候选、已接收的结果 |
| `ackPending? / cancelPending? / remoteDestination?` | 回执/取消待同步、绑定服务身份，供恢复流程使用 |
| `progress? / seenStatus? / automatic? / error?` | 进度、界面已读状态、持续比较信息、错误 |
| `ExtractionRequest.schemaVersion / snapshotHash` | 协议版本 1、固定请求所用来源范围的摘要 |
| `sources[].key / events[].key` | 请求内 source/event 引用键，与本地 workId/eventId 经快照映射 |
| `WireEvent.sequence / kind / content / hash / document?` | 发送事件顺序、种类、正文、摘要、可选文件角色 |
| `analysis? / ruleSchemaVersion? / evidenceSchemaVersion? / skillSchemaVersion? / evolution?` | 独立能力版本或增量比较基准；不能只检查总 schemaVersion |
| `ExtractionResult.compatibility / content` | COMPATIBLE/CONFLICTING/UNRELATED；候选内容可为 null |
| `issues / groups / requirements` | 问题、多来源分组、INSTANCE/REUSABLE/UNCERTAIN 需求与替代关系 |
| `coverage / versions` | 输入/处理计数、事件覆盖/排除，schema/prompt/model 版本；只反映实际输入 |
| `RemoteJob.requestId / status / result? / error?` | 远端作业视图；error 带 code/message/retryable |

本地 Job.status 与远端状态不同：远端使用 RUNNING/SUCCEEDED/FAILED/CANCELLED/EXPIRED/ACKNOWLEDGED/INTERRUPTED 等值；本地还表达准备、候选待审阅和保存。远端成功不会直接把本地定义确认生效。云端成功结果短期存在内存，ack 清理结果；本地接收后保留所需的快照、候选和依据。

源码：[DistillationService](../../src/distillation/service.ts)、[分析视图](../../src/distillation/analysis-input.ts)、[协议](../../src/contracts/definition.ts)、[AIClient](../../src/ai-service/client.ts)、[server](../../server/service.mjs)。

### ContinuationSnapshot：这一次工作的接续结构

`basis` 记录 sourceDigest/stateDigest/materialDigest/throughSequence/coverage/missingEvidenceIds；来源、状态、材料或成果变化后，用这些字段判断旧快照是否仍适用。

`objective/currentStageId/currentStageBasis` 表达当前目标与阶段依据；`stages[]` 带 task、execution、completionEvidence、outcomes、dependsOn、remaining、blockers；`requirements[]` 带 kind、claim、scope、status、supersedes、replacementEvidence；`uncertainties` 保留未确定事项。每项 claim 都有正文及来源/摘录，支持人工状态依据。

阶段 `execution` 的 REPORTED_DONE 与 SUPPORTED_DONE 分别表示报告完成和有支持证据；outcome.acceptance 的 ACCEPTED 是另一个维度。顶层 resolution 为 RESOLVED/PARTIAL/UNRESOLVED；`STALE` 由工作包判断过期时产生，不是快照自身 resolution 的合法值。

源码：[continuation](../../src/handoff/continuation.ts)。

## 6. 流程定义与运行

| 对象.字段 | 含义 / 归属 |
| --- | --- |
| `WorkflowContent.name / inputs / nodes / outputs` | 名称、总输入、节点及最终输出映射 |
| `Port.key / text / valueType / required / choices? / defaultValue?` | 端口标识、说明、类型、必填、选项、默认值 |
| `WorkflowNode.name / contractId / bindings / after` | 节点名称、固定工作定义版本、输入来源、额外前置节点 |
| `Binding` | INPUT:{key} 引用流程输入；VALUE:{value} 固定字面值；OUTPUT:{nodeId,key} 引用上游端口 |
| `WorkflowContent.outputs[]` | `{key,nodeId,outputKey}`，将节点成果映射为流程最终交付 |
| `WorkflowDraft.baseId? / revision / content / selectedNode / updatedAt / publishedId?` | 另存草稿；selectedNode 为编辑选择状态，不是运行当前位置 |
| `WorkflowRun.name / status / revision / createdAt / updatedAt` | 本次运行名称、生命周期、并发修订号与时间 |
| `directory / inputs / inputMaterials` | 本次运行目录和固定总输入 |
| `nodes` | `Record<nodeId, NodeRun[]>`，每个节点的全部执行代次；末项是当前代次 |
| `events[]` | at/type/nodeId?/detail，流程运行历史 |
| `NodeRun.phase / workId? / directory?` | 当前代次领域状态、准备产生的工作 ID、节点目录 |
| `adopted[]` | 实际采用关系；不是将来要用什么的设计绑定 |
| `outputs[] / manifestId?` | 固定提交的 OutputVersion 和成果清单 ArtifactRef ID |
| `note? / criteria? / acceptedAt?` | 返工意见、逐项验收结果、通过时间 |
| `OutputVersion.id / key / valueType / value` | 具体成果身份、对应端口、类型、值；FILE 值为固定副本路径 |
| `material? / artifactId? / acceptedAt?` | 文件副本、工作成果引用、验收时间 |
| `Adoption.inputKey / nodeId / generation / outputId / outputKey` | 本节点哪个输入采用了哪个上游节点、代次、成果与端口 |
| `RunDetail.definition / contracts / phases / updates` | 固定定义、按节点索引的 Contract、中文状态投影、按上游节点索引的待更新下游集合 |
| `RunSummary.accepted / total / review` | 当前代次通过数、总节点数、当前待验收节点列表；查询时派生 |

类型为 TEXT/NUMBER/BOOLEAN/CHOICE/FILE。依赖由 after 加 OUTPUT 绑定共同决定，保存正式版本时检查无环。运行是否完成按全部当前节点是否 ACCEPTED 判断，不能仅看最终输出节点。文件型输入/输出经过复制和 hash 校验，采用记录固定 outputId，不会自动跟随原路径的新内容。

源码：[types](../../src/workflows/types.ts)、[core](../../src/workflows/core.ts)、[drafts](../../src/workflows/drafts.ts)、[outputs](../../src/workflows/outputs.ts)、[queries](../../src/workflows/queries.ts)。

## 7. 执行者与界面字段

`DeliveryRequest` 的 workId/deliveryId/title/purpose/prompt/cwd? 由应用装配；Adapter 传递 prompt，不重新生成工作要求。`DeliveryReceipt.status?` 为 OPEN_REQUESTED/OPENED/DRAFT_PREPARED，仅表示传输观察；conversationId?/guidance? 为后续绑定与用户操作提供线索。

`ConnectorCapabilities` 表达 deliveryMode、transport、source、mcp、manualSelection?、sendsAutomatically、files。声明的发送能力与实际发送成功不同，需要实际回执/来源观察。

`DashboardView` 包含 works、selectedWorkId、selectedWork、petState、notice、sourceSelection?；`WorkSummaryView.captureStatus` 为 recording/waiting/stopped/selected，由绑定与来源范围计算。`WorkDetailView.understandingStatus` 与 preparationStatus 分别表示整理内容是否有效、准备是否排队/运行；dispatchReadAt 对应交付读取证据。`PetView` 是桌宠展示状态，不能用它替代工作生命周期。

反馈的协议结构包含显式提交的报告正文、截图和可选诊断；本地排队状态与管理员处理状态分开，精确字段见 [problem-report contract](../../src/contracts/problem-report.ts) 与[代码索引](code-index.md)。

## 8. 数据库映射

| 业务内容 | 当前表 / 列 | 结构维护位置 |
| --- | --- | --- |
| 定义简要信息 + 完整 REUSABLE 内容 | work_definitions 关系列 + kind/payload_json | core/schema；definitions/migration |
| 工作身份 / 记录线索 | work_instances；work_records.state_json/tombstones_json/extracted_sequence | core/schema / work-core |
| 执行片段 / 来源绑定 | execution_episodes；capture_bindings_v2 | schema 初建后经 migration 重命名 |
| 原始来源 / 资料引用 / 交接包 | source_events；artifact_refs；handoff_packages.payload_json | core/schema |
| 固定快照 / 提取任务 / 定义候选 | source_snapshots；distillation_jobs；definition_drafts 的 payload_json | definitions/migration |
| 固定材料 / 定义材料关系 | definition_materials.payload_json；definition_material_refs | definitions/migration |
| 本次输入 / 验收审阅 / 命令去重 | instance_inputs；review_events；command_results | definitions/migration |
| 派发状态 / 读取回执 | pending_dispatches；work_package_receipts | migration；core/package-receipts |
| 分类 | definition_categories | definitions/migration |
| 流程版本 / 固定 Contract 引用 | workflow_definitions.payload_json；workflow_contract_refs | definitions/migration |
| 流程运行 / 节点工作归属 | workflow_runs.payload_json；workflow_node_works | definitions/migration |
| 流程编辑草稿 | workflow_drafts.content_json 等独立列 | definitions/migration |
| 自动准备启用范围 / 首次说明 | work_preparation；work_preparation_notice | handoff/work-preparation，构造时建表 |
| 持续比较设置 / 演化历史 | continuous_evolution.payload_json；review_events 中 type=EVOLUTION_CONFIRMED 的事件 | distillation/continuous-evolution 运行时建表；DefinitionRepository.evolutionHistory 查询审阅事件 |
| 后台作业元数据 | metadata.sqlite 的 requests（含 operation） | server/service.mjs |

此表为主要业务存储映射，辅助表完整声明见[代码索引](code-index.md)。schema 迁移目标为 `PRAGMA user_version=5`；`capture_bindings` 在迁移后为兼容拦截视图，不能查询它代替 capture_bindings_v2。独立 JSON payload 内的字段仍是正式存储，未出现在 SQL 独立列中不代表只在内存存在。
