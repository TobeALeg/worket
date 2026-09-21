# Worket 抽取评测 runner

这个目录实现 `worket_extraction_experiments_v1` 的 Phase 0–2：冻结运行环境、阻断未授权 live 调用、通过现有产品出口运行 trial，并把评分与模型执行隔离。

## Interface

```bash
npm run eval:extraction:test
npm run eval:extraction -- preflight --config evals/extraction/manifests/synthetic-template.json
npm run eval:extraction -- run --config <local-config.json> --adapter work-state-local
npm run eval:extraction -- run --config <local-config.json> --adapter definition-service --approval <approval.json>
npm run eval:extraction -- grade --run <run-directory> --gold <gold.json> --adjudication <adjudication.json>
```

`run` 不接受 gold 参数。它先把 case 中的 `expected_semantic_assertions`、`forbidden_inferences` 和变形答案剥离，再把最小输入交给 adapter。`grade` 是独立命令，只读取已封存 trial。

## Adapter

- `work-state-local`：调用当前 `LocalRuleExtractor`，将 patch 写入隔离 SQLite，再从真实 `createHandoffPackage()` 出口取结果。不调用模型。
- `work-state-live`：调用当前 `OpenAICompatibleExtractor`，同样走隔离持久化与交接出口。只从运行环境读取 `WORKPET_LLM_*`，不记录密钥。
- `definition-service`：通过 Worket 托管服务调用当前 Definition 真实路径，轮询并保存原始结果。使用独立匿名安装凭据，凭据文件权限为 `0600` 且位于被忽略的 `runs/`。
- `mock`：只验证账本、失败和评分结构；不能标记为真实结果。

## 不变量

- live 必须同时具备授权引用、明确数据范围、正数预算、调用/token 上限和与当前输入 hash 完全一致的 approval 文件。
- 每次运行和重试都创建新目录；现有 trial 不覆盖。
- provider 失败、预算阻断和人工时间未知都进入账本，分别记为 `FAILED`、`BLOCKED` 和 `null`。
- synthetic/mock 永远不能记为 real；结构测试成功不能写成语义质量通过。
- 调用上限按 trial 预留并硬性阻断；token 或账单未由 provider 返回时写 `null`，不推断为 0，也不把声明的币种预算误称为已核销金额。

`runs/` 可能包含授权输入、原始模型输出和匿名接入凭据，默认不入 Git。
