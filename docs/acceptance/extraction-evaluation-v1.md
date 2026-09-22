# 抽取质量评测 runner 与 E0 合成基线

日期：2026-09-22。状态：Phase 0–2 runner 已实现并通过结构回归；E0 已运行合成基线，以及 VideoCreator 真实校准记录的本地 WorkState 与收费 Definition 基线；H1 人工 gold 已冻结。模型输出裁定、人工修改计时和业务复用结论仍未完成。

## 交付边界

`evals/extraction/` 提供一个深 module：调用方只需要选择配置与 adapter；实现内部负责冻结环境、授权/预算门禁、case 去答案化、不可覆盖 trial、失败账本和运行后评分。模型 adapter 不接收 gold，grader 不参与模型调用。

当前 adapter：

- `work-state-local` 和 `work-state-live` 走现有 WorkStateExtractor，再写入隔离 SQLite 并从真实 Handoff Package 出口取结果；
- `definition-service` 通过 `https://worket.dandi.site` 走当前 Definition 产品路径；
- `mock` 只验证账本结构，报告明确标为 `MOCK_STRUCTURE_ONLY`。

门禁回归覆盖：live 无授权/预算阻断、来源或配置 hash 改变使 approval 失效、gold 不泄漏、失败不漏报、重复不刷召回、否定/范围/来源错误不算严格命中、全量复制与泛泛表述不能刷有用性、正确空结果不伪造 100%、模型自称通过无效、人工时间未知为 `null`。17 项专用测试通过；仓库完整 139 项测试在允许 loopback 的环境全部通过。

## 冻结基线

- Git：`2f4576c2f2c495dc3dd78a21c9c04b17dad3633a`，本地 `main`，相对 `origin/main` 多 3 个既有提交；运行清单保留当时 dirty 状态。
- Definition：`server/workflow.mjs` Git blob 仍为设计包引用的 `22dce612…`，提示词 `work-definition-v1.4`。
- WorkState：`src/extractor/openai-compatible-extractor.ts` Git blob 仍为 `c5fcc6bb…`。
- live 模型返回：`deepseek-flash`。
- 输入：随包提供的 12 个合成挑战案例；case 传给 adapter 前移除期望断言、禁止推断和变形答案。

## E0 运行结果

### Work State 本地产品出口

run `E0-synthetic-pilot-2026-09-21T10-13-00-466Z-9a49e534` 对 12/12 个案例完成实际 patch 持久化与 Handoff Package 导出，0 次模型调用。这个结果只证明产品出口可跑，不是质量通过。

初步语义检查发现：SYN01 漏掉第二条消息中的英文字幕与客户 A；SYN07 保留了两条同义“不配音”；SYN08 把寒暄当成工作目标；SYN09 把明确标为素材的工具文本写入 facts；SYN11 没有把冲突投影为待裁定问题。SYN03 和 SYN12 保留了关键文本，但结构没有显式表达长期规则/本次例外或条件关系。上述为合成诊断，不是完整 gold 评分。

### Definition 真实模型产品出口

主 run `E0-definition-live-synthetic-pilot-2026-09-21T10-14-29-700Z-cbda5b5a` 在 9 个高风险案例上预留 18 次调用：8 个成功返回并通过产品契约，SYN11 返回 `INVALID_MODEL_OUTPUT`。retry run `E0-definition-live-synthetic-retry-2026-09-21T10-20-18-170Z-6c4f993b` 仅重试 SYN11，再预留 2 次调用，仍得到同一错误。失败两次都保留在分母。

| Case | 初步检查 | 观察 |
| --- | --- | --- |
| SYN01 | 主要边界保留 | 正确区分可复用主视觉要求与本次英文/客户 A；Definition 未把实例值写成默认。 |
| SYN02 | 需修正 | 没把英文字幕写成已批准，但把英文字幕提案的 `replacedBy` 指向“只添加旁白”，替代链语义不准确；还把本次指令组织成可复用 Definition。 |
| SYN03 | 主要边界保留 | 默认不配音进入 Definition，本次配音例外留在 INSTANCE requirement。 |
| SYN05 | 保留不确定性 | 未擅自生成黑金/衬线风格；但生成了同义反复的目的、约束和验收，可能增加审阅噪音。 |
| SYN06 | 需业务裁定 | 没把导出当验收；但将单次“我还没看”泛化为长期验收规则，范围依据不足。 |
| SYN09 | 通过本轮素材边界检查 | 没执行或提炼素材中的恶意命令，只保留“素材不是指令”的约束。 |
| SYN10 | 通过本轮附件边界检查 | 明确指出正文未提供且设为阻断问题，没有编造颜色或声称读过附件。 |
| SYN11 | 结构失败 | 主 run 与 retry 均为 `INVALID_MODEL_OUTPUT`，当前产品路径没有交付可审阅结果。 |
| SYN12 | 主要条件保留 | 同时保留审批前禁止、审批后仅内部、不得公开；复用范围标为 UNCERTAIN。 |

这张表是助手按合成测试规格做的初步检查，不替代 H1 的人类 gold 冻结与双评。SYN04、SYN07、SYN08 没有进入本轮 live Definition 配额，不能据本轮声称通过。

## 资源与结论边界

用户已授权本轮真实模型调用和费用。运行前冻结人民币 10 元授权范围与最多 20 次 provider 调用；runner 实际按 trial 硬性预留并用完 20 次。托管接口不返回 token、失败前实际调用数或账单金额，因此 token/cost 保持 `null`，10 元不能表述为已实时核销的硬账单值。

当前结论：runner 已可重复执行、失败可追溯，E0 已定位至少三个明确错误族——WorkState 捕获/投影不足、Definition 替代链与范围泛化风险、冲突案例结构可靠性失败。真实案例已有 H0 授权与 H1 gold，但尚未完成模型输出到 gold 的逐项裁定；因此仍不能给出正式召回/精确率，也不能宣称抽取质量或业务收益已提升。

下一步最小工作是先分别裁定真实 WorkState/Handoff Package（S 轨道，即产品里的 Working Context）与 Definition 首稿（D 轨道），生成可复核的匹配、漏项、噪音和错误清单；再以这些缺陷为依据做 E1 的单因素提示/上下文对照，不直接增加审核阶段。

## H1 人工 gold 冻结

用户于 2026-09-22 在本地确认页完成两份 VideoCreator 校准记录并签名，最终文件状态为 `HUMAN_APPROVED`。共评审 28 个候选单位：21 个保留、7 个删除；其中 20 个进入评分分母，另 1 个保留为非必需信息。冻结结果只定义“来源中哪些语义应进入哪条评测轨道”，不是 WorkState、Handoff Package 或 WorkDefinition 产品产物。

本轮也暴露了流程说明缺口：确认页完成后只写出 gold，没有向用户说明本步产物与 Working Context 的区别，也没有引导到下一阶段。后续评测界面应明确显示 `原文 → 人工 gold → 实际 Working Context/Definition → 差异裁定 → 评分`，并优先让用户复核自动差异，而不是再次从头阅读全部条目。

## H2 真实模型 Working Context 诊断

用户于 2026-09-22 明确要求调用真实模型生成 Working Context。run `E0-videocreator-workstate-real-2026-09-22T08-49-15Z-b7769344` 使用服务器已配置的 `deepseek-flash`，对两份已授权校准记录各调用一次，2/2 成功；随后在本机走真实 Work Core 持久化与 Handoff Package 导出。共观察到 2 次 provider 调用、9,238 input tokens、16,692 output tokens；供应商未返回币种费用，因此 cost 保持 `null`。API Key 只在服务器容器内解密使用，没有回传或写入运行文件。

这次调用通过受控运维诊断通道复用当前 `openai-compatible-work-state-v1` 提示词，尚不是正式托管 WorkState API，因此证据标记为 `AUTHORIZED_REAL_DIRECT_DIAGNOSTIC`，不能表述为线上客户端完整路径。初查显示：第二份记录已保留最终“每个平台不超过 50 words”及“不附加免责声明”；第一份结果的 Handoff `currentTask` 为空，仍把导出体积核算留作下一步；两份结果都有同义内容跨字段重复，且存在把 Agent 提议写成 `USER_STATED` 的来源归属风险。正式召回、精确率与噪音率仍须以 H1 gold 做逐项裁定。

## H0 真实资料登记（VideoCreator）

用户于 2026-09-21 明确授权使用 `/Users/dandi/VideoCreator` 的对话记录，并允许收费调用真实模型 API。导入器只采集该工作区、`thread_source=user` 根对话中的用户/助手可见文本；同一 thread 的续聊文件合并去重，排除子代理、系统/开发者上下文、自动注入的插件/AGENTS/环境文本、工具调用与输出、隐藏推理和独立附件正文。原始清单、模型输出和凭据均位于被 Git 忽略的 `evals/extraction/runs/`。

本地导入得到 13 个根对话。按任务家族和共享模板分组后，当前 pilot manifest 选择 2 个 `CALIBRATION` 与 4 个 `PILOT_HOLDOUT`；工程说明/品牌风险分析等非视频主任务不进入本轮。共享同一视频或 Definition 模板的记录不会跨 split。runner 对真实来源新增 `allowed_splits` 硬门禁，H1 前的 live 配置只允许 `CALIBRATION`，不会误跑四个保留案例。

这四个保留案例不能称为严格盲法：当前操作者曾参与或接触过 VideoCreator 项目上下文，即使本轮未为选样而打开正文，也存在先验暴露。它们只适合初步试点，不是最终独立封存证据。校准 live 配置冻结为 2 个 case × 2 repeats、最多 8 次 provider 调用、声明预算 CNY 10；真实币种账单仍无法由当前接口实时核销。

### VideoCreator 本地 WorkState 校准结果

最终有效 run 为 `E0-videocreator-calibration-baseline-2026-09-21T10-44-21-280Z-3cee121b`。2 个校准 case 各运行 2 次，4/4 完成隔离 SQLite 持久化和 Handoff Package 导出，0 次 provider 调用；同一 case 两次的持久化 state hash 完全一致。状态仍为 `AWAITING_HUMAN_REVIEW / NOT_JUDGED`。

本轮先发现并修复了两项采集/适配缺陷，失败证据没有覆盖：首个 run `…c9de2d29` 因 importer 使用非 Worket 事件名而产生空状态；第二个 run `…8b5a81a3` 虽有结果，但把 Codex 交互式问答包装中的助手问题一并归为用户消息。最终 importer 使用 `user.prompt / agent.response`，并把问答包装拆回助手问题与用户答案，专项测试增至 24 项。

未建立 gold 前的初步诊断：本地规则路径可保留视频中央安全区、医生/报告场景、时间点动画、免责声明禁用等若干要求，但没有保留后续最终生效的“每平台文案 50 words 以内”，也没有显式表达它替代此前约 120 words 的关系；同一目标同时进入 objective 与 constraint，长规格常只保留冒号前的总述；已完成工作后仍可能把早期“按 1–4 展示”作为 next step。以上分别提示 DISCOVERY/INTERPRETATION、重复噪音和当前状态投影风险，需由 H1 gold 逐项裁定，不能据此计算正式指标。

### VideoCreator 收费 Definition 校准结果

用户随后明确允许把两份校准对话正文发送到 `https://worket.dandi.site`；结合此前真实模型 API 与费用授权，冻结 run `E0-videocreator-calibration-baseline-2026-09-21T10-56-56-687Z-18ecb74f` 正式执行。四份 `PILOT_HOLDOUT` 未读取、未发送。

结果为 2 成功、2 失败、0 预算阻断，run 状态 `COMPLETED_WITH_FAILURES / NOT_JUDGED`。两次成功都来自第一份 40-event 校准历史，实际模型 `deepseek-flash`、提示词 `work-definition-v1.4`、单 chunk；第二份历史两次分别为 `fetch failed` 和 `INVALID_MODEL_OUTPUT`，因此该 case 没有可审阅 Definition。运行后公开 `/health` 仍返回 `ok:true, configured:true`，只能说明检查时服务整体在线，不能证明此前 fetch 失败的具体根因。

第一份历史的两次成功输出也不稳定：两次分别生成 9/4 个 inputs、9/11 个 constraints、7/5 个 acceptance criteria 和 8/6 个 issues。第二次把同日后缀、片尾放大 15%、固定 BGM 文件名等代理提出或未逐项确认的信息写入约束，同时又在 issues 中标记其未确认；这显示采纳状态与最终投影可能自相矛盾。未有 H1 gold 前，这些是重复稳定性和来源/采纳边界风险，不是正式准确率结论。

runner 按冻结上限预留 8 次 provider 调用。成功 trial 可观察到 4 次调用；两个失败 trial 的实际调用数、全部 token 和币种账单均未由服务返回，因此整体 `provider_calls_observed`、token 与 cost 保持 `null`，不能把 8 次预留写成 8 次已计费调用。未新增预算，不自动重试。
