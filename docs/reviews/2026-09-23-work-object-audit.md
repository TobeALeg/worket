# Worket 工作对象、提取与传递审视

日期：2026-09-23。源码基线：`01b27c5ea28e5433b4524ec5ceea4f4fb7b075fe`（main）。这是源码与隔离执行审视，不是已安装客户端或生产服务验收。本轮只增加审视材料和 BP 洞察，不修改产品实现；下述方案尚未批准落地。

后续：用户已授权实施上述方向，当前实现与验证见 [工作接续验收](../acceptance/work-continuity.md)。本文保留审视时点的发现。

## 结论

Worket 已经建立 Work Object 的实体基础：工作身份、定义版本、记录、执行者与外部会话确实分离。可复用定义和资料固定也有实质实现。但“独立保存工作”与“准确理解并传递当前工作”完成度不同：前者成立，后者仍有默认入口与语义表达缺口。

核心问题不是缺一张 WorkObject 表。当前存在三套理解路径：八字段 WorkState、可复用 Definition、交接 ContinuationSnapshot。它们共享部分原始来源处理，却各自解释要求和状态，且模型入口、规则表达、输出消费没有完全接通。

## 1. Work Object 达成了什么

依据 [领域定义](../../CONTEXT.md)，工作对象是工作定义、一次工作及其记录的组合，不要求一个同名类。

| 条件 | 当前证据与判断 |
| --- | --- |
| 独立身份 | WorkInstance 使用自己的 ID；外部对话存在 CaptureBinding。交接保持 ID、增加 ExecutionEpisode；复用创建新 ID。结构成立。 |
| 独立生命周期 | OPEN / COMPLETED / ARCHIVED、记录绑定、执行片段分别管理；打开目标应用不等于确认接手。结构成立。 |
| 可复用约定 | DefinitionDraft 经审阅发布固定版本；新实例固定 definitionId，输入重新提供，单次覆盖独立保存。结构及实现成立。 |
| 可追溯事实 | Source Archive 与 WorkState 分离；支持来源修订、缺失复核、逐项出处和不可变交接包。部分成立：有来源不等于语义正确。 |
| 可可靠接续 | 默认八字段缺少任务的完成/替代关系；新阶段快照已有，但实际启动指令仍请求旧版上下文。尚未形成一致默认链路。 |
| 可迁移材料 | 定义规范、技能及本次输入能固定本地副本；普通成果引用仍依赖路径/可用性，同机使用较完整，跨机器独立材料交付未完成。 |
| 可证明完成 | 复用实例有交付物关联与逐项验收；阶段推断有自报/证据/接受区分。其真实语义可靠性不能由类型或合成回放证明。 |

实现证据：[核心类型](../../src/core/types.ts)、[实例与交接持久化](../../src/core/work-core.ts)、[定义发布/实例创建/验收](../../src/definitions/repository.ts)、[资料组装](../../src/definitions/work-package.ts)。

初始记录一般使用 `general-work`，不会自动生成具体业务定义；现有入口仍以用户选中的会话开始记录，跨会话身份连续性主要靠显式交接。它已能表达独立工作，但不代表已经能够自动识别任意会话中的工作边界、合并同一工作或完成人员/SaaS 交接。

## 2. 当前实际路径

### 记录和当前状态

```text
用户选择会话 → ExecutorAdapter 读取可见历史 → 统一 SourceEvent
    → 本地 Source Archive / 修订与缺失观察
    → LocalRuleExtractor（默认）或可选直接模型提取
    → applyExtractorPatch → 八字段 WorkState
```

八字段是目标、验收、约束、事实、决定、已做、待做、资料。默认实现主要按关键词和正则分类；合并按条目 ID 追加/更新，不能表示一项待办被后续消息完成、取消或替代。编辑原消息触发的来源修订过滤，与新消息“取消旧要求”属于不同问题。

代码：[记录与同步](../../src/app/app-service.ts)、[本地提取](../../src/extractor/local-rule-extractor.ts)、[来源有效视图](../../src/core/source-revisions.ts)。

### 提炼可复用定义

```text
用户选择一条/多条工作及文件范围 → 固定来源快照、文件角色、内容 hash
    → WorketAIClient → 托管后台
    → 分块抽取要求 → 同一工作内协调修正 → 跨工作比较与泛化
    → 来源/覆盖/规则关系校验 → DefinitionDraft → 人工审阅
    → 固定 WorkDefinition 版本、规范条款与技能材料
    → 新输入 → 新 WorkInstance → 工作包 → 执行与用户验收
```

文件区分规范、参考和本次输入；一次特例不能直接变成长效规则。增量演进提供已确认基准与未比较交互；明确开启的持续比较默认不自动发布。这一路比默认 WorkState 更能表达规则作用范围、采纳、替代与冲突。

代码：[本地快照与作业](../../src/distillation/service.ts)、[后台工作流](../../server/workflow.mjs)、[规则契约](../../src/contracts/rules.ts)、[持续比较](../../src/distillation/continuous-evolution.ts)。

后台是分块提取后再聚合，但聚合仍包含原始证据目录并受总输入上限约束；不能称为已经支持无限长记录。程序校验事件覆盖列表及摘录存在，也不能证明模型没有遗漏含义或误解原话。

### 继续同一项工作

```text
交接 → 同步来源/复核资料 → 尝试生成 ContinuationSnapshot
    → 冻结 HandoffPackage + deliveryId
    → 保持 workId，创建 pending 目标执行片段/绑定
    → Adapter 打开应用/复制启动指令
    → 目标通过 MCP 读主包；按事件 ID / 分页补读证据
    → 真实会话标记匹配 + 本次交付的读取回执
    → 后续记录写回同一个 WorkRecord
```

Codex、WorkBuddy 使用各自启动链接，ZCode、Antigravity 使用打开应用与剪贴板；默认适配器都不会仅因打开应用而给出真实 conversationId。交接不代表取消旧外部 Agent 的任务。交付标记用于关联证据，不是执行者身份认证或理解证明。

代码：[交接入口](../../src/app/app-service.ts)、[启动指令](../../src/executors/work-bootstrap.ts)、[MCP](../../src/bridge/mcp-handler.ts)、[交付回执](../../src/core/package-receipts.ts)。

## 3. 本轮确认的具体缺口

### A. 新能力被实际适配器绕回 v2

AppService.handoff 生成 `contextVersion: 3` 的 `request.prompt`。但 Codex、WorkBuddy 和通用剪贴板交付都忽略这份 prompt，重新调用 buildWorkBootstrap，未传 contextVersion，于是默认请求 v2。

本轮在隔离数据库中调用真实 AppService.handoff 和四个默认适配器，只替换操作系统启动/剪贴板及来源接口。四条路径实际发出的启动文本全部是 `context_version=2`，虽然持久交接包已经含 continuation。独立 MCP v3 测试无法覆盖这个入口问题。

定位：[Codex](../../src/adapters/codex/executor.ts)、[WorkBuddy](../../src/adapters/workbuddy/executor.ts)、[剪贴板交付](../../src/executors/manual-delivery.ts)。

### B. 沉淀与交接的模型配置没有接通

沉淀由 main.ts 将 WorketAIClient 注入 DistillationDesktop。当前状态与阶段整理则在 AppService 中检查 `WORKPET_LLM_API_KEY`，并要求该工作启用云端提取或设置 `WORKPET_CLOUD_EXTRACTION=true`。两者没有共享托管连接。

因此，普通客户端只连接托管后台，不能由此推定交接整理模型可用。本轮在无直接供应商配置的隔离进程中直接调用 v3，结果为 UNRESOLVED，附带 v2 回退和最新用户消息。未查看用户实际密钥或声称其本机目前一定缺配置。

定位：[客户端装配](../../src/main.ts)、[AppService 模型选择](../../src/app/app-service.ts)、[ContinuationService](../../src/handoff/continuation.ts)。

### C. 默认 WorkState 是线索列表，尚不是可靠的当前执行状态

| 隔离输入 | 实际观察 |
| --- | --- |
| 要求 CSV；下一步导出 CSV；用户取消 CSV 改 PDF | v3 无可用模型时回退包仍并列 CSV/PDF，首个待办仍导出 CSV；最新原话仍可回查。 |
| 一批导入 12 条不同的“必须”要求 | 只有前 8 条进入 constraints；是结构化投影丢项，不是原始档案丢失。 |
| Agent：“不能声称已完成导出” | 该否定句进入 completedActions。仍标为 AGENT_PROPOSED，不会自动完成 WorkInstance。 |

来源：[观察报告](../acceptance/work-object-audit-2026-09-23/report.json)。第 8 条截断是提取器行为，不能靠 UI 展示更多条修复；同一批来源处理完后游标已推进，剩余条目不会自然在下批补上。

### D. 三种理解之间缺少共同的语义约定

WorkStateItem 只有正文、来源类型、来源 ID；Definition 有采纳、范围、关系、规范条款；Continuation 有阶段、依赖、有效/替代要求和证据。它们有共同的来源修订基础，但不能自动保证对同一纠正作出一致解释。

阶段整理目前按当前整体输入生成，超过 80,000 个 JSON 字符回退 PARTIAL；与沉淀相比，它没有分块阶段合并。阶段验收与 DefinitionRepository.accept 的业务验收也没有通过统一事件表达直接接通：后者写 review_events，前者主要查看 SourceEvent/WorkState/材料。因此不应假定所有已记录验收都会进入接续推断。

## 4. 更好的实现方案与共通部分

最小方向：保留实体、数据库和 ExecutorAdapter，统一证据准备与执行包出口；两种业务推导仍分别负责“这一次如何继续”和“下一次如何复用”。不需要先引入图数据库、通用 Agent 调度或另一套 WorkObject 同义实体。

```mermaid
flowchart TD
  A[已授权的对话与材料] --> B[Source Archive 与固定版本]
  B --> C[共享证据准备与来源校验]
  C --> D[本次工作状态与阶段接续]
  C --> E[可复用定义候选]
  E --> F[人工确认的定义版本]
  F --> G[新输入与新 WorkInstance]
  D --> H[统一工作包生成]
  G --> H
  H --> I[ExecutorAdapter 传输]
  I --> J[执行记录与验收反馈]
  J --> B
```

共享部分应覆盖：稳定事件身份、当前来源版本、授权范围、发言/证据角色、原文摘录、材料版本、变化失效、模型调用基础设施，以及要求的适用范围、明确替代和未确定项。这可以先是内部公共契约与函数，不必立刻创建新的持久实体。

两种推导必须保留区别：

- 接续回答“这一次做到哪、什么仍有效、下一步是什么”，保留本次具体数据与成果，保持 workId。
- 沉淀回答“以后同类工作还要遵守什么、什么必须换成新输入”，排除旧实例值，经人工确认形成新定义版本；执行时创建新 workId。

不能拿为下一次泛化过的定义替代本次状态，也不能把包含客户/日期/临时授权的交接快照直接保存成通用定义。两者复用证据基础和部分规则判断，不共用一个不加区分的摘要。

建议顺序：

1. **接通真实交付路径。** 由应用层生成一份最终交付内容；Adapter 只负责目标所需的 URL 编码、长度检查、剪贴板等传输。把 v3 请求穿过四种实际 Adapter 作为集成验收，而不是只验独立 MCP。
2. **统一模型接入与明确授权。** 让阶段整理可通过既有托管能力运行，保留各操作的授权范围；不能把已允许沉淀解释为任意自动上传。未解析、失败或超限需要让用户和接手者看见。
3. **统一证据与本次状态表达。** 复用现有范围、来源与关系校验；让当前状态和交接消费同一份版本化接续理解。旧关键词列表可保留作搜索线索或降级信息，不能继续充当完成/替代判断的权威。
4. **把真实接续质量作为验收中心。** 在相同来源断点比较全聊天、当前链路和新链路：是否重复已做工作、漏掉有效要求、扩大用户认可范围、误用旧材料；成本包括准备、补读和用户纠正。

跨机器材料包、同事接手或受限执行授权是后续独立扩展，只有相关目标明确后再设计。当前同机 MVP 不必承担全部组织工作流。

## 5. 本轮验证与限制

当前 TypeScript 源码编译至新临时目录，通过。没有覆盖现有 dist 或运行中的客户端，也没有读取真实工作数据库。

[probe.mjs](../acceptance/work-object-audit-2026-09-23/probe.mjs) 验证上述默认语义与实际 Adapter 输出；首次运行因脚本在 stopCapture 后试图追加合成事件而失败，调整为先追加、再停止后成功。此修正只影响审视脚本，不是产品修复。观察脚本不是要求未来继续保持缺陷的回归门槛。

现有 qa-handoff-stages.mjs 在同一份新编译源码上执行，12 项检查通过，见 [阶段报告](../acceptance/work-object-audit-2026-09-23/stages-report.json)。首次受沙盒 localhost 监听 EPERM 阻止，获准使用本机监听后通过；没有模型调用。该脚本使用确定性语义适配器，证明结构、缓存/失效、MCP 传输与保护路径，不能证明模型理解质量或目标 Agent 实际交付。

未新增真实模型试验、Electron 操作或业务成果验收。已有真实模型证据可参考 [约定验收](../acceptance/working-contract-v2.md)，其具体样本与边界不能外推为普遍准确率。

复现：

```sh
audit_dir=$(mktemp -d /private/tmp/worket-object-audit-XXXXXX)
node -e 'require("node:fs").writeFileSync(process.argv[1], "{\"type\":\"module\"}\n")' "$audit_dir/package.json"
./node_modules/.bin/tsc --outDir "$audit_dir/dist" --sourceMap false
node docs/acceptance/work-object-audit-2026-09-23/probe.mjs "$audit_dir/dist" "$audit_dir/report.json" "$(git rev-parse HEAD)"
```
