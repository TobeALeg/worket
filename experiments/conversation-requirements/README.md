# 会话 → 工作要求：独立研究实验

Node.js 22+，无第三方运行依赖。默认使用用户确认的 **DeepSeek V4.1 Flash**（`deepseek-flash`）；2026-09-10 官方已将 V4 Flash 下线并重定向，不能把本实验标为 V4 Flash 原版结果。

## 运行

在仓库根目录，向进程环境配置 `DEEPSEEK_API_KEY`。不要把密钥写进代码或提交。

```sh
# 导入一份明确选择的本地 Codex 会话；输出包含私人内容，放在忽略目录
node experiments/conversation-requirements/import-codex.mjs /absolute/session.jsonl output/my-work.json '本次工作的范围'

# 分层提取并审阅，生成 JSON、可读 Markdown 和运行记录
node experiments/conversation-requirements/cli.mjs output/my-work.json output/requirements.json verified

# 合成开发集，分别跑基线和增强方案
node experiments/conversation-requirements/benchmark.mjs experiments/conversation-requirements/data/dev.json output/dev-direct direct
node experiments/conversation-requirements/benchmark.mjs experiments/conversation-requirements/data/dev.json output/dev-verified verified

# 程序契约测试，不调用模型
node --test experiments/conversation-requirements/test/*.test.mjs
```

也可以直接提供标准 WorkRecord JSON，适配其他会话来源。所有可见消息按原顺序提供；`work.instanceId` 由调用方确定，同一工作跨会话沿用身份。不能把不相关的会话拼成同一个实例。数据格式见 [开发集](data/dev.json)。导入器不读取附件或截图，不采集隐藏推理、系统指令、审批子任务或子代理通知。内置脱敏只覆盖常见密钥、邮箱、本机用户名；不保证消除所有个人或商业信息。输入正文和引用会发送给配置的模型供应商。

`DEEPSEEK_BASE_URL` 可配置 HTTPS 兼容端点，默认官方地址；模型固定为本实验已确认版本。`WORKET_RESEARCH_THINKING=true` 开启 high 思考模式，默认关闭并使用 temperature 0。每次模型响应保留 model/response ID/usage/请求哈希，内部推理不保存。模型名变化、截断、格式错误、缺失证据和服务失败显式报错，无假模型兜底。非法 JSON 最多进行两次明确的语法重试，保留失败回答与用量；基线与增强方案拥有同样的一次契约修复机会，额外调用计入成本。

## 对象与模块

```text
WorkInstance
  ├─ WorkRecord（冻结的可见消息与来源哈希）
  ├─ WorkAnalysisRun（本次提炼运行、模型身份、调用与版本）
  └─ WorkRequirementsDraft（本次工作要求、变更历史、待澄清项）
           └─ 用户确认/跨实例泛化后才可能形成 DefinitionDraft（本实验不发布）
```

这是关系上的派生，未用一个抽象基类让所有数据继承 Work。运行是处理该工作的执行记录；候选是工作记录的可追溯产物。现有 `WorkDefinition → WorkInstance → WorkRecord` 保持不变。本研究不接入 UI、数据库或应用的沉淀发布流程。

- `extractRequirements(record, provider, options)` 是核心入口，返回 `{draft, run}`。
- `extractor.mjs` 编排程序编号原文片段 → 完整证据窗口 → 工作级整合 → 原文审阅；`direct` 是一次直接提取基线，`structured` 是去掉最后审阅的消融方案；`grounded` 在直接提取后进行用户陈述、问题与确认范围的专门来源核验。
- `contracts.mjs` 校验身份、来源、原文片段及UTF-16位置和状态关系；不以结构合法冒充语义正确。
- `provider.mjs` 集中 API 调用、超时、重试及用量。
- `evaluate.mjs` 用独立评审提示和预先标注的 gold 测语义；评审仍是同一个模型，最终需人工核验。

## 实验纪律

合成数据是自主构造的诊断集，参考相关研究的难点；不是原 benchmark，也不代表真实用户分布。`data/manifest.json` 冻结开发/测试集。真实样本源自一个明确授权的用户，原文、gold 和逐条结果留在本地忽略目录，仓库仅保存清单和脱敏统计。测试集在最终版本冻结后运行；用于调参的失败样本只能记为开发证据。

指标同时报告正向要求/澄清召回、错误规则、未解决冲突、原文来源与多余问题。按要求槽位标注而不是要求模型复述固定字符串。观察者人工审阅与机器评审分开，不能将同模型自评分视为独立真实用户验收。报告应公开所有失败、额外调用、样本量和下游实验结果。

## 额外验证

```sh
# 独立重算原文哈希、引用和位置
node experiments/conversation-requirements/verify-evidence.mjs output/my-work.json output/requirements.json
# 同一模型的配对下游订单交付实验（不执行模型生成的代码）
node experiments/conversation-requirements/downstream.mjs output/downstream
```

下游实验比较初始模糊请求、完整会话、提炼后的要求。第一组缺少后续澄清信息，因此只能支持信息明确性的观察；完整会话才是信息相同的对照。

当前开发诊断与所有失败的背景见 [迭代记录](../../docs/research/conversation-requirements-iteration-log.md)。
