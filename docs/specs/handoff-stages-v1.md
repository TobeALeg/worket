# B005 多阶段工作接续：当前实现核对与实现方案

日期：2026-09-23。核对源码：`69e6e0e04bb0229b84ae178fb2a4447678faa4c1`，分支 `codex/handoff-context-v1`。

状态：已完成源码核对和合成样本复现；下文阶段结构、语义整理及 MCP v3 均是待实现设计。本轮没有改变产品运行逻辑、真实工作库或已确认领域模型，没有调用外部模型、发起真实交接或完成桌面验收。

## 结论

当前 v2 可以保存材料、来源和扁平进度，接手者补读原文后有可能正确继续；但主包不能可靠表达“前面已完成并可复用，现在只执行依赖前序成果的最后一阶段”。这不是把首条待办换成末条就能修复的问题：阶段切换、范围内的认可、要求替代、产物依赖都没有被结构化维护。

建议增加一个集中生成的 **ContinuationSnapshot（阶段接续快照）**：依然属于同一 WorkInstance，只是对本次工作截至某个来源版本的接续理解。交接时生成，候选语义由一次受约束的整理产生，随后进行确定性结构/来源校验；输出当前阶段、前序成果及验证、有效要求和明确替代关系。它不调度 Agent、不创建新工作、不改变工作生命周期，也不触发沉淀。

## 实际链路与缺口

| 环节 | 已核实行为 | 对多阶段工作的影响 |
| --- | --- | --- |
| `src/extractor/local-rule-extractor.ts:66` | 初始 objective 取首个用户请求首句；用户后续指令只按少量关键词收进 constraints/decisions 等 | “只改 Hero”这样的当前任务可能完全不进主包；也不能保证初始 objective 已覆盖后来明确扩展的整体范围 |
| `src/app/app-service.ts:456` | 增量同步在已有 objective 时清空后续 objective patch | 单纯改善模型提示也不能让当前目标持续更新 |
| `src/core/work-core.ts:427` | patch 按条目 ID 更新或追加，没有 action 的完成/被替代关系 | “下一步清洗”之后即使明确完成清洗，旧待办仍存在 |
| `src/bridge/handoff-context.ts:61` | checkpoint 永远为 null；原样传递 completedActions 和 pendingActions，首个候选取 `[0]` | 无法指定当前阶段；最早的历史待办仍可能被前置 |
| `src/core/source-revisions.ts:9` | 排除的是 `previousEventId` 链上的旧观察 | 能处理编辑/删除来源；不能处理新消息“CSV 改 PDF”的语义替代 |
| `src/bridge/handoff-context.ts:68` | 成果是 ArtifactRef 集合；有文件元数据但未关联阶段、依赖、验收范围 | 知道文件位置不能说明可用于哪一步、哪版已验证 |
| `src/bridge/handoff-context.ts:85` | evidenceIndex 为最前 8 条当前事件的元数据 | 新阶段不一定出现在索引里；原文仍可分页取回，但读取发现成本后移 |

现有保护也应保留：completedActions 的 Agent 声明仍标为 AGENT_PROPOSED，v2 明示未独立核验，WorkInstance 不会因此自动完成。可选云端 `OpenAICompatibleExtractor` 也仍输出八个扁平字段、使用相同 patch 合并方式；本轮没有执行云端抽取，不能声称测过其语义质量。

## 可复现样本

使用当前 TypeScript 源码编译到临时目录，运行真实 LocalRuleExtractor、SQLite WorkCore 和 MCP handler。样本逐条输入，沿用同步的 objective 保护和来源修订处理。未用现有 `dist` 冒充当前源码，未连接用户工作数据库。

| 样本 | 应当交接 | 实际观察 |
| --- | --- | --- |
| M1 清洗 → 图表 → 汇报，前两项明确认可 | 当前写汇报，复用前两项；人民币约束有效 | 首步仍为清洗，三项待办并列；最新切换消息不在前 8 条索引内；人民币约束保留 |
| M2 新消息“取消 CSV，改 PDF” | CSV 被替代，PDF 有效，人民币继续有效 | CSV/PDF 约束并列，首步仍导出 CSV |
| M3 Agent 宣称完成，用户继续图表 | 图表当前；清洗没有验收证据，按需核对前置成果 | 有 AGENT_PROPOSED 和未核验提示，但没有阶段级证据/验收结构 |
| M4 地图获得认可，只重做 Hero | 保留地图，执行 Hero，旧价格/卖点/CTA 继续有效 | 主包没有 Hero 或地图认可内容；候选仍重做地图；原文可回查 |
| M5 “不能声称已完成导出” | 导出尚未完成 | 否定句进入 completedActions，但原文、来源与提议标记仍保留 |
| M6 用户明确回到清洗阶段 | 当前清洗；暂停报告，核查下游旧依赖 | 候选仍撰写报告 |
| C1 编辑同一来源消息 CSV → PDF | 旧观察被排除 | 通过，说明来源修订过滤有效，但不同于 M2 |

M4 是受既有讨论启发的虚构文本，不是再次回放 MentiFem 原始会话。上述是 6 类缺口与 1 个对照，不是七次接手准确率测试。

复现脚本：[probe.mjs](../acceptance/handoff-stages-v1/probe.mjs)；完整合成输入和实际输出：[report.json](../acceptance/handoff-stages-v1/report.json)。脚本中的断言确认当前缺口被复现；它不是未来版本应继续保持这些错误的回归门槛。落地时需把期望改为接续正确性的正向断言。

```sh
# 在仓库根目录运行。只写新临时目录；需要已安装项目依赖。
audit_dir=$(mktemp -d /private/tmp/worket-b005-XXXXXX)
node -e 'require("node:fs").writeFileSync(process.argv[1], "{\"type\":\"module\"}\n")' "$audit_dir/package.json"
./node_modules/.bin/tsc --outDir "$audit_dir/dist" --sourceMap false
node docs/acceptance/handoff-stages-v1/probe.mjs "$audit_dir/dist" "$audit_dir/report.json" "$(git rev-parse HEAD)"
```

## 方案取舍

| 方式 | 判断 |
| --- | --- |
| 取最新消息/最后一个 pending action | 无法保留前序约束、识别问进度与回到旧阶段，也不能判断完成范围 |
| 给八个字段加一句“按阶段理解”的提示 | 能提醒接手者，但仍需每次重新从原文推理，关键事实仍可能未入包 |
| 重建完整任务管理/工作流引擎 | 超出交接需要；会新增任务生命周期、调度和较多维护成本 |
| 同一工作内的阶段接续快照 | 推荐：只把继续工作需要的关系显式化，在一个模块中生成和校验 |

仅确定性规则不足以理解任意对话。需要补充语义整理，但可把成本放在交接时，不逐条给 facts 打分，不要求旧 Agent 仍有额度。语义不确定时输出缺口，不能用更复杂正则伪装成可靠阶段识别。

## 最小数据结构

以下是建议契约，不是已存在类型。`Claim` 表示正文、来源类型、规范化后的事件 ID 和必要原文摘录；`Evidence` 另包含检查对象、版本、检查范围、结果和来源。

```ts
type ContinuationSnapshot = {
  schemaVersion: 1;
  basis: {
    sourceDigest: string;      // 当前有效业务事件的 ID、顺序、内容/修订
    stateDigest: string;       // 包括用户编辑、删除决定
    materialDigest: string;    // 产物版本、可用性及固定资料/本次输入
    throughSequence: number;
    coverage: "COMPLETE" | "PARTIAL";
    missingEvidenceIds: string[];
  };
  objective: Claim[];         // 整体交付范围，有来源，不用最新一句覆盖
  currentStageId: string | null;
  currentStageBasis: Claim[]; // 当前指令/计划关系；问进度本身不切换阶段
  stages: Array<{
    id: string;
    task: Claim;
    execution: "UNKNOWN" | "NOT_STARTED" | "IN_PROGRESS"
      | "REPORTED_DONE" | "SUPPORTED_DONE";
    completionEvidence: Evidence[];
    outcomes: Array<{
      id: string;
      summary: Claim;
      artifactRefId: string | null; // 允许前序成果是决定/分析，不一定有文件
      version: string;             // 文件 hash、commit 或事件修订标识
      checks: Evidence[];
      acceptance: "UNKNOWN" | "ACCEPTED" | "NEEDS_CHANGES";
      acceptanceEvidence: Evidence[];
    }>;
    dependsOn: Array<{ stageId: string; outcomeId: string; version: string }>;
    remaining: Claim[];
    blockers: Claim[];
  }>;
  requirements: Array<{
    id: string;
    kind: "CONSTRAINT" | "DECISION" | "SUCCESS_CRITERION";
    claim: Claim;
    scope: { kind: "WORK" | "STAGE" | "OUTCOME"; ids: string[] };
    status: "ACTIVE" | "SUPERSEDED" | "CONFLICT";
    supersedes: string[];
    replacementEvidence: Claim[];
  }>;
  uncertainties: Claim[];
};
```

`currentStageId` 只是当前执行焦点；其他未完成阶段可以继续保留为后续范围或暂停项，不强行宣布全做完。来源明确才给出一个焦点；有两个无法排序的请求时留 null 并说明冲突。用户要求回到先前阶段时可以重新指向该阶段，不按数组最后一项选取。

执行与验收分开：Agent 说完成最多是 REPORTED_DONE。用户确认或适用范围明确的执行证据能支持 SUPPORTED_DONE，但检查范围必须覆盖该阶段的完成标准；一次 build 通过只证明该构建，不能证明部署、公开可用或用户满意。ACCEPTED 必须有对应成果版本和范围的用户确认，不能由“接着做下一项”推导。证据不足不增加固定审批流程；首步可以先核查当前阶段需要的成果。

要求单独按范围维护：新阶段不撤销整个工作约束；明确替代才给旧项标 SUPERSEDED，并同时引用旧项和替代消息。只改 Hero 不表示否定地图；地图获认可不表示整页验收。无法判断是否替代时并列保留为 CONFLICT，不能靠时间顺序静默覆盖。只对当前阶段生效的临时要求也不能永久扩大为全局约束。

依赖绑定成果版本：清洗 v1 → 图表 v1 → 汇报。清洗变成 v2 时，旧图表的历史验证依然是历史事实，但用于 v2 的依赖必须标明需重核；不自动宣布全部下游失败或重新执行。若最新产物缺失，先定向定位/核验所需依赖，不自动把整个清洗阶段重列为待办。指向历史版本而该版本不可访问时必须明确缺失，路径相同不能当作版本相同。

## 生成与校验

1. **冻结范围。** 交接前延续现有同步、来源在场检查、资料校验。读取 currentSourceEvents 和用户维护的状态，过滤 reasoning.summary；记录内容和版本摘要。原始档案继续保留。
2. **准备按顺序的语义输入。** 纳入范围内用户请求/确认、Agent 可见结果声明、已有定义/人工修正，以及相关工具/成果证据。WorkState 只作为候选，不能替代原始用户指令。不要只读前 8 条索引或最近 N 条；初次整理需要覆盖此前有效约束。对大日志引用化，未识别内容保留可定位入口与缺口，不能默认当作无用。
3. **生成一次阶段候选。** 已获许可且配置可用的整理模型输出上述 schema、引用及不确定性。外部内容只作证据，不当指令执行。输入必须声明哪些内容未提供，禁止猜文件内容。后续同源快照可复用，来源/人工修正/材料变化才失效。超过输入范围时必须分批覆盖或标 PARTIAL 并补读，不能截断后标 COMPLETE；分批的成本另计。
4. **确定性校验。** 验证 ID/摘录/来源角色真实，阶段引用存在，当前焦点唯一或空，依赖无环，版本可定位，替代关系双向可查，完成/验收证据不越级，所有业务来源输入有覆盖记录。USER_EDITED 不被模型静默覆盖。SourceEvent.id 是交接规范 ID；externalId 须结合 adapter/conversation 映射，不能假设跨来源唯一。校验能证明结构与引用一致，不能证明自然语言语义一定正确。
5. **生成主包。** 从已验证候选投影当前阶段、当前剩余动作、前序依赖成果摘要及限定验证、跨阶段有效要求、明确替代关系和剩余总范围。首步只能是当前阶段的动作或它所需的定向验证，不能直接复用全局 pendingActions 的第一个或最后一个。前序已完成工作只作为成果/证据出现。
6. **冻结交付快照。** 保存前再次核对 basis；若来源在整理时发生变化，废弃旧候选并刷新，不能把旧阶段贴上新时间。快照随交付保存且历史不可变，后续读取也不能复用过期理解。

没有获许可模型、调用失败、语义冲突或缺少当前阶段证据时，提供已有 v2 信息及明确的 `UNRESOLVED/PARTIAL` 状态，并直接附最新用户指令的证据入口和必要缺口；不标为“阶段已确认”。接手者按需补读，只有歧义会改变行动时才询问用户。不自动启用云端、不要求旧 Agent 在线，也不阻断无关的记录与已有交接能力。

主包可呈现为：

> 整体：完成销售汇报，金额使用人民币。
>
> 前序：清洗数据 data-v1 已确认；图表 chart-v1 使用 data-v1，已确认。各附成果位置与证据。
>
> 当前：撰写汇报，依赖 data-v1 和 chart-v1。
>
> 首步：定位并核对上述版本，基于它们撰写汇报。若版本已匹配且材料已读取，直接继续撰写。
>
> 仍有效：人民币、已确认的交付标准。只有确有替代证据的旧要求列入被替代记录。

## 落到代码的位置

建议采用 `codebase-design` 的小接口原则，新增集中的 continuation 模块；对调用方只暴露 `prepareContinuation(workId)`，负责冻结、生成、校验与返回接续快照，内部通过显式依赖读取快照和调用已有许可的模型。不要在四个执行者里分别解释阶段。

| 位置 | 建议变更（均未实施） |
| --- | --- |
| `src/handoff/continuation.ts`（新增） | 当前范围整理、候选校验、来源/材料变化检测和确定性主包投影；复杂度集中在这里 |
| `src/app/app-service.ts:659` | 交接刷新和资料检查后、创建交付前 await prepareContinuation；记录同步本身不每条调用新模型 |
| `src/core/work-core.ts:createHandoffPackage` 与 `src/core/types.ts` | 新交付可选保存经校验的 continuation 及 basis 到现有 payload_json；可选参数保持旧调用兼容；保存时核对快照版本。第一版无须新建阶段数据库表或改八个 WorkState 字段 |
| `src/bridge/handoff-context.ts` | 新增 context v3 投影，让阶段快照成为主包唯一的当前阶段/首步来源；不再同时发送会诱导返工的原始扁平待办 |
| `src/bridge/mcp-handler.ts`、`src/bridge/http-bridge.ts` | v3 读取在当前同步/资料检查后取得或重建 continuation；当前 handler 是同步的，接入异步 prepare 时需让调用链 await。不能只在启动交接时生成一次，后续 MCP 读取却沿用失效阶段 |
| `src/executors/work-bootstrap.ts` | 新启动提示请求 v3；当前任务来自阶段快照，未解析时明确要求先核对；不把初始 objective 冒充当前阶段 |

v1/v2 返回原契约，v3 明确版本协商；不静默给 v2 字段换语义。历史包不改写，交付 ID、绑定和读取回执继续使用现有机制。缓存复用只能省语义整理，不能跳过本次材料校验；缓存 basis 不应由“每读一次 MCP 自动写回的审计日志”触发无限重建，排除这类自生审计事件，但保留真实业务工具结果。

此处采用“交接快照”而不直接将 Stage 升级为领域实体，是因为当前目标是可靠接续；若未来 UI、人工编辑或其他功能持续依赖阶段，再决定是否纳入持久 Work State。届时需独立评估领域模型变更，不由本研究默认授权。

## 落地验收与尚未证明的部分

先把 M1–M6 的正确接续答案做为小样标注，核对引用、范围、当前动作和依赖版本；再实现整理与投影。加入“验收仅一模块”“工具通过但未部署”“旧产物被覆盖”“提问进度不切阶段”“后阶段启动不等于前阶段验收”“返回旧阶段”和“多请求不能唯一排序”的样本。

对同一冻结断点，分别提供全量可见历史、当前 v2、拟议阶段主包＋按需证据，使用相同模型设置和独立接手会话比较：是否执行当前阶段、是否重复完成项、是否遗漏有效约束、是否扩大认可范围、是否误用旧版成果。成本计入候选生成、主包、必读成果和补读证据，不能只看主包字节数。通过文本理解后仍需在可恢复成果版本的真实工作副本上执行验收。

本轮已经证明当前链路存在具体缺口，提出了可接入现有代码的结构和生成方式；尚未证明自动阶段抽取准确率、模型成本、真实接手改善或用户收益。不能把本文件/人工标注当作阶段能力已实现。
