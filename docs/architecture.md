# 架构：本地 Work Core 与桌面应用 Adapter

v0.1.5 客户端与生产后台已同步，服务代码为 `8ffa545`。自动准备路径在发送前检查 `continuationSchemaVersions`，当前生产能力为 `[1]`；兼容旧后台时仍保留缺少能力的明确降级。元数据新增 `requests.operation` 区分整理与沉淀请求，已有请求默认 `definition`。配套部署与验证见 [发布验收](releases/v0.1.5-verification.md)。

## 面板展示收敛（2026-09-23）

`recording-sources` 的最近活动列表不再请求或展示首次记录说明，历史聊天仍沿用原有说明规则。history 图标保留原按钮事件及可访问名称；工作详情以弹性布局排列返回按钮和执行者，长名称省略并保留悬停全文。准备状态仅在有实际状态或提示时渲染，删除无状态时的说明占位；工作操作继续使用原生 `details/summary`。此次只调整 renderer，不改变记录、交接或后台准备流程。

验证：`npm run build` 通过；隔离 Chromium 的合成 IPC 页面验证历史入口键盘打开、三点菜单执行操作、返回列表、实际准备/失败提示，以及 400px、360px 和长执行者名称的布局。报告与截图见 `output/playwright/panel-cleanup/`。该次验证未更新已安装应用；随后用户确认批次结束，已完成 [打包、安装与重启验收](acceptance/panel-navigation.md)。

服务设置导航补充：`distillation.show` 接收可选返回目标，仅服务设置与改进数据传入。箭头和 Esc 共享同一返回处理，等待改进偏好保存后再导航；改进数据返回服务页，服务页回到原面板并恢复菜单焦点。其他沉淀弹层继续使用原有关闭行为，每次渲染重置取消事件，避免返回处理泄漏到候选审阅。

## 沉淀直接启动（2026-09-23）

普通入口统一调用 `renderer/distillation.startDistillation(workIds)`：准备本地快照（不选择附件正文）→ 检查相同内容是否已有运行中任务 → 读取当前改进偏好 → 沿用已有 `start` 命令 → 刷新后台状态。同一次启动中的并发点击合并；同内容仍在运行时不新增模型任务。既有范围哈希、来源最新性、服务身份与提交命令幂等校验保持。

`openPreparation` 仅用于可选的附件范围编辑和已有约定的增量比较。普通附件入口只提供文件范围与用途，不重复展示云端确认或改进开关；参与改进统一读取已保存设置。生成后的候选审阅和不可变发布流程保持。

## 共享证据、托管整理与状态投影（2026-09-23）

`workEvidence` 统一取当前来源版本，并排除内部推理及 Worket 自己的 MCP 读取审计；本地线索、阶段整理、沉淀和持续比较共用此入口。`contracts/evidence` 统一覆盖集合、原文摘录与用户证据角色判断。外部消息 ID 在整理输入中映射到档案事件 ID，人工编辑/用户确认条目与普通关键词线索保持区别。

`AppService` 的记录、从消息新建、继续记录动作启用 `WorkPreparation` 并排入后台；同步计算 basis，新变化防抖 30 秒。`handoff → WorkPreparation.ensure` 等待同一工作正在进行的任务，必要时准备最新状态。共享的 `ContinuationService → WorketAIClient.continuation → /v1/continuations` 经已有托管连接处理。提交前和轮询时核对工作状态、输入依据与服务身份；默认读取/MCP 的 generator 为空，不能自行取得上传权限。`work_preparation` 保存按工作和服务身份限定的启用范围及最后尝试摘要，启动只恢复已启用的活动记录；未变化的失败在重启后也不会循环重试。`work_preparation_notice` 保存首次范围说明版本。完成、归档、来源绑定或服务身份变化会阻止后续发送；退出清除定时器。服务器与沉淀共用身份、额度、幂等、取消、结果短期内存保留和 ack；每次整理只调用一次模型，数据库仅保留操作元数据。requests 表新增 operation 列，旧行默认 definition；回滚旧代码须同时考虑数据库备份。

整理候选以来源 ID/摘录、覆盖、范围、替代、依赖与材料版本校验，保存到不可变 HandoffPackage.continuation。`buildWorkPackage → continuationWorkState` 是界面、导出和 MCP 的共同投影；原始八字段仍作为来源线索保留。basis 包含来源、状态、全部固定材料、技能、参考与成果版本，变化即失效；自己的读取审计不使状态失效。超过 80,000 JSON 字符或失败返回 PARTIAL/UNRESOLVED，不静默裁剪。

`DefinitionRepository.accept` 同事务写入 work.acceptance 事件及既有 review_events，记录实际验收的交付物 ID/hash 和标准结果。接续推导当前实例，定义提取跨实例复用；两者共享证据基础，不共享一个泛化摘要。桌面不再通过供应商环境变量自动分析对话，评测用的独立状态提取工具仍保留。验收见 [工作接续](acceptance/work-continuity.md) 与 [自动准备](acceptance/automatic-work-preparation.md)。

## 交接内容的唯一装配点（2026-09-23）

`AppService.handoff → buildWorkBootstrap → DeliveryRequest.prompt` 是交付内容的唯一装配路径。Codex/WorkBuddy 仅对该文本进行 URL 编码，通用剪贴板直接传递该文本，不能重新生成 prompt 而丢失上下文版本。集成测试通过真实 AppService 与四个默认适配器验证，系统打开操作使用替身。

## 规范修订的审阅范围（2026-09-23）

adoptDocumentRevision 使用 resolveReviewField/sameAddress 按原始候选身份筛选已有 resolutions，仅清除当前条款及所在栏位整体的决定。repository.update 原有依赖失效逻辑继续生效；快照与引用存储流程未改。见 [规格](specs/document-revision-review.md) 与 [验收](acceptance/document-revision-review.md)。

## 规范文件的部分采纳（2026-09-23）

document-adoption 冻结原始文件/聊天请求与真实响应，校验原文行范围、有效规则去重、本次例外、新实例验收及 MCP。评测器区分 SKILL 与普通规范材料，保留原始零角色断言误报；运行逻辑与协议不变。见 [验收](acceptance/document-adoption.md)。

## 组合技能的固定目录（2026-09-23）

skill-environment.ts 将不可变定义中已固定技能投影到 definition-materials/skill-environments/<definitionId>/<原目录名>，WorkPackage.skills 使用这些可解析兄弟引用的入口。单技能保持旧路径，canonical 清单仍是版本依据，派生缓存失配从验证后的副本重建。保存/发布检查名称冲突，定义删除回收派生目录；无数据库或模型协议变更。见 [规格](specs/combined-skills.md) 与 [验收](acceptance/combined-skills.md)。

## 整体采纳中的局部边界（2026-09-23）

新增 bounded-adoption 冻结真实响应及 hash 校验，覆盖同会话局部撤回和新旧实例版本。原始词面检查误报保留，扩充等义表达后回放未修改响应；运行协议、提示及服务逻辑均不变。见 [验收](acceptance/bounded-adoption.md)。

## 草稿资料与修订恢复（2026-09-23）

save 仅在 update 成功返回并采用持久化草稿后清空 renderer undo，避免恢复绑定原路径的旧快照；异常路径不清空。未新增材料历史或改变后端固定版本。

审阅条目身份为 section + key，key 仅栏位内唯一。removeItem 仅在 materialRoles 删除时清除 pending materialBindings，方法/输入删除不修改资料选择。

Draft.materials 保存经过 MaterialStore 校验的固定副本；draft-materials.ts 在事务中更新选择并按草稿/定义双重所有权清理。发布采用显式新选择、草稿固定副本、允许继承的原定义资料顺序，发布成功移交所有权。revise 复用同一基准的最新可编辑手动草稿；取消和永久来源删除释放失效草稿引用。见 [规格](specs/draft-materials.md) 与 [验收](acceptance/draft-materials.md)。

## 范围提升与冗余关系（2026-09-23）

server/normalize-evolution.mjs 在 validateResult 前仅删除与 change.kind/target 完全一致且无额外字段的 item.rule.relation；规范校验器不变。缺失/不一致关系、非法目标、范围冲突仍拒绝。自然语言及来源不修改，提示版本不变，旧客户端接收同一规范格式。 证据见 [验收](acceptance/repetition-evolution.md)。

## 候选来源变化审阅（2026-09-23）

source-review.ts 按本次 Job 快照选择范围，复用来源修订链映射到本地最新观察，返回变化集合/hash。renderer 展示原文与现文、确认当前集合；DefinitionRepository.publish 在事务内重算并拒绝过期确认，审计仅保留引用/hash。已发布基准历史依据、文件固定版本和外部未同步内容不参与本次对照。 详见 [规格](specs/source-review.md) 与 [验收](acceptance/source-review.md)。

## 2026-09-23：演进提示中的通用覆盖与限定条件

`evolution-prompt.mjs` 区分 scope 的长期适用与 condition 的限定谓词。DUPLICATE/REPLACES 适用范围不变时要求沿用基准 condition 的原值，包括不设置 condition；“所有/每次/无论输入”等覆盖描述留在正文。真正范围改变继续进入审阅，不在程序中用词表自动删条件或放宽 RULE_SCOPE_MISMATCH。

演进技能能力路径提示版本 v1.7，非技能路径 v1.5.1/v1.4.1；schema/capability 和客户端协议保持。新增真实响应冻结验收区分初始测试误报、真实条件校验失败与新模型复验成功。工作包是有效规则视图，验收工具使用其规则文本和 acceptanceChecks，不把导出视图再次当作完整历史规则图求值。

## 2026-09-23：固定资料的精确版本恢复

`material-recovery.ts` 按 definitionId 或 workId 从持久化定义/实例清单解析受管目标，renderer 只提交 target key、expectedHash 和用户选择的路径；不能指定任意写入位置。状态检查沿用 MaterialStore.verify。恢复核对完整文件 hash/size，技能核对整个清单、空目录和可执行位，再恢复同一目标；记录 MATERIAL_RESTORED 本地审计，不修改定义和实例清单。

MaterialStore.freeze 对相同 hash 的损坏副本使用临时文件校验后原子 rename；目录通过完整暂存、原目录备份、切换和异常回滚，完成后删除备份。写入路径必须属于受管目录，拒绝被替换为符号链接的目录/目标；所选技能仍不跟随内部符号链接。普通异常回滚有测试，未宣称目录双 rename 对断电也原子；中途断电仍可能留下备份并需重新选择恢复，当前包校验继续阻止错误使用。

恢复仅适用于已保存 hash 的版本；与更新内容、发布新版本和更换本次输入分开。客户端本地操作，无服务协议或模型变更。

## 2026-09-23：记录采集的持久化扫描检查点

WorkCore.sourceCheckpoint 通过 work/status、活动绑定及 `source_events(work_instance_id,row_id)` 索引读取最新追加位置，不加载消息正文、状态或历史交接。recording_checkpoints 保存 sample 的 source_row_id；它与外部 sequence、远端 view.sequence 分离，支持迟到或重复来源序号。

每轮先检查生命周期及授权到期，再比较追加位置。变化时仍使用完整有效关系投影；旧 view 已覆盖的消息不再重复尝试分片入队。新增 view、outbox 与检查点同事务写入；只有工具事件变化时，单独推进本地检查点。旧数据库无检查点时执行一次兼容扫描。view sequence 必须递增且不小于消息最大来源序号，不因迟到消息使用旧序号而遗漏视图。

失败的分片排队会保留旧检查点，重启幂等补齐；事务失败不提前推进 view 或检查点。新来源场景仍读取全量 WorkSnapshot，未宣称完全消除长记录扫描成本。客户端新增表/索引，无服务器协议或模型变更。

## 2026-09-23：实例文件固定与显式更新

`definitions/instance-files.ts` 管理 `materials/instances/<workId>/<hash>/<filename>`，与定义共享资料分离；`instance_inputs` JSON 增加可选 inputMaterials，referenceExamples 增加 material 清单，无表迁移。创建事务保存副本路径与 hash；失败创建清理该实例目录。`buildWorkPackage` 每次校验输入/参考副本，旧数据缺清单时明确阻止使用。

`instance-file-update.ts` 在 command 幂等事务中检查 OPEN 与 binding hash，固定用户重新选择的文件/按已有 hash 确认参考，追加 work.input_provided 修订并更新未手改的派生状态。旧来源、旧文件及交接快照不重写；所有该实例读取回执置空，旧兼容读取须晚于最新输入事件。界面 instanceFiles/updateInstanceFiles 接入同一仓库逻辑，未增加模型调用、自动文件监听或上传范围。

永久删除实例同时移除实例目录；更换文件保留旧副本供历史包追溯。副本只在本机可用，尚不解决远端执行者的跨机器文件传递。

## 2026-09-23：来源引用角色

请求以 evidenceSchemaVersion:1 声明客户端支持 SourceRef.role=CONTEXT；省略角色为直接依据。服务仅为声明支持的请求启用角色提示，所有来源与摘录仍验证，SOURCE 至少有一个直接引用，USER_STATED 直接引用必须是用户事件。客户端映射引用时保留角色，审阅区分背景与直接依据；无数据库迁移或新领域实体。同字段同类型的具体阻塞说明替代 mergeEvolution 的通用兜底，其他问题保持。详见 [来源角色](specs/evidence-roles.md)。

## 2026-09-23：本地持续比较队列

新增 continuous_evolution 表，仅保存每系列的明确授权、服务身份 hash、开启边界及触发去重/限额信息。桌面原有串行 tick 驱动，默认关闭；稳定合批、待审阻塞、持久化尝试防重与原增量发布游标分离。发送和远程任务操作均在连接恢复后核对目的地，提交前再核对授权与来源。没有后台协议、模型提示或服务器数据库变更。

## 2026-09-23：基于已确认版本的增量协调

`evolutionSources → prepare(baseDefinitionId) → 无本地路径/旧引用的有效基准 + 新来源 → 两阶段模型 → EvolutionResult → mergeEvolution → 差异草稿 → publish/EVOLUTION_CONFIRMED → 下一实例`。新增 `contracts/evolution.ts` 的运行时协议验证和 `definitions/evolution.ts` 的确定性合并，不迁移数据库。后台能力 `evolutionSchemaVersions:[1]` 显式协商，新版来源角色请求的增量提示为 v1.2，未声明角色支持的增量请求为 v1.1。

旧约定由程序完整保留，模型仅返回明确操作；重复在 review_events 追加依据，不写重复条目或相同内容的新版本。事件 ID/hash 在用户确认后记入账本，用于后续范围过滤与重启恢复。准备、提交和发布检查基准新旧；资料角色被替代时排除旧绑定，固定规范沿用验证过的 blob。来源删除对账本引用同步脱敏。renderer 默认只呈现差异，支持完整内容、重复/本次要求与补充依据原文查看。持续入口另由本地 ContinuousEvolution 队列触发，详见 [订阅与发送守卫](specs/continuous-contract-evolution.md)。详见 [增量比较](specs/contract-incremental-evolution.md)。

## 2026-09-23：可复现验收基线

`test/fixtures/contracts` 固定三份成功和两份失败的原始真实模型响应及请求，用 hash 验证不可变性。`npm run qa:contract` 在独立 Electron profile 和 SQLite 内回放三类完整桌面路径；回放核对输入与中间结果，不允许历史答案冒充新输入结果。语义失败保留为已知失败，不计入质量通过率。详见 [持续优化检查点](acceptance/worket-improvement-loop.md)。

## 2026-09-22：规则协调与固定规范条款

`DistillationService.prepare → file role + immutable source snapshot → server/workflow → DefinitionDraft → publish/pinRuleDocuments → WorkDefinition version → instance inputs/overrides → resolveRuleDocuments → WorkPackage/MCP/copy → acceptanceChecks`。

`contracts/rules.ts` 定义作用域、采纳状态、条件、重复/补充/替代/冲突关系与条款版本。规则地址使用 `collection.key`，避免不同字段同名误合并。模型负责语义判断；程序验证引用、范围一致性、无循环和有效保留目标，先解析重复组再解析替代，计算一份有效规则；替代任一别名作用于全组，竞争替代阻断。旧规则来源保留在历史中，不合并进含义已改变的新规则依据。无新领域实体或数据库迁移，新增信息保存在现有 JSON 契约中。旧定义缺少 rule 时沿用旧行为。

`definitions/document-rules.ts` 只从已授权且标为 NORMATIVE 的正文快照固定条款；文件 hash、行区间与 SourceRef 共同定位。完整正文按 hash 共用不可变 blob，执行时仅展开所选条款，不附加“遵循整份旧文件”覆盖新规则。资料缺失或校验失败时阻止执行包导出。来源名/位置用于追溯，不作为规则身份或跨机器依赖。

`definitions/document-revision.ts` 预览新文本，采用时重验预览 hash 与草稿 revision；保存新来源快照并更新指定条款，通过统一 update 路径触发依赖再审。发布创建新定义版本。`definitions/rule-review.ts` 从手改/条款版本变更沿关系图追踪直接与间接依赖；固定问题 ID，撤销失效确认，关联条目退回 PROPOSED。保存后 renderer 刷新待定映射；新问题须解决后才能发布。修改条款文字会解除其文件正文绑定，避免导出时把用户修改覆盖回旧原文。

`effectiveRules` 用于创建实例及所有工作包出口；本次覆盖存入 `instance_inputs`，不改 Definition。`acceptanceChecks` 将被合并的验收项指向保留规则；新版定义没有独立验收文字时，从有效交付与约束生成引用式清单。旧定义仍要求原有显式验收项。验收结果不因文字去重而被跳过。

新客户端请求携带 `ruleSchemaVersion:1`，后台 capabilities 声明 `ruleSchemaVersions:[1]`。未声明支持的旧后台会在提交前被新客户端拒绝；旧客户端请求仍使用 v1.4 提示，不接收需要新版程序解释的候选范围。v2.0 聚合阶段保留原始正文、说话人和文件角色，仍受 96 KB 聚合预算约束，超限明确失败，不静默截断。模型语义错误不会被结构校验完全发现，仍须保留草稿审阅与真实任务评测。

> 2026-09-16：`adapters/zcode` 只读 tasks-index 与 CLI SQLite，使用消息/片段 ID 规范化历史，排除隐藏消息、reasoning 与未完成回复。通过默认注册表进入通用记录路径；`manual-delivery` 只复制带 workId/deliveryId 的启动指令并打开应用，回执仍为 pending。用户配置合并保留已有 MCP 和 Hook，接入脚本只向本机通知会话身份与交付标识。当前聊天无法可靠定位时明确选择。

> 同日：`adapters/antigravity` 以只读 summary 库发现本机顶层会话，从官方 Hook 使用的 transcript.jsonl 读取已完成事件，按 step_index 去重并保留截断提示；摘要不替代正文。`ConversationUpdated` 通知仅在已有记录或该执行者存在待确认交付时才读取正文，用用户消息开头的 workId/deliveryId 核验交付；异步读取结束后重查绑定，迟到、取消和重复通知不能误绑。普通增量沿用后台轮询。安装配置使用可执行 Node 的绝对路径，支持空配置、原子替换及重复安装，保留既有服务器、Hook 与禁用偏好。

待讨论的“工作授权与可替换执行者”方向见 [BP 素材 B001](bp/benefits-and-insights.md#b001--工作授权与可替换执行者)。该条目尚未形成架构决策或实现，不改变当前授权与交接规则。

> 2026-09-09：记录、历史选择、同步、恢复、交接与定义复用已通过执行者注册表路由。具体应用协议在适配器内；接口与验证见 [执行者接入方案](specs/executor-adapters-v1.md)。

> 本文主体描述当前实现。沉淀、复用与 2026-09-09 增补的授权改进采集已实现，见末尾实现章节及 [Spec v1](specs/work-distillation-v1.md)。新功能的模型凭据、云端处理、固定资料及定义版本规则以 Spec 为准；现有采集与交接行为不因文档更新而改变。

## Module architecture

```text
Pet / Panel → generic IPC → AppService → Work Core → SQLite
                              │            ├── WorkStateExtractor
                              │            └── ArtifactTracker
                              ▼
                       ExecutorRegistry
                         ├── Codex Adapter → App Server / Hook / native new-chat URL
                         ├── WorkBuddy Adapter → read-only extension socket / Hook / Deep Link
                         └── future adapters
MCP → Work Core work package + read audit
```

注册表装配点为 `src/executors/defaults.ts`。`types.ts` 定义来源读取、当前会话解析、接入安装、可用性检查与交付回执。来源以 `(executorId, conversationId)` 唯一识别；渲染层只使用通用元数据与能力，不写应用名分支。原生前台 Helper 的受支持 bundle ID 通过注册表参数传入。

### Work Core

唯一拥有领域规则的深 Module。其 Interface 负责创建、更新、分割、完成、恢复、归档、删除和交接 WorkInstance。Codex 与 WorkBuddy 的具体数据格式不得进入该 Interface。

核心对象：

- `WorkDefinition`：工作的本体定义和固定版本；包括记录型定义与已确认的可复用定义版本；
- `WorkInstance`：一次真实工作；
- `WorkRecord`：WorkInstance 的持久事实；
- `WorkState`：八部分结构化当前状态；
- `Executor`：HUMAN、AGENT、TOOL 或 SAAS；
- `ExecutionEnvironment`：Codex Desktop、WorkBuddy Desktop 等应用环境；
- `ExecutionEpisode`：某个 Executor 在某个环境中执行一段工作的记录；
- `CaptureBinding`：外部对话与 WorkInstance 的绑定；
- `ArtifactRef`：对原始资料与产物的轻量引用；
- `HandoffPackage`：面向目标 Executor 的交接投影。

### 多阶段交接快照（MCP v3）

`src/handoff/continuation.ts` 的 `ContinuationService.prepareContinuation(workId)` 是阶段整理的唯一入口。它读取已同步的 WorkSnapshot、当前有效 SourceEvent、WorkState 与固定/输入材料版本，排除成功的 `get_work_context` 自生审计事件后计算来源、状态和材料摘要。模型调用由 `WorkPreparation` 在显式记录或交接动作确定的范围内提供，统一通过 Worket 托管客户端；历史记录的被动读取不启用模型处理。

模型只产出带来源引用的候选结构；服务校验引用/摘录、事件覆盖、状态、要求替代、证据角色、材料版本和依赖无环，并在提交交接前重读 basis。候选失效时返回 UNRESOLVED 和 v2 回退；来源输入超限则标为 PARTIAL。`WorkCore.createHandoffPackage` 将通过校验的快照写入现有不可变 handoff payload，不新增阶段表或 WorkState 字段。

`get_work_context(context_version=3)` 在当前来源及材料刷新后异步准备快照，并只投影当前阶段、首个阶段内动作、完成前序阶段、仍待执行阶段及要求范围；阶段快照未解析时附 v2 和最新用户消息。v1/v2 调用保留原契约，旧启动指令默认仍请求 v2；AppService 的新交接启动请求 v3。执行阶段和成果接受状态分离，MCP 读取回执仍以原交付机制记账。

### Desktop Pet Interface

面板将品牌与 Tab 放入同一个 sticky header。应用服务通过 `executors/project-label.ts` 生成会话的 `projectLabel` 展示字段，最近活动和历史选择共用；原始 `cwd` 保留用于记录与交接。

采集状态从 OPEN 工作的活动绑定推导：真实会话为 recording，`pending:<deliveryId>` 为 waiting，无活动绑定为 stopped。复用工作还需 MCP 工作包读取证据。旧版 `waiting:` 记录保留历史状态，不再用于新会话授权。PetView 与 Dashboard 使用相同全局状态，真实记录优先于等待确认。

桌宠明确解析当前会话后提供记录或打开入口；无法解析则打开执行者会话选择，不猜 WorkBuddy 最新会话。面板负责多来源发现、历史分页、工作状态、交接、完成和归档。原始窗口标题只用于匹配；来源接口提供的应用标题保存为 `conversation.title`，首条消息不冒充标题。未命名会话可显式选择。

保留原有桌宠拖动、位置持久化、75% 缩放、Dock 和单实例恢复。内部 workpet 标识、用户数据目录与 bundle ID 不迁移。

### Foreground Context Detector

macOS Helper 返回应用身份和可用窗口标题。只有前台 PID 为 Worket 自身时才向后寻找注册表列出的工作窗口。具体标题后缀处理和解析属于适配器：Codex 保留唯一标题匹配及无标题容器的唯一近期活动规则；WorkBuddy 无法读取准确当前会话时返回需要选择。第三方执行者不需要修改原生 Helper。

### Codex Adapter

App Server 提供列表与可见历史；history.ts 先核验会话元数据，再升序读取回合和必要的消息页，全部成功后才归一化。显式不支持分页方法才回退旧全量接口，摘要、游标循环、跨页冲突或超限整次失败。共享连接初始化，单请求超时 30 秒。详见 [历史完整读取](specs/codex-history-completeness.md)。Hook 仅触发已绑定来源同步或确认本次交付。交付使用官方 `codex://new?prompt=...&path=...` 打开预填新聊天，用户在 Codex 确认发送，不由 Worket 启动独立模型执行进程。用户级 Worket MCP 提供工作包读取。

### WorkBuddy Adapter

5.5.3 内部扩展安装在 `~/.workbuddy/extensions/worket-capture`，声明 onStartup 与 resident，避免空闲回收后失去读取入口。仅授权 conversations.list/get/requestEntries/requests，通过同用户 0600 Unix socket 提供 list/read/status。历史加载等待 historyReady，分页完整读取并去重；不完整分页失败，不把部分历史当完整导入。

归一化仅接受可见 text、tool 与资料引用，丢弃 reasoning/未知块；回复完成后入库，避免流式首个片段永久占用事件 ID。内部协议不是外部兼容承诺，升级不兼容时应显示接入错误。

用户级 Hook 通知会话身份与变化，Deep Link 创建目标任务。安装逻辑位于各适配器的 install.ts，通用 IntegrationInstaller 分别调用；失败不阻止 Worket 窗口或其他执行者。打包资源通过 asar.unpacked 提供普通文件路径；升级扩展后需要重启 WorkBuddy。

### 通用交付

交付前刷新源状态并核验资料；生成不可变工作包和 deliveryId，结束旧绑定并建立 pending 目标执行片段。短启动指令包含 WORKPET 工作标记、DELIVERY 本次交付标记及 MCP 读取指令，完整包留在 Worket。

Hook 只在工作 OPEN、目标执行者和两个标记均匹配时确认真实 session；重复点击和已待确认的交付不得重复打开目标。失败补偿恢复原来源；取消需要确认未接手，恢复前一真实绑定。旧标记不能绑定下一轮交付。恢复工作使用最后一个真实执行者。切换不取消外部应用已经执行的任务。

MCP 成功读取审计使用当前 Binding、Episode 与环境；work_package_receipts 将读取归属到 deliveryId/Binding，Hook 与读取可乱序到达。仅查看不确认，新交付不继承旧读取；恢复原实际会话可恢复原证据。标识用于关联，不是调用者身份认证。详见 [交接回执](specs/delivery-receipts.md)。工作包读取和目标会话确认是分开的证据。通用服务每轮同步全部真实活动绑定；异步读取完成后重新检查生命周期和 binding ID，避免旧来源写入新执行片段。事件序号跨执行片段递增。source-delta.ts 以实际会话中的原始 ID 比较内容，修订追加观察并关联前版；source-revisions.ts 分离不可变档案与保持逻辑顺序的有效视图。WorkState 隐去旧自动派生项，提炼范围和持续比较只用有效事件；人工改动保留，失败后按游标补算。MCP 历史提供 currentEventIds，拆分点映射回原应用 ID。详见 [来源修订](specs/source-revisions.md)。source-presence.ts 只接受适配器明确的完整性证明，第一次追加 source.check，第二次相同完整观察追加 source.absent；错误/不完整/重启重置连续确认。待复核阻止新工作包和提炼，缺失从当前视图排除，原文及确认定义不变。显式起点由 scopeStartExternalId 约束，缺失不扩采。详见 [来源缺失与恢复](specs/source-presence.md)。

### WorkStateExtractor

隐藏具体模型实现的 seam。输入为上一版 Work State 与新增 Source Event，输出八部分 Work State 变更。当前 UI 只读展示结果；为兼容早期数据库，它仍不得覆盖历史 `USER_EDITED` 内容或重新创建已有 tombstone 的内容。

### ArtifactTracker 与 ArtifactResolver

`ArtifactTracker` 统一负责编排 Codex 与 WorkBuddy 的资料挂接和使用前复核，避免两个 Adapter 产生不同语义；`ArtifactResolver` 隐藏具体文件存储策略。MVP 只维护原路径与元数据，并在主动刷新或交接时校验 Hash 和可用性。发生变化时写入新的 ArtifactRef 版本与 `artifact.changed` 来源事件。Work Core 不依赖未来是否加入副本或版本存储。因此同一路径可能保留多条引用，只有最新一条描述文件当前状态。沉淀范围按路径只取最新引用；已清理或缺内容的文件以「仅文件信息」参与快照，使用引用自身的 hash 而非空 hash；只有用户勾选分析其内容时才要求文件可读。

### 技能目录依赖

`materialRoles.kind=SKILL` 区分技能与普通资料；模型协议按 skillSchemaVersion 启用，并在提交前协商服务能力。`skill-materials.ts` 固定显式选择的完整目录、清单 hash 与可执行位，拒绝符号链接/超限；Material.bundle 复用定义材料引用和删除生命周期。`WorkPackage.skills` 提供固定入口与配套清单，普通 fixedMaterials 排除技能目录。目录外依赖不自动发现或执行。详见 [技能依赖](specs/skill-dependencies.md)。

### Local Persistence

只在本机持久化 WorkDefinition、WorkInstance、WorkRecord、Source Archive、Work State 版本、Capture Binding、ExecutionEpisode、Handoff Package、ArtifactRef、同步游标，以及早期版本可能已有的 tombstone。实现阶段优先选择单机事务数据库；MVP 不需要云数据库。Handoff Package 是不可变快照；每次 MCP get_work_context 调用从当前 WorkSnapshot 生成新的快照，重新运行 buildWorkPackage 校验固定资料和本次文件输入，通过后才记成功读取；不会复用历史包跳过校验或改写历史包；目标应用启动失败时，来源 Binding 与 Episode 在同一补偿流程中恢复。

交接上下文 v2（实现待验证）：`get_work_context(context_version=2)` 在既有当前快照与资料校验后生成目标/进度/成果/条件/候选动作投影，嵌套 WorkPackage 移除重复的 state/nextStep，且不返回 Episode/Binding 列表；推断 facts 不进入主包，仍保留证据 ID 并可按需读取，用户陈述/编辑 facts 保留。`get_work_evidence` 支持事件 ID 或最多 100 条的序号分页，排除 reasoning.summary。省略版本仍返回旧结构。历史 HandoffPackage 按原格式持久化且不改写，读取回执语义不变。投影只反映已记录字段，不推断语义断点；接续正确性、真实调用总量与用户纠正成本仍待真实接手小样验证。详见 [交接上下文方案](specs/handoff-context-v1.md)。

2026-09-23 多阶段接续实现：增加 ContinuationService 与 MCP v3 阶段快照，沿既有 handoff JSON 保存，不增数据库实体；候选带来源校验，冻结 basis 后二次核验，失败明确回退。隔离 HTTP MCP E2E 已通过；真实模型质量与实际执行仍待验证。详见 [阶段接续方案及结果](specs/handoff-stages-v1.md)。

## Data flow

### 创建记录

```text
用户聚焦 Codex / WorkBuddy
  → PetView 只读识别前台应用和应用生成的会话标题
  → 用户悬浮桌宠并点击展开的便利贴
  → Foreground Context Detector 重新确认前台应用
  → 适配器解析会话，不能确定时由用户选择
  → 统一来源接口读取完整可见历史
  → Work Core 创建 WorkInstance / WorkRecord / Episode
  → 来源会话标题作为 conversation.title 与历史一同落盘
  → conversation.title 生成可追溯的只读目标
  → WorkStateExtractor 生成八部分 Work State
```

### 增量记录

```text
Codex 或 WorkBuddy 产生新事件
  → 对应 Adapter 转换为统一 Source Event
  → Source Archive 增量落盘并推进同步游标
  → 不自动调用模型
  → 用户查看、刷新或交接时按需更新 Work State
```

### 跨应用接力

```text
用户点击“交接”并选择执行者
  → Work Core 更新 Work State
  → HandoffCoordinator 生成 Handoff Package
  → 适配器打开目标新会话，提交工作与本次交付 marker
  → 首条指令携带 WorkInstance ID
  → 目标执行者通过 MCP 读取 Work State 与当前资料
  → 确认目标 CaptureBinding / ExecutionEpisode
  → 后续事件继续写回同一个 WorkRecord
```

多阶段交接在刷新来源与资料后增加准备链，不改变 WorkInstance 或 Executor 状态机：

```text
handoff / get_work_context v3
  → ContinuationService 冻结来源、状态、材料 basis
  → 已许可的语义整理（否则明确 unresolved）
  → 结构、引用、依赖与版本校验
  → 重读并比对 basis
  → HandoffPackage.payload_json 保存不可变快照
  → v3 投影当前阶段及必要前序成果；完整证据按需读取
```

## Status flow

### WorkInstance

ContinuationSnapshot 的 `RESOLVED / PARTIAL / UNRESOLVED` 是一次交接理解的解析状态，不是 WorkInstance 生命周期状态；阶段 `execution` 与产物 `acceptance` 分开表示，不会自动完成 WorkInstance。

```text
OPEN ──用户完成──> COMPLETED
  │                    │
  └──用户归档──> ARCHIVED
                       │
COMPLETED ──继续原工作──> OPEN
```

时间间隔、应用关闭、Mac 重启和 Executor 变化都不改变 WorkInstance 状态。取消记录通过 `cancelRecording` / `work:cancel-recording` 撤销记录授权并清理本地副本，需要二次确认，不新增生命周期状态。底层 `deleteWorkPermanently` 仅负责 Worket 本地数据清理；执行者接口不提供原对话删除能力。清理关联证据时按显式主键 `id` 更新，避免 Electron SQLite 的隐式行标识返回差异。

### ExecutionEpisode

```text
ACTIVE ──交接/完成/解除绑定──> ENDED
```

交接会结束或保留来源 Episode 的历史，并创建目标环境的新 Episode；它不会创建新的 WorkInstance。

### CaptureBinding

```text
ACTIVE ──完成/用户解除──> INACTIVE
INACTIVE ──继续原工作──> ACTIVE
```

## 不可违反的约束

- 核心领域模型不得依赖 Codex、WorkBuddy 或模型供应商字段；
- Source Archive 与 Work State 必须分层保存；
- 每条结构化信息必须保存 origin 与 sourceMessageIds；
- 早期版本已有的 `USER_EDITED` 和 tombstone 不得被模型覆盖，新版 UI 不得新增二者；
- Handoff 主 Prompt 不默认包含完整 Source Archive；
- WorkBuddy 首次接手必须使用全新对话；
- WorkBuddy 用户级 Hook 必须先校验 marker 与 OPEN binding，未绑定会话不得落盘；
- 取消记录不得波及用户原始文件和外部应用对话；
- 未来若增加 WorkPattern，须与 WorkDefinition 明确区分；本次沉淀使用 WorkDefinition，不新增同义模板或模式实体，不反向修改历史 WorkRecord。

## MVP 后扩展 seam

- 新 Agent 应用：新增 Adapter，不修改 Work Core；
- 本地模型：新增 WorkStateExtractor Adapter；
- 文件快照：下一阶段为定义固定资料增加独立本地副本存储，不扩展成全文件历史；
- 工作沉淀：从用户主动选择的一条或多条记录生成 DefinitionDraft，确认后保存 WorkDefinition 固定版本；WorkPattern 暂不实现；
- 云同步：作为本地记录之外的显式能力，不改变本地优先原则。

### 多工作发现与持续记录

`recording-sources.ts → codex:list / codex:history → AppService → CodexAppServerClient.thread/list` 提供轻量来源目录。目录按会话 ID 附带已有 workId；发现来源不创建 WorkInstance。历史接口沿用 App Server nextCursor 分页；最近活动按 updatedAt 排序展示最近五个来源中未记录的聊天，不因长任务超过五分钟而隐藏入口，不依赖独立 App Server 的 notLoaded 状态，也不依赖前台唯一匹配。用户逐项点击后复用 work:create-from-codex，重复选择打开原工作。

主进程在启动后持续调用 syncRecordedCodexWorks，只同步 OPEN 且当前 ACTIVE Binding 为 Codex 的工作，各来源独立失败重试；串行周期避免定时任务重叠。Hook 仍即时补采，事件 externalId 保证幂等。异步读取返回后重查 Binding，完成、删除或交接期间不得把旧来源追加到新执行片段。面板可见时每五秒分别刷新来源和已有记录；来源读取失败不阻止已有记录显示。历史加载和导入错误在原入口显示，可直接重试。

来源目录的 agentName 由 Adapter 在 AppService 中声明，当前 Codex 来源固定为 Codex，不从项目目录或标题猜测。WorkSummaryView 的 agentName 来自活动 ExecutionEpisode，结束后取最后片段。waiting 领域状态保持原义，展示层统一转为“等待发送消息”，面板列表和详情共用 CAPTURE_WAITING_GUIDANCE，桌宠提示发送消息；样式与 recording 区分。

面板以 PanelTab（RECENT 或 WorkStatus）控制两个互斥 tabpanel：sources-panel 只负责来源选择，works-panel 展示当前生命周期的列表、通知和详情。Tab 是 UI 状态，不引入新的工作生命周期；刷新保留 Tab，用户执行记录或生命周期操作后跟随目标工作状态。

### 桌宠自由移动

桌宠 pointer capture 区分点击与拖动，经 preload 的 pet:drag IPC 通知主进程。主进程校验发送窗口，校验事件携带的有限桌面坐标，使用按下点与当前点的坐标差移动 BrowserWindow，拖动期间禁用鼠标穿透。desktop/pet-layout.ts 提供吸附阈值、尺寸及纯几何计算；desktop/pet-position.ts 的 PetPosition 统一负责拖动、贴边状态、工作区边界与本地 pet-position.json 的保存恢复；该偏好不进入工作记录。显示器变更触发可见性修正。

窗口 closed 事件清空引用；退出期间以及窗口已销毁时，activate / second-instance 不再调用窗口方法，避免 Object has been destroyed。

角色尺寸由 .pet 的 zoom: .75 统一控制，布局与命中区域同步缩放，内部动画继续使用原有 transform；透明窗口保留气泡和阴影所需空间。

2026-09-24 外形探索仅位于 `codex/pet-appearance-exploration` 分支的 `research/prototypes/pet-appearance/`。用户否定五种扩散方案后，默认入口改为 `refinement.html`，使用透明拟物 PNG 图集与 SVG 裁切视窗展示普通 / 有芽、自由 / 贴边姿态；旧五方案保留在 `/exploration` 供追溯。只读本机服务仍直接读取当前 `pet.html` / `pet.css` 作原版对照。预览按 alpha 边界选取坐标，在主体约 78px、侧边 32 × 68 / 上下 68 × 32 下验证几何，不加载生产 pet.js、不调用 IPC 或模型、不持久化产品偏好。生成图保留了材质与形象方向，但不保证不同姿态主体逐像素相同；四向旋转还未完成独立光照素材、原生窗口、拖动和性能验收。现有打包规则排除 `research/`；真实接入仍应复用 PetView、PetPlacement 和 createPetMotion。

同日全状态原型：`clay-pet.js` 集中八种状态、四种更新表现及测量后的裁切坐标，`refinement.js` 负责选择和重播。清醒眼睛来自新生成图集，但仅通过眼部 clipPath 叠加到原 v1 / v2 底图，避免更换整图导致主体、小芽、便利贴和爪尖漂移。状态点、沉淀线条和更新提示作为 SVG 局部层，CSS 负责小幅或有限次数动效；四向通过固定 32 × 68 基坐标旋转，状态符号反向旋转以保持可读。睡眠不叠加睁眼层，贴边不执行主体位移，暂停和 reduced-motion 控制局部动画。八种状态源于 `PetState` 与 `DistillationActivity`，更新表现与之正交；当前 AppUpdateManager 没有向 PetView 发布这些更新状态，原型不扩展真实业务契约。

## 沉淀与复用（已开发，真实验收待完成）

“沉淀”取代此前将复用能力混入归档的方向。沉淀产生定义对象；ARCHIVED 仍属于原工作生命周期，历史记录保留，主要入口调整为定义视图，归档退到次级区域。

### Module relationship

```text
Desktop UI → DistillationService → DefinitionRepository / Work Core → Local SQLite
                    │                        │
                    │                        └→ DefinitionMaterialStore
                    ▼
              WorketAIClient → Worket AI Service → ModelProvider

Work Core → WorkPackageBuilder → WorkBuddy Adapter / Markdown + JSON 导出
```

WorkDefinitionExtractor 与现有 WorkStateExtractor 独立：前者只在用户主动沉淀时工作，后者描述当前实例状态。它们可共用模型服务基础设施，不能因整理状态自动创建定义。

Worket AI Service 负责固定的提取、比较、泛化与校验流程，不提供 shell、任意文件读取或通用自主 Agent。供应商 Key 仅在服务端；工作库、定义权威版本和正式实例状态保存在本地。后台采用经用户授权的材料暂存和无正文的运行/用量记录，身份、幂等与限额为公开服务必要边界。

### 抽取评测 module（2026-09-21）

`evals/extraction/runner.mjs` 的外部 interface 是配置、case manifest 和一个 adapter；环境冻结、授权 fingerprint、不可覆盖 run/trial、预算预留及失败落账藏在实现内。现有产品路径在 seam 处提供三个 adapter：WorkState 本地/云端 adapter、Definition 托管 adapter，以及仅用于结构回归的 mock adapter。一个 case 在进入 adapter 前移除期望断言、禁止推断和变形答案；grader 是运行后的独立 module，不能参与模型请求。

```text
case manifest → policy/freeze → runner → product adapter → raw trial
                         │                         │
                         │                         ├→ isolated Work Core → Handoff Package
                         │                         └→ Worket AI Service → Definition result
                         └→ approval fingerprint

source case JSONL + review draft → local H1 review HTML → immutable approved gold

approved gold + sealed real trial → model proposal → local risk review HTML → final adjudication

sealed raw trial + approved gold + final adjudication → grader → metrics/report
```

授权 Codex 对话通过独立 importer 进入 manifest：只接受显式工作区内的根对话，合并同一 thread 的续聊文件并投影为 Worket 原生 `user.prompt / agent.response`。Codex 交互式问题回复包装会拆回助手问题与用户答案，避免把问题文本误标为用户约束。curation plan 再登记 `split`、共享项目/模板 `group_id` 与盲法状态；同组跨 split 会被阻断。真实来源还必须在冻结配置中声明 `allowed_splits`，因此校准运行不能因 case 列表误配而读取试点保留集。

状态从 `READY` 进入不可覆盖 run；每个 trial 为 `SUCCEEDED`、`FAILED` 或 `BLOCKED`，整体成功后仍停在 `AWAITING_HUMAN_REVIEW / NOT_JUDGED`，不能由 JSON 合法或 mock 成功跳到语义通过。retry 创建新 run 并保存 `retry_of`。`runs/` 含原始输出与匿名接入凭据，默认不入 Git；正式产品状态和用户工作库不在评测写入范围内。

provider 调用上限由 runner 按 trial 预留。当前托管接口不返回 token、失败前实际调用数或账单金额，因此这些值为 `null`，不能由配置中的声明额度推断为实际消耗。详细运行证据见 [抽取评测验收](acceptance/extraction-evaluation-v1.md)。

H1 使用 `evals/extraction/review-server.mjs` 提供的本机 HTML。server 显式接收 source/draft/output 三个工作区内路径：source 只读，draft 原子替换，最终 output 独占创建且不可覆盖。页面自动投影任意 source case、可见消息和独立草稿，不依赖本轮 VideoCreator 硬编码；最终保存会验证案例/单位状态、受控枚举、同案 event ID、原文精确摘录、评分分母与人工签名。删除或已替代单位固定退出当前评分分母。真实内容和人工结果继续位于被忽略的 `runs/`，静态 HTML/校验器/测试进入仓库。

评审 UI 将稳定枚举翻译为面向决策的问题：`required` 是“本轮要求模型识别吗”，`criticality` 是“模型漏掉它会怎样”，`destinations` 是“识别后应该保存到哪里”。映射只存在于浏览器显示层，保存与 grader 继续使用原枚举，避免文案调整改变评分合同。

单条评审采用渐进披露状态：`UNREVIEWED` 先只读展示 `semantic_content` 与自动分类摘要；确认正确直接转为 `KEEP/CONFIRMED` 并定位下一条；选择不正确才打开可编辑字段、证据和最终动作。全部单位离开 `UNREVIEWED` 后 case 自动转为 `REVIEWED`。这个状态只影响浏览器交互，最终 server 校验仍是唯一写入门禁。

真实输出裁定使用 `evals/extraction/adjudication-server.mjs`。server 从已确认 gold、不可覆盖 run、模型 proposal 和独立 draft 构造确认状态；每条必需 Gold 覆盖与模型标记为非 `USEFUL` 的输出进入人工队列，`USEFUL` 输出在最终文件中固定标记为 `MODEL_ONLY`。最终保存要求队列全部离开 `PENDING`、评审人签名一致，并以独占创建写入完整 proposal 与人工修正；页面和校验逻辑均不硬编码 VideoCreator 案例。

`grader.mjs` 同时接受旧版全量人工裁定和 `HUMAN_RISK_REVIEWED` 文档。风险确认格式只把逐项人工确认的 Gold 覆盖发布为正式召回；正向 `USEFUL` 输出仍为 `MODEL_ONLY` 时，正式精确率、噪音率和不支持率保持 `null`，另行输出诊断估计与已确认噪音下限。这样可以自动生成阶段性结论，又不会把模型自评升级为人工证据。

### Data flow

```text
用户点击沉淀 → 本地快照 → 直接开始后台沉淀
    → Worket 后台模型抽象 → 候选定义与问题
    → 用户检查修改 → 固定定义版本与固定资料副本
    → 本次新输入 → 新 WorkInstance → 工作包 → 外部执行 → 用户验收
```

新实例创建必须与外部对话绑定分开。现有 createWork 的导入路径保留；新增 createWorkFromDefinition 可创建尚无 CaptureBinding 的工作。交接继续原 workId，复用创建新 workId。

### Status flow

沉淀任务、候选编辑与 WorkInstance 生命周期分别保存。沉淀任务从 PREPARED 经 RUNNING、AWAITING_REVIEW 到 SAVED；无关多选进入 NEEDS_SELECTION，失败和取消有独立状态。“已沉淀”查询定义集合，不新增 WorkStatus，也不将旧 ARCHIVED 数据解释为定义。

work_definitions 现有一行对应一个 key/version 的形式继续作为固定版本存储，扩展定义内容与确认来源；general-work 保持旧语义。模型结果先进入草稿，用户确认后才发布，运行中的实例固定引用原版本。详细契约、迁移、错误与验收见 [Spec](specs/work-distillation-v1.md)。

### 本次代码与持久化

`src/contracts/definition.ts` 为运行时内容/引用/覆盖契约；`src/distillation/service.ts` 固定来源、驱动异步请求并在后台轮询，模型不在 SQLite 事务内运行。`src/definitions/repository.ts` 与 Work Core 共用连接，保存候选 revision、用户审阅、定义版本、输入和命令幂等结果。`storage.ts` 写临时文件后校验并原子落位固定副本。

`server/workflow.mjs` 仅串行调用 Provider 做分块提取和聚合；`server/service.mjs` 负责主体验证、预占调用额度、元数据以及短时结果。服务器源码排除在桌面发布包外。客户端 `WorketAIClient` 只发请求内 source key、顺序、文本和显式附件范围，safeStorage 保护 Worket 访问令牌。管理员签发的 RS256 身份与撤销由 managed service 提供；公开用户自助登录与 HTTPS 部署仍待接入。

`createWorkFromDefinition` 在单个事务里创建无执行片段/无绑定的新工作，写入本地采用定义与输入事件。`pending_dispatches` 表达交付意图；实际启动交接创建 pending ExecutionEpisode/CaptureBinding，真实 Hook 到达后确认会话。MCP 读取以本次 deliveryId 独立记证。`WorkPackageBuilder` 保留旧 Handoff 字段，以 `workPackage.packageVersion=1` 扩展 START/CONTINUE、固定定义、本次输入与本地资料。

数据库 `user_version=2` 升级前保存 `.before-distillation-v1.bak`。旧实例及 GENERAL 定义不改身份。未来更高版本的库被本应用拒绝；真实采集绑定表迁至 `capture_bindings_v2`，原表名保留升级屏障，使基线旧二进制初始化失败，回滚必须恢复备份。取消记录时一并移除工具管理的迁移备份，避免备份保留已删正文。取消和发布在本地事务串行裁决；删除来源还清理快照文件文本、来源摘录与失效草稿，并排队取消远端。

验证证据和未通过项见 [沉淀验收记录](acceptance/work-distillation-v1.md)。

### 可配置后台

`server/start.mjs → createManagedService → AdminStore + createAdminHandler + createAIService` 在同一个本机监听端口提供管理页面与模型服务。`build:server` 单独编译共享契约和存储序列化代码，服务器启动不依赖 Electron。旧环境变量部署入口保留为 `server/start-env.mjs`。

管理页模型与额度共用 `config-form` 和 `PUT /admin/api/config`；两个卡片各提供提交按钮，额度卡片就近显示修改、保存和失败状态。保存与连接测试共用按钮禁用控制，保持现有 revision、CSRF 和完整配置校验。

本机管理员密码最少 6 位；`/admin/` 页面通过密码会话及 CSRF 访问管理 API；管理入口校验 loopback 地址、Host、Origin 和转发来源头。`AdminStore` 原子保存配置、scrypt 密码哈希与接入元数据，供应商 Key 经 AES-256-GCM 加密。密钥与配置在同一私有目录，保护边界是系统账户权限，不能宣称系统账户失守后仍安全。

模型配置从未配置变为已配置；测试连接使用未保存表单和固定文本，单次调用不自动保存。保存用 revision 拒绝旧页面覆盖，并在没有运行中请求或连接测试时热更新 Provider 和限额。后台签发有期限的 RS256 令牌，客户端仅获取一次；运行服务每次验证已登记主体及撤销状态，接收完整上传后再次复核，避免撤销期间的迟到请求启动模型。撤销会取消任务并清理内存结果。

`settings.json`、签名私钥和加密主密钥共同构成可恢复配置；`metadata.sqlite` 继续仅保存请求和用量元数据。管理会话只存内存，重启后需重新登录，客户端身份有效期内可继续使用。默认 `.worket-server/` 不进入 Git 或桌面包。部署为单实例、代理仅开放 HTTPS 的 `/v1/` 和健康检查，服务器管理通过 SSH 隧道访问。

### 产品改进数据链（2026-09-09 已实现）

`Worket AI Service` 的分析输入和结果缓存保持内存暂存；新增 `ImprovementCollector` 与 `ImprovementStore` 形成独立采集链：客户端确认范围和改进用途授权 → 提交固定材料 → 关联模型候选及版本 → 追加用户实际修订和确认 → 经新范围授权关联复用反馈 → 管理员评审。真实效果评测留待下一阶段。

工作库与正式定义仍以客户端为权威；后台保存用于改进 Worket 的授权样本，不接管原工作的正式状态。改进样本、任务结果缓存、运行元数据使用独立生命周期：ack 清理任务结果缓存，样本由其授权、留存和删除规则管理。旧版 `worket-data-v1` 只表示模型处理授权，不能自动开启正文留存。

`src/contracts/improvement.ts` 集中定义协议与 90 天期限；`server/improvement.mjs` 在独立私有 `improvement.sqlite` 保存授权、事件、评审及接收开关，正文不会进入 `metadata.sqlite`。样本键从认证主体和客户端样本 ID 推导；同事件 ID 重传幂等，正文变化拒绝。客户端只可提交或删除自己的样本，读取正文与写评审须后台会话及 CSRF。Provider 无样本库查询权限，上传接口与模型配置、调用和 ack 无依赖。

`recordingView()` 从本地不可变档案生成只含可上传消息内部 ID 的完整视图，schemaVersion:2 / RECORDING_VIEW；整份记录队列先协商 recordingViewSchemaVersions。后台 projectRecordingSample 合并分片并校验视图覆盖、状态与修订顺序，当前列表保持逻辑会话顺序；旧数据或不完整关系不标为 ready。管理员优先显示当前原文，历史和原始事件折叠。当前上传为 schemaVersion:3，recording_views 基线与 outbox 增量同事务推进；后台按 baseSequence 重建，缺链不 ready。sample_usage 事务维护 UTF-8 字节预算，旧样本惰性回填、删除清理。详见 [样本视图](specs/recording-sample-view.md) 与 [长记录同步](specs/recording-sample-scale.md)。

`ImprovementCollector` 在工作库中维护明确授权的 subscriptions 与 outbox，以及单行 `improvement_preferences` 持久偏好（缺省开启）；桌面通过 `improvementPreference` / `setImprovementPreference` 读取和修改。取消勾选或停止全部时，以同一事务保存关闭偏好、停止全部活动订阅并清空待发正文；停止单个样本不改变全局偏好，重新开启不复活旧订阅。服务设置维护参与改进偏好，普通沉淀直接沿用，提交前等待设置保存，重启后从工作库恢复；仅排队固定范围，已收到的队列项清空正文。同步选择队列及 HTTP 异步连接后，通过 beforeSend 再次校验订阅状态、授权期限和原服务/凭据指纹；身份变化暂停发送。删除不受全局退出限制，但保留目的地约束。改进授权的代次与身份在能力查询后及本地动作前核验，停止再开使原待定授权失效。见 [发送边界](specs/improvement-send-boundary.md)。`DistillationService.collectFeedback` 从已授权任务、原始候选及持久化 `review_events` 补齐修改、发布、验收，因此应用在保存后退出也能恢复反馈。复用文件输入被替换为仅选择标记，不上传路径或内容；沉淀快照排除 `reasoning.summary`，本地旧记录不修改。

状态流：ACTIVE → STOPPED（停止并清空待发正文）或 DELETE_PENDING → DELETED（服务确认删除）。上传和删除串行；已发出的上传可能在停止之后到达，随后删除仍清除它。服务端删除原材料、候选、反馈、评审并保留只含哈希键的 tombstone，阻止迟到重传复活；SQLite 开启 secure_delete。90 天按授权时间固定，到期在服务启动、请求或定时清理时移除，不因反馈续期。首版不产生另存正文的评测派生副本。每主体最多 1000 份样本、每样本最多 1000 条事件，单事件包最多 4 MiB。

授权凭据到期或无法恢复时，可由后台管理员删除。原工作和正式定义仍独立保存。现有样本不导入；真实纠正案例评测尚未实施。

下一轮 [工作定义提取执行依据](work-object-extraction-execution-plan.md) 优先复用现有定义契约、提取流程与私有样本链，补充真实案例评审和版本对比。分块中间结果的信息保留属于待验证风险，只有真实错误支持时才调整提取流程；试点所需的评测工具、模型调用和新实例实验尚未执行，不新增已实现状态或扩大采集边界。

### 桌面应用更新

`desktop/app-updates.ts` 管理检查并发、下载确认、提示及 Finder 定位；`desktop/github-release.ts` 读取公开 GitHub `releases/latest`，比较稳定版本，按严格文件名选择本机架构 ZIP 和 SHA256。主进程注入 Electron net.fetch，下载流式写入系统下载目录中的独立临时文件夹，大小和 SHA256 校验通过后才将 .part 改名为 ZIP。失败清理，不解压或执行附件。

状态流：闲置 → 检查 → 用户确认 → 下载校验 → Finder 定位；稍后、无更新或失败返回闲置。用户自行退出、替换和重开应用；不存在 autoUpdater 或原生安装调用。开发模式不检查。`scripts/release-mac.mjs` 负责免费 ad-hoc 签名、打包及解压 QA，不要求 Apple 公证，不自动发布。GitHub token 不进入客户端，数据目录和 bundle ID 保持稳定。

### 安装身份与显式服务连接

`AutomaticConnection` 在正式版没有既有配置时使用内置 `https://worket.dandi.site`，生成互不复用的安装秘密和用户恢复码；开发环境仍只接受显式 `WORKET_SERVICE_URL`。`ServiceCredentials` 通过 macOS 系统安全存储保存秘密。后台 `/v1/installations` 只保存两个秘密的 SHA-256：安装秘密定位 `DeviceIdentity`，恢复码定位 `UserIdentity`。RS256 令牌以设备为 `sub`、用户为 `uid`；先检查设备撤销和期限，再以用户作为额度、幂等和上传隔离主体。

同一恢复码可在新设备创建新的设备身份并恢复相同用户。撤销一个设备不会撤销其他设备，但首版为阻止在途请求继续处理会取消该用户当时运行中的模型任务。客户端改进队列以服务地址和恢复码标识目的地，令牌续期不改变目的地；手动凭据继续按原规则处理。网络请求中若手动切换服务或恢复用户，迟到注册结果不能覆盖新配置。完整不变量见 [托管用户身份 v1](specs/managed-user-identity-v1.md)。

自动接入由服务端显式环境开关开启；单 IP 每小时最多 60 次注册/续期请求、服务每小时最多 1000 次、最多 1000 个用户和 5000 台设备。公网代理覆盖来源地址头，服务仅在配置为信任本机代理时使用该头。模型调用按全局滚动 24 小时默认 200 次限额预占，保留原每用户限额和并发限制；这是调用次数限额，不是固定金额承诺。后台默认绑定 loopback。

2026-09-18 managed service 部署在 `jp-server`：Node 24 容器使用 host network，但服务自身仅绑定 `127.0.0.1:18788`；Nginx 在 `https://worket.dandi.site` 只代理 `/health` 与 `/v1/`，其他路径返回 404，管理页面继续通过 SSH 隧道访问。代码目录只读挂载，状态持久化于 `/opt/worket/data`，容器自动重启；公网 HTTPS、API 鉴权、模型配置、匿名用户自动接入和主密钥重启持久化已验证。v0.1.4 正式桌面已从内置地址创建用户与设备并通过连接检查。运维证据见 [jp-server 运维记录](deployment/jp-server-worket.md)；旧环境证据见 [VPS 退役记录](deployment/vps-operation.md)。

2026-09-11 已获用户授权迁移 DeepSeek 配置。实测发现模型可将 `content.purpose` 返回为字符串，并把中间层改写文本当作原始引文。`work-definition-v1.2` 明确目标必须是带来源依据的 Item 对象，聚合阶段只引用真实来源/事件键，不生成缺少原文验证条件的 excerpt；既有对象、引用和证据校验保持严格，不自动补造来源依据。

### 记录触发的对话样本（2026-09-11）

`AppService` 在主动创建、拆分和恢复记录成功后发出记录开始回调，完成、归档、取消记录时发出停止回调；桌面主进程将其接入 `RecordingCollection`。该模块用 `recording_samples` 关联工作与独立样本 ID，并复用 `ImprovementCollector` 的偏好、持久队列、身份绑定、重试与删除，不依赖沉淀或模型。只有明确登记的工作参与扫描；旧工作不迁移为采集范围。拆分成功才停止原采集并登记新范围，失败时保持原记录。

协议增加 `RECORDING` 范围与独立授权版本 `worket-recording-v1`，`RECORDING` 首事件建立来源工作关联，`MESSAGE` 事件仅含消息 ID、序号、发言类型、时间、分片编号与正文。长文本按 16000 UTF-16 单元分片，无截断；客户端按来源事件 ID 和分片去重，服务器按样本事件 ID 幂等。服务端白名单拒绝工具、推理事件及额外元数据。现有每样本 1000 事件额度仍生效，达到额度后停止该样本并显示 `QUOTA_EXCEEDED`；90 天期限由本次登记开始，后续消息不续期。

`DistillationService.collectFeedback` 同时推进已登记记录的对话队列，并跳过这些订阅的沉淀任务查找。退出采集后不自动恢复，主动恢复记录生成新的授权样本；取消记录后后台已有样本保留至用户删除或到期。管理页增加工作记录与对话事件标签，沿用管理员鉴权、评审和删除接口。服务端须随新协议升级；本轮尚未部署、打包或发布。

记录提示频率：`recording_notice` 在本机工作库保存已确认的说明版本。`RecordingCollection.noticeRequired()` 根据参与改进偏好与当前 `recordingVersion` 决定是否展示；只有主动记录成功登记后写入版本，不根据历史订阅、页面打开或启动推断。桌宠和面板通过同一应用层状态控制首次提示，后续记录及重启共享确认状态。关闭再开启参与改进不重置同版提示，版本变化会重新展示；此状态只控制提示频率，不扩大上传范围，也不恢复已停止的订阅。

桌宠贴边状态为 free/left/right/top/bottom；保存窗口坐标、可见角色中心 center 与 edge，兼容旧版坐标配置。自由状态由 placeFloatingPet 约束角色边界，并计算角色在透明窗口内的位置；pet:placement 与 pet:get-view 传递相同 placement，气泡靠近顶部时向下展开。底部吸附使用 display.bounds，其他边缘使用 workArea。dock-space.ts 只读 Dock plist 中的图标数量、尺寸和方向，估算中央避让宽度；失败时保守预留中央 80% 屏宽，不请求辅助功能权限。无边框桌宠启用 enableLargerThanScreen，避免 macOS 将底部窗口推回 Dock 上方，实际可见性仍由 PetPosition 约束。重启及显示器变化恢复角色中心和吸附状态；点击和拖动保持分离。

2026-09-11 用户确认 B「双爪偷看」：四向吸附统一采用小圆头、两只眼睛和贴边爪尖，隐藏嘴巴，露出约 19 像素；保留状态点、点击打开和拖离恢复。原生点击窗口仍为 32×68 / 68×32。

2026-09-11 双爪造型微调：露出轮廓改为宽圆角，眼睛向中间和边缘内侧收拢，保持约 19 像素露出高度及原点击窗口尺寸。

2026-09-11 贴边头部进一步调整为 48×34 椭圆，取消平底圆角，保持 19 像素露出高度、内收眼睛和贴边双爪。

2026-09-11 拖动与底部吸附统一空白区域规则：petMovementArea 按完整角色宽度判断 Dock 两侧通道，将通道内可移动区域延伸到 display.bounds 底部，中央仍用 workArea。renderer 用 requestAnimationFrame 合并 pointermove，结束拖动前同步发送最后坐标；主进程跳过相同 bounds 的原生窗口更新。qa-pet-drag 在松手前验证底部通道中的角色中心跟随指针，防止两套边界再次产生跳跃。

2026-09-11 PetPosition.absorb 暂时扩展原生窗口覆盖起始与目标位置，placement.motion 传递起点、终点、时长及动作 ID；renderer/pet-motion.ts 用 Web Animations 执行缩入与显露，完成后移除临时角色。320 毫秒后主进程收小窗口，保存仍使用最终坐标。新拖动和显示器恢复会结束未完成收纳，拖出通过 emerge 做短展开；中间状态不写入偏好。

2026-09-11 记录呼吸仅由 .docked .pet.awake .status-dot 控制，复用全局记录状态映射，不增加计时器或轮询；waiting、carrying、alert 与 sleeping 不使用记录呼吸。

### 渲染层一致性（2026-09-11）

2026-09-21 更新：`src/renderer/theme.css` 统一桌面字体、颜色、28px 控件、6px 圆角及品牌样式，由主面板、审阅和桌宠气泡共同加载；`panel.css` 管理列表、分类行、表单、菜单与弹层。`ui.ts` 共用定义分类的图标 / 短标签及品牌标记，避免审阅与保存后视图分叉。后台样式保持独立。

`panel.ts` 以当前标签、详情是否打开和批量选择集合管理视图。主进程 `panel:shown` 可携带工作 ID，使桌宠记录入口准确进入详情；普通打开面板保留当前位置。工作操作采用防重复提交和可见错误反馈；轮询在弹窗、菜单和表单操作时暂停，工作数据未变化时保留 DOM。更多菜单支持点击外部 / Escape 收起，并在短窗口内调整位置。候选编辑的局部重绘保留问题处理内容，保存修改保留已选固定资料。

2026-09-23：OPEN 详情通过 `progressSection` 从 `WorkDetailView.state` 投影两个精简进度区（completedActions 末两项、pendingActions 前两项），CSS 限制每项两行，高度不超过 600px 时缩为一行。完整 `stateSection` 保留在 `data-preview="context"` 的原生 details 中，沿用同工作刷新保留展开状态的机制；工作切换重置。此为渲染层展示变更，持久状态、来源及交接包不变。

验收使用 `scripts/qa-interface.mjs` 的合成页面与临时后台，以及现有 Electron、记录提示、沉淀流程脚本。截图为开发证据，独立于真实模型、外部执行者与发布包验收。

2026-09-11 视觉复核：面板默认窗口调整为 400×660；纸纹通过低对比度内嵌 SVG 噪声平铺实现，不引入图片请求、动画或额外依赖。详情交接状态使用内联文字，移除黄色横幅和重复上传说明；错误提示仍有独立可访问反馈。

文件链接由 AppService 将资料状态中的绝对路径投影为文件名、路径与 file URL，原始状态保持不变。渲染层点击通过 `work:open-artifact` 传工作 ID 与条目 ID；主进程核验面板来源、从该工作重新解析路径并检查文件存在，再用 `shell.openPath` 打开，错误在面板显示。

2026-09-11 浏览读取边界：`dashboardWithContext` 只同步当前会话标题并投影本地已保存状态；打开详情、切换工作与面板轮询不再触发 ArtifactTracker 的文件校验。主动刷新、交接仍复核资料，点击文件链接仍检查文件存在。面板、历史列表及弹窗共用 6px 自定义滚动条，保留原生滚动与拖动行为。

2026-09-11 来源与状态同步：`AppService.#readBoundWork` 按工作合并并发读取，并在归档后统一调用状态更新。`work_records.extracted_sequence` 记录已处理的来源序号，与状态写入同一事务；旧记录默认为 0，下一次活动同步补算历史缺口，失败时保留游标等待重试。保存状态前再次核验工作仍在记录且绑定未变化。新建记录与从消息创建工作同步设置游标；复用记录插入显式列名以兼容新字段。`latestActivity` 直接来自最近的 `agent.response`，保留来源 ID，页面显示前三段内容，不依赖摘要规则。

2026-09-11 发布验收补足桌宠透明窗口底部空间：`PET_SIZE` 为 304×271，增加 1px 阴影余量，角色中心及紧凑收纳尺寸不变。

2026-09-11 签名安装包启动复核：先创建窗口并设置跨工作区显示，再恢复 Dock 图标；避免 `setVisibleOnAllWorkspaces` 的进程类型切换覆盖提前设置的 Dock 可见性。接口行为见 [Electron BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window#winsetvisibleonallworkspacesvisible-options)。

## 候选文档式审阅（2026-09-18）

`server/workflow.mjs` 的 v1.3 提示词为提取与泛化两阶段统一规定中文叙述，协议键、枚举和原始引文保持原样。`src/renderer/distillation.ts` 保留 DefinitionContent 结构；2026-09-21 审阅界面已拆分至下述紧凑审阅模块。保存与发布继续使用既有 revision、update 和 publish 契约。语言规则属于模型生成约束，不会批量改写已保存候选。

## 后台沉淀状态与来源核验（2026-09-18）

主进程已有 DistillationService.tick 负责关闭面板后的收取；轮询在 finally 继续调度。服务端 extractDefinition 上报分批完成数及泛化阶段，service 仅在运行请求的内存 Map 中保存进度并随结束清理；客户端将进度投影到 Job。activity.ts 统一生成面板与桌宠状态，Job.seenStatus 持久保存已查看阶段，新状态可再次提醒。桌宠专用 IPC 校验 sender 后打开面板并定位 jobId；候选不自动抢占其他编辑界面。

workflow v1.4 将原始事件 kind 索引带入汇总阶段。对有效引用的 USER_STATED 误标作保守降级为 INFERRED，并添加 blocking UNSUPPORTED_SOURCE；引用与摘录真实性检查仍保持拒绝，已有发布门槛要求处理确认问题。此修复不把工具文本提升为用户指令，不额外调用模型。

## 紧凑审阅与窗口调宽（2026-09-21）

`renderer/definition-review.ts` 管理一个候选的本地编辑副本、决策、来源展开、固定资料绑定和单次撤销；`definition-review.css` 只限定审阅布局，基础颜色与品牌继承共享 theme。`distillation.ts` 负责进入与退出，服务、准备、定义、复用和验收使用共享 dialog-shell：固定品牌栏 → 可滚动 dialog-card → 固定主要操作栏；历史采用相同容器。编辑态/只读态 → 暂存（revision 校验）→ 显式确认 → 不可变定义；保存期间禁用操作，后台刷新不替换审阅 DOM。

`definitions/review.ts` 为界面和仓库共用字段定位：支持章节、章节加 key、原始数组位置和唯一裸 key；数组位置始终以 originalContent 解析，跨章节重名不猜测。未能定位的 Issue 保留在独立区域；不生成虚构证据或自动作出语义选择。编辑不改写来源，原始依据始终可核验；保存后的 basis 由仓库按既有规则记录为 USER_AUTHORED。

仓库 update 增加可选 replaceResolutions，审阅界面用完整集合替换，以便“重新决定”在暂存与重启后仍有效；旧调用继续增量语义。REWRITE/DELETE 比较原始候选的实际内容，排除 basis，允许先暂存文字、稍后采用修改。发布沿用既有未处理问题、必需资料、版本和来源校验。

调宽经 preload 的 panel:resize-right 发送 start/move/end，主进程核验发送窗口和有限坐标；`desktop/panel-resize.ts` 以起始 bounds 计算宽度，保持 x/y/height，限定 360–1000px 及当前显示器右边界。默认窗口宽度 410px，不增加渲染进程 Node 权限。

工作详情的分类行仅展示已有状态；最近回复和执行片段用原生 details，按工作 ID 保留其展开状态，切换工作时重置。展示固定资料时由 materialRoles 将内部 key 映射为用户文字；路径保留在 title，显示文件名。此轮不改变数据契约、IPC、上传授权或模型流程。
