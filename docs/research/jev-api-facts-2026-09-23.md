# Jev API 事实核查：Worket 中间判断接入前提

核查日期：2026-09-23。仅查阅 TypeSafe 官方文档与政策；**未实际调用 API、未安装 SDK、未读取或发送 Worket 用户记录与密钥**。以下示例是按官方 schema 编写的演示，不是实测结果。本文件只核查外部接口与边界，不代表已经批准或实现接入。

## 1. HTTP 契约

评估入口为 `POST https://api.typesafe.ai/v1/systemone`，使用 `Authorization: Bearer <API_KEY>` 与 JSON 请求体。必填顶层字段是 `state`、`model`、`questions`。`questions` 是自定义 ID 到问题的映射；响应在相同 ID 下返回答案。**问题 ID 不参与推理**，判断条件必须写进 `instructions`。来源：[API reference](https://docs.typesafe.ai/api)、[Primitives](https://docs.typesafe.ai/primitives)。

三类问题都包含 `type`、`instructions`；后者可为字符串、对象或数组：

| 类型 | `criteria` | 返回字段与含义 |
| --- | --- | --- |
| `choice` | 必填选项映射；描述可为字符串、对象、数组或 `null`；最多 255 项 | `type`、`choice`、`probabilities`、`confidence`；`choice` 为最高概率选项，概率之和为 1 |
| `score` | 必填、有序的等级描述数组；应至少 2 级，最多 10 级 | `type`、`score`、`legend`、`probabilities`、`confidence`；等级从 0 开始，`score` 为等级编号的概率加权均值 |
| `noul` | 可选的 `true` / `false` 描述 | `type`、`noul`；`noul` 为回答 yes 的概率，范围 0–1，**没有独立 `confidence`** |

来源：[Choice](https://docs.typesafe.ai/primitives/choice)、[Score](https://docs.typesafe.ai/primitives/score)、[Noul](https://docs.typesafe.ai/primitives/noul)。

一个可发送的请求体形状，内容完全虚构：

```json
{
  "model": "jev-1.13.0",
  "state": {
    "candidate": "每周把已确认的客户问题整理成内部周报。",
    "evidence": ["每周五整理一次，只使用已确认的问题。"]
  },
  "questions": {
    "evidence_support": {
      "type": "choice",
      "instructions": "仅依据 evidence，candidate 是否得到支持？",
      "criteria": {
        "supported": "证据明确支持候选陈述的全部核心内容",
        "contradicted": "证据明确反驳候选陈述的核心内容",
        "insufficient": "证据缺失、含糊或只支持部分核心内容"
      }
    }
  }
}
```

响应顶层是 `model`、`answers`、`usage`；其中 `model` 报告实际执行版本，`usage` 包含 `input_tokens`、`output_tokens`。下面以类型占位说明结构，**不是有效 JSON 或实际响应**，也没有为示例虚构概率与 confidence：

```text
{
  model: string,
  answers: {
    evidence_support: {
      type: "choice",
      choice: "supported" | "contradicted" | "insufficient",
      probabilities: { supported: number, contradicted: number, insufficient: number },
      confidence: number
    }
  },
  usage: { input_tokens: integer, output_tokens: integer }
}
```

来源：[HTTP response body](https://docs.typesafe.ai/api#response-body)、[JavaScript SystemOneResult](https://docs.typesafe.ai/sdk/javascript/api/interfaces/SystemOneResult)。

HTTP 文档列出 `401` 鉴权失败、`422` 请求校验失败、`429` 限流和 `529` 过载；对后两者建议指数退避，默认 SDK 会处理重试。具体超时与失败后的业务回退仍由应用负责。来源：[API errors](https://docs.typesafe.ai/api#errors)。

## 2. 概率与 confidence 的正确解释

- **confidence 是分布的派生统计。** Choice/Score 的概率越集中，通常 confidence 越高；它不是另一个独立验证器，也不能写成“答案有 X% 准确率”。当前 Confidence 页未给出精确计算公式。阈值需要用自身领域数据评估，官方示例阈值不是 Worket 的验收标准。来源：[Confidence](https://docs.typesafe.ai/confidence)。
- **Noul 表示命题为真的概率，不表示程度。** 接近 0.5 表示 yes/no 接近，不能解读为“中等强度”。二元条件可由代码设置接受、拒绝、复核区间；对程度分层应使用 Score。来源：[Reading a Noul](https://docs.typesafe.ai/primitives/noul#reading-a-noul)。
- **Score 不是精确数值提取。** 同一均值可能来自完全不同的分布；应保留 `probabilities` 和 `confidence`。等级必须以可独立理解的情形描述，不能只有数字或“比上一级更高”。来源：[Reading a Score](https://docs.typesafe.ai/primitives/score#reading-a-score)、[Writing good levels](https://docs.typesafe.ai/primitives/score#writing-good-levels)。
- **Choice 只能在给定选项中判断。** 候选项不穷尽时，官方要求补 `other` / `none of the above` 等出口；高 confidence 也无法补回代码漏掉的正确选项。来源：[Choice good practice](https://docs.typesafe.ai/primitives/choice#good-practice-ask-more-than-one-question-per-call)。
- **不同问法不能套用同一数学关系。** 官方指出 Noul 与 yes/no Choice 不保证数值相同；正反两个 Noul 不保证和为 1；在 Noul 上调好的阈值不能直接搬到 Choice。Choice 是候选之间的相对选择，多个 Noul 则可能全部很低。来源：[Structural invariants](https://docs.typesafe.ai/model-jaggedness/jev-1.13#common-sense-structural-invariants)。

## 3. state、批处理与持久状态

`state` 是本次要判断的材料，可用文本、JSON 对象或数组组织事实与上下文。Jev 当前仅接收文本；图像、音频和视频需要先转为文本或结构化字段。**同次请求中的问题共享 state，但独立评估；前题答案不会成为后题的隐藏上下文。** 来源：[State](https://docs.typesafe.ai/concepts/state)。

应用可以把同一批材料的多个独立判断一起发送；如果某个分支不适用，代码忽略相应答案。如果前题结果决定必须新取哪些证据、重构什么 state 或提供哪些候选项，才需要第二次请求。来源：[When one question depends on another](https://docs.typesafe.ai/primitives#when-one-question-depends-on-another)、[Speculative fan-out](https://docs.typesafe.ai/patterns/fan-out)。

当前 `jev-1.13.0` 限制为：请求总计 64k tokens；`state` 加最长的单个问题不得超过 32k tokens。英语为主要训练语言，官方明确其他语言（包括 CJK）准确性较弱，需用自己的中文材料验证。`jev-latest`、`jev-preview` 当前均指向 `jev-1.13.0`；别名会移动，调过阈值后可固定版本并记录实际响应版本。来源：[Models](https://docs.typesafe.ai/models)。

**未确认的持久化能力：**公开 HTTP schema 与 JS 请求接口未列出 session、conversation、state ID、保存/复用 state 的操作或缓存开关。本轮也未找到跨请求缓存的命中语义、有效期、计费折扣或一致性说明。因此只能按“每次显式提交所需 state”设计；单请求内共享 state 不等于服务端跨请求记忆或缓存。来源：[API](https://docs.typesafe.ai/api)、[SystemOneRequestPayload](https://docs.typesafe.ai/sdk/javascript/api/interfaces/SystemOneRequestPayload)、[官方文档索引](https://docs.typesafe.ai/llms.txt)。这是对公开资料的核查范围说明，不是证明服务内部不存在缓存。

文档小差异：HTTP/State 页列字符串、对象、数组，而 JS `SystemOneRequestPayload` 还列出 `null`。未实测服务端对空 state 的校验；接入前不应据 SDK 类型推断 HTTP 必然接受。来源：[State](https://docs.typesafe.ai/concepts/state)、[SystemOneRequestPayload](https://docs.typesafe.ai/sdk/javascript/api/interfaces/SystemOneRequestPayload)。

## 4. 可靠性边界

官方对 Jev 1.13 的已知限制包括：字面理解、复杂间接推理较弱；计数、算术和日期比较不可靠；无关长上下文影响准确性；state 中的诱导指令可能改变结果；矛盾的 instructions/criteria 会干扰判断；不适合自由文本生成。应让代码计算精确值、裁剪证据并执行约束，模型只负责语义判断。来源：[Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13)（页面标注复核于 2026-09-17）。

这意味着 Worket 不能把“输出类型合法”升级为“事实成立”，也不能用高置信度绕过用户授权、来源约束或代码层的业务规则。以上是本次研究对接入设计的推论，不是已经实现的防护。

官方客户协议也明确输出可能不准确、需客户独立评估，且不保证服务不中断或无错误；本轮未获得 Worket 负载下的可用性或确定性实测。来源：[Master Customer Agreement §9.3](https://typesafe.ai/legal/mca)。

## 5. 数据处理：不训练不等于不留存

| 项目 | 官方材料能确认的内容 | 本轮边界 |
| --- | --- | --- |
| 训练 | 模型页称不使用客户请求/响应训练；隐私政策承诺不以 Input 训练或微调 | 不能因此推定不存储或不作其他处理 |
| 默认留存 | DPA Schedule I §8 与隐私政策 Retention 按处理目的、合理必要性和法律确定期间 | 未找到固定默认天数或请求后立即删除承诺 |
| ZDR | Legal 页称企业客户可联系申请零留存 | 未确认一般账户默认开启，亦未核实具体企业合同 |
| 区域 | 隐私政策称服务在美国托管，并说明美国存储/处理 | 未确认可选地区或客户专属区域 |
| 遥测 | MCA §4.1、§4.3 另列生成遥测、反滥用与法定处理；遥测包括日志、哈希、统计等 | 不能把“不训练”写成“不保留任何派生数据” |

逐项来源：[Models — Data handling](https://docs.typesafe.ai/models#data-handling)、[Privacy Policy — Services / Retention / International Visitors](https://typesafe.ai/legal/privacy-policy)（页面日期 2025-11-19）、[DPA — Schedule I §8](https://typesafe.ai/legal/data-processing)（页面日期 2026-04-24）、[Legal — ZDR](https://docs.typesafe.ai/legal)、[MCA §4](https://typesafe.ai/legal/mca)。这里只描述公开条款，不推定某一账号已经取得额外条款。

对 Worket 的设计推论：候选与证据送往 Jev 仍是一次外部数据发送，需沿用 Worket 的授权、最小化与来源控制。持久业务状态、证据索引和评估记录应由 Worket 自己维护；不能依赖 Jev 提供工作记忆。

## 6. 价格、延迟与尚未实测项

官方模型页当前列价为每百万输入 tokens **$0.042**，输出 tokens 免费；公布限流为 250,000 tokens/秒、1,200 请求/分钟，并说明限额可能动态变化。批内 state 只摄入一次，额外问题仍消耗 tokens。来源：[Models](https://docs.typesafe.ai/models)。

官方说明同 state 的并行问题通常对延迟影响较小，但这不是 Worket 网络路径、中文材料或高负载下的时延承诺。本文不把 cookbook 单个示例的加速比推广为普遍 SLA。来源：[Speculative fan-out](https://docs.typesafe.ai/patterns/fan-out)。

仍待授权后的独立验证：中文分类/证据支持的真实误判率；各版本与问题措辞下的阈值；缺项、注入及反例表现；端到端 p50/p95 延迟和超时；实际账单 tokens；账号实际限额；默认留存与 ZDR 可用条件。当前没有精度、节费或可上线结论。
