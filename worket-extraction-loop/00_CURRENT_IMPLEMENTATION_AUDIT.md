# 当前提取实现审计

审计日期：2026-09-18。结论：现有版本有完整的提炼与确认基础，但不能根据工程测试推断已经满足真实语义质量或使用价值标准。先补确定的校验缺口，测量真实开发集，再决定最小升级；不要先重写整套产品。

## 1. 版本核对

- GitHub main：`17f045c7f274e7e06e1e488f59bbd3423227beac`。
- GitHub 实验分支 `experiments/pi-bench-calibration-2026-09-13`：`b842dfe981bd2f9f05df3eeaa733d2347a0cd3de`，比 main 多 3 个提交。
- 比较 Git tree：两者的 `server/`、`src/contracts/`、`src/core/`、`src/definitions/`、`src/distillation/`、`src/extractor/` 内容相同。该实验分支并未替换这里审计的核心提取算法。
- 两分支其他目录不同；不据此说整个产品相同。也没有把 GitHub 状态当成用户本地未推送代码或已部署服务的状态。
- 本机 Codex 先执行只读版本盘点；获准联网后 fetch，不自动 pull/merge/reset。若本地有更新，以独立工作目录复现当前版本并记录差异。

## 2. 其实有两条不同的“提取”

### A. 同一项工作当前状态的提取

`src/app/app-service.ts:#extractor` → `src/extractor/local-rule-extractor.ts` 或 `openai-compatible-extractor.ts` → WorkState。

当允许 cloud 且存在相应 API key 时，AppService 选云端 WorkState extractor；否则使用本地规则。没有读取用户环境配置，本次不确定其设备当前走哪一种。

本地规则依靠关键词识别 objective/constraints/decisions/completedActions 等，并在单次 patch 的各字段去重后限制前 8 条（artifacts 为 12 条）。这是状态提取，不是可复用 Definition 的云端工作流。

### B. 从历史工作沉淀可复用定义

`DistillationService.prepare` 从 **原始 sourceArchive** 和用户选择的附件构建快照 → `server/workflow.mjs:extractDefinition` 分块提取 → 跨块协调/泛化 → 校验 → draft → 用户修订、发布 → Definition → 新 Instance。

因此不能把路径 A 的“前 8 条”直接当成路径 B 丢失历史要求的原因。B 当前读取的是原始档案，不是仅读取这 8 条状态摘要。

## 3. 已实现的能力，不应该重做

| 能力 | 实际位置 | 支持的结论 |
|---|---|---|
| 来源快照、选定文件、内容哈希、提交前变更检查 | `src/distillation/service.ts:prepare/start/wire` | 有范围受控和可追溯的输入 |
| 分块提取再协调泛化 | `server/workflow.mjs:extractDefinition/chunksFor` | 已是两阶段流程，不是一次简单总结 |
| 提示词中区别临时/可复用、角色、纠正、跨工作冲突 | `server/workflow.mjs:SYSTEM` | 已明确表达算法意图，但提示词不是强制校验 |
| 假引用、越界引用、冒充 USER_STATED 的 Agent 事件可被拦截 | `validateResult` + workflow/server/local receive | 已有结构与角色防线，控制用例本轮通过 |
| 原始候选与人工修改区分、revision、review_events | `src/definitions/repository.ts:update` | 修改不是静默覆盖；可追溯 USER_AUTHORED |
| 处理问题后发布、版本不可变 | `repository.ts:publish/revise` | 已有发布及版本机制；不等于逐条语义正确 |
| 创建新实例不复制旧的已完成/待办状态 | `repository.ts:create` | 结构上隔离旧实例；若定义内容本身错误仍会传播 |
| 真实模型评估入口 | `server/evaluate.mjs` | 已有结果/usage收集和人工待审状态，不是没有 evaluator |

现有工程测试覆盖认证、幂等、快照、版本、新实例等。此次只读相关测试且没有跑完整测试集，不更新其全量通过数字。

## 4. 本轮真正执行的诊断

来源：三个原始文件按 Git blob SHA 匹配后，在 Linux/Node v22.16.0 上隔离执行。工作流 provider 是预制 mock；测试针对“产品边界能不能拦截错误响应”，不估计真实模型犯错概率。

| ID | 输入/动作 | 实際观察 | 正确解释 |
|---|---|---|---|
| C01 | 正常结构的候选 | 工作流返回，2 次 mock 调用 | 正常控制路径可运行 |
| C02 | 引用不存在事件 | INVALID_SOURCE_REF | 引用存在性防线有效 |
| C03 | Agent事件冒充用户要求 | INVALID_SOURCE_REF | 角色防线有效 |
| G01 | r1 replacedBy r2，r2 replacedBy r1 | 通过结果和工作流校验 | 目标存在性已检查，循环关系未检查 |
| G02 | requirement=INSTANCE，本次30秒；content=所有视频30秒 | 通过工作流 | 中间要求的范围与最终条目没有可机检映射屏障 |
| G03 | 旧客户“客户甲”作为新输入defaultValue | 通过工作流 | 类型合法不等于允许沿用旧客户；发布后create会消费默认值 |
| G04 | 引用“必须注明来源”，最终约束却为“不需要注明来源” | 通过工作流 | 引用合法不等于语义受到支持；不是live模型错误率 |
| G05 | 中间/最终requirements为空，但eventKeys齐全且content非空 | 通过工作流 | coverage证明事件编号完整，不证明关键要求覆盖 |
| G06 | 中间要求scope=ALIEN、sourceKeys不存在 | 进入聚合调用，后者返回合法结果 | 中间步骤没有逐项验证；最终成功不消除内部污染风险 |
| L01 | 单事件24100个ASCII字符，总请求合法 | chunksFor明确报INPUT_TOO_LARGE | 容量边界，不是静默截断；是否升级取决于目标任务 |
| G07 | 本地规则一次输入10条明确约束 | 返回前8条 | 单批WorkState patch存在截断，不等于原始档案被删除 |
| G08 | Agent说“不能声称已完成，实际上还没开始” | 进入completedActions | 分类偏差；文本否定与AGENT_PROPOSED仍保留，不等于实例完成 |

结果总计：3个控制通过、8个缺口/偏差复现、1个明确限制；没有诊断脚本错误。完整 JSON 与控制台在 `results/`。这些结果没有经过 UI 发布、人工确认或真实执行者，不能表述成“用户已经遭遇8次错误交付”。

## 5. 差距的根因与修复优先级

### P1：先补可确定的规则与连接

**中间校验与纠正关系。** 当前 chunk 输出只校验数组和eventKeys；最终replacedBy只验证目标存在。给分块输出添加独立运行时schema；引用只允许本chunk/允许的上下文窗口；拒绝未知scope、重复ID、空关键字段。建立同work协调阶段，检查替代链目标、循环、来源范围与明确纠正证据。跨work差异不能用时间先后自动覆盖。

**最终条目与要求的映射。** 当前Definition条目直接引用事件，却不指向它来自的requirement。先引入内部追踪结构，不必立即重写公共Work对象：每个来源型条目映射到已核验的原子要求ID；已失效、仅本次、未确认提案不能直接变成跨实例硬约束。`INFERRED`可以保留为明确待确认候选，不能偷换成用户明确要求。

**历史参数默认值。** 不靠提示词“别复制”保证。对模型产生的身份/客户/日期/账号等实例参数默认值，默认删除并要求新输入；确有稳定默认要求的情况，需有适用范围与明确依据并经人确认。不要粗暴禁止所有数字或合法稳定常量。已有人工定义兼容策略要由用户确认。

### P2：再补原文依据和语义评估

聚合阶段只看中间改写，且提示词主动要求省略excerpt。短期优先由程序按source/event定位原文片段及相邻上下文，重新附加可信kind/sequence/hash，再交给协调/泛化；不是盲目把所有原文再次塞满context。

逐条检查最终语义是否受原文及有效要求支持。程序能判定ID、范围和生命周期；“意思是否相反/过度泛化”需要语义评估与人工校准。模型评审可返回 supported/contradicted/uncertain，但其评分不是人的确认，不能凭同一模型自评放行。

先测试“补原文锚点＋连接规则”是否足够，再决定是否为疑难候选增加额外核对调用，不预设每项都必须增加一个昂贵Agent。

### P3：按宣传范围处理状态提取

若本轮要宣传接力，则补本地单批前8条丢失及否定完成分类的回归；检查最终交接格式是否保留来源与不确定性。可以限制界面展示条数，但不能把展示限制静默变成提取内容丢失。云端WorkState路径需另测，不因本地修好就宣称两条路径都好。

若第一轮只测试Definition复用，可将状态提取作为单独未完成范围，不把它与B路径混为同一个模型问题。

### 条件项：长事件分段

单条文本超24KB当前明确拒绝，行为比静默丢弃可靠。若目标真实样本超出限额，再做按段/消息分片、父事件ID＋区间＋哈希定位、相邻上下文窗口和全覆盖去重。必须维持预算、取消和重试限制，不能通过无限扩context修复。

## 6. 和上版验收如何对应

| 原要求 | 当前判断 | 开始最终阶段前要补什么 |
|---|---|---|
| V1 原始可信率95%、关键覆盖90% | **未测**；coverage字段不能充当该结果 | 授权真实语料、人确认gold、逐项语义评分 |
| E05 引用/角色 | 部分防线本轮控制通过 | 中间要求校验、原文支持、错误关系回归 |
| E06 临时例外/被否定建议 | Prompt和类型有表达；缺少完整跨阶段强关联 | 生命周期/范围映射及最小反例与真实用例 |
| E08 版本隔离 | 已有实现及现有测试 | 在实际完整仓库复跑；新schema不破坏旧版本 |
| E09 新旧实例隔离 | 清空旧状态已有实现 | 加坏定义默认值/泛化污染端到端测试 |
| V2 实际复用收益 | **未测** | 算法冻结后，真实新输入与人工总成本对照 |
| V4 接力 | 当前状态路径有已复现偏差 | 修复或收窄宣传；真实目标环境验收 |
| V6 自然再次使用 | **未测且不能由Agent生成** | 外部真实机会与使用行为 |

## 7. 依据与复查入口

下列文件均在上方固定main提交读取；实验分支相同核心树支持同样的源码审计。运行结果另见本包日志。

- `src/app/app-service.ts`：`https://github.com/TobeALeg/worket/blob/17f045c7f274e7e06e1e488f59bbd3423227beac/src/app/app-service.ts`
- `src/extractor/local-rule-extractor.ts`：`https://github.com/TobeALeg/worket/blob/17f045c7f274e7e06e1e488f59bbd3423227beac/src/extractor/local-rule-extractor.ts`
- `src/extractor/openai-compatible-extractor.ts`：`https://github.com/TobeALeg/worket/blob/17f045c7f274e7e06e1e488f59bbd3423227beac/src/extractor/openai-compatible-extractor.ts`
- `src/distillation/service.ts`：`https://github.com/TobeALeg/worket/blob/17f045c7f274e7e06e1e488f59bbd3423227beac/src/distillation/service.ts`
- `server/workflow.mjs`：`https://github.com/TobeALeg/worket/blob/17f045c7f274e7e06e1e488f59bbd3423227beac/server/workflow.mjs`
- `src/contracts/definition.ts`：`https://github.com/TobeALeg/worket/blob/17f045c7f274e7e06e1e488f59bbd3423227beac/src/contracts/definition.ts`
- `src/definitions/repository.ts`：`https://github.com/TobeALeg/worket/blob/17f045c7f274e7e06e1e488f59bbd3423227beac/src/definitions/repository.ts`
- `src/definitions/work-package.ts`：`https://github.com/TobeALeg/worket/blob/17f045c7f274e7e06e1e488f59bbd3423227beac/src/definitions/work-package.ts`
- `server/evaluate.mjs`：`https://github.com/TobeALeg/worket/blob/17f045c7f274e7e06e1e488f59bbd3423227beac/server/evaluate.mjs`
- `test/distillation/core.test.ts`：`https://github.com/TobeALeg/worket/blob/17f045c7f274e7e06e1e488f59bbd3423227beac/test/distillation/core.test.ts`
- `test/distillation/server.test.ts`：`https://github.com/TobeALeg/worket/blob/17f045c7f274e7e06e1e488f59bbd3423227beac/test/distillation/server.test.ts`

方法参考：Anthropic《Demystifying evals for AI agents》，2026-01-09，`https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents`。这里只借鉴区分任务/尝试/真实结果、回归与能力评估、机器与人工评审。具体阈值、Agent数量、迭代上限均是本项目建议，不是该文给出的统一要求。
