# Worket 抽取评测 runner

这个目录实现 `worket_extraction_experiments_v1` 的 Phase 0–2：冻结运行环境、阻断未授权 live 调用、通过现有产品出口运行 trial，并把评分与模型执行隔离。

## Interface

```bash
npm run eval:extraction:test
npm run eval:extraction -- import-codex --sessions-root /path/to/sessions --authorized-cwd /path/to/authorized/project --authorization-ref USER-YYYY-MM-DD --output evals/extraction/runs/imports/<id>/cases.jsonl --inventory evals/extraction/runs/imports/<id>/inventory.json
npm run eval:extraction -- curate --source <imported-cases.jsonl> --plan <local-plan.json> --output <curated-cases.jsonl>
npm run eval:extraction -- preflight --config evals/extraction/manifests/synthetic-template.json
npm run eval:extraction -- run --config <local-config.json> --adapter work-state-local
npm run eval:extraction -- run --config <local-config.json> --adapter definition-service --approval <approval.json>
npm run eval:extraction:review -- --source <source-cases.jsonl> --draft <review-draft.json> --output <human-approved-gold.json>
npm run eval:extraction -- grade --run <run-directory> --gold <gold.json> --adjudication <adjudication.json>
```

`run` 不接受 gold 参数。它先把 case 中的 `expected_semantic_assertions`、`forbidden_inferences` 和变形答案剥离，再把最小输入交给 adapter。`grade` 是独立命令，只读取已封存 trial。

`import-codex` 只接受显式授权工作区下、`thread_source=user` 的根对话；同一 thread 的续聊文件按可见消息去重合并，并输出 Worket 原生 `user.prompt / agent.response` 事件。Codex 的交互式问答包装会拆回助手问题与用户答案，避免来源错归。它只导入用户与助手的可见文本，排除自动注入的插件/AGENTS/环境上下文、子代理、系统与开发者消息、工具调用及输出、隐藏推理和独立附件正文。导入结果初始为 `split=UNASSIGNED`，不能在未记录分组与盲法状态前冒充封存集。

`curate` 用本地计划登记 `split`、近重复/共享模板 `group_id` 与盲法状态，并阻断同组跨 split。计划和真实清单必须留在被忽略的本地路径；四份试点保留集在 H1 前不运行、不查看正文。曾参与这些历史工作的操作者即使本轮不打开正文，也必须将其标成非严格盲法，不能作为最终独立封存证据。

`eval:extraction:review` 启动只监听本机的 [H1 人工确认页](review/README.md)。页面从任意 source case JSONL 自动读取案例与原始可见消息，再把独立 review draft 填入表单；同一界面可用于本轮两份校准记录和后续测试。草稿可反复保存，最终 gold 只有所有单位完成确认、证据可在同案原文精确定位且评审人签名完整时才会写入，并且不会覆盖已有最终文件。source、draft、output 都应放在被忽略的 `runs/` 下。

## Adapter

- `work-state-local`：调用当前 `LocalRuleExtractor`，将 patch 写入隔离 SQLite，再从真实 `createHandoffPackage()` 出口取结果。不调用模型。
- `work-state-live`：调用当前 `OpenAICompatibleExtractor`，同样走隔离持久化与交接出口。只从运行环境读取 `WORKPET_LLM_*`，不记录密钥。
- `definition-service`：通过 Worket 托管服务调用当前 Definition 真实路径，轮询并保存原始结果。使用独立匿名安装凭据，凭据文件权限为 `0600` 且位于被忽略的 `runs/`。
- `mock`：只验证账本、失败和评分结构；不能标记为真实结果。

## 不变量

- live 必须同时具备授权引用、明确数据范围、正数预算、调用/token 上限和与当前输入 hash 完全一致的 approval 文件。
- 授权真实来源必须冻结 `allowed_splits`；runner 会阻断误选试点保留集，H1 前的校准运行只允许 `CALIBRATION`。
- 每次运行和重试都创建新目录；现有 trial 不覆盖。
- provider 失败、预算阻断和人工时间未知都进入账本，分别记为 `FAILED`、`BLOCKED` 和 `null`。
- synthetic/mock 永远不能记为 real；结构测试成功不能写成语义质量通过。
- 调用上限按 trial 预留并硬性阻断；token 或账单未由 provider 返回时写 `null`，不推断为 0，也不把声明的币种预算误称为已核销金额。

`runs/` 可能包含授权输入、原始模型输出和匿名接入凭据，默认不入 Git。
