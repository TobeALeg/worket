# 本机 HTML 审阅

复用 `codex/conversation-requirements-research` 中 `experiments/conversation-requirements/review/` 的真人审阅页面及保存流程（原提交 `8d675b2`、`c3994eb`）。移入当前分支后，入口接收固定样本，不依赖旧研究 worktree 或硬编码的六份研究材料。

`distillation-sample.mjs` 将已经通过客户端接收的真实结果投影为候选、原文和待确认提示；保留原条目地址、原始 Item、问题及快照身份。相关问题放在条目旁，无法关联到具体条目的问题单列，不代替用户作出任何决定。工具记录、待确认适用范围和规范资料分别标识。

```sh
npm run build
node scripts/review-distillation.mjs output/distillation-analysis/final 4319
```

原始来源和模型结果只读；审阅在该运行目录的 `human-reviews/` 中自动保存。接受、修改、拒绝、暂放、撤销、编辑缓冲、遗漏补充及提交沿用原流程。修改可区分对历史原意的修正和今天的新决定。提交仅保存本次人工审阅，不发布 WorkDefinition，也不调用模型。

第三个参数可指定独立保存目录用于 QA。自动化验证只能写入 QA 目录，不能替用户完成正式审阅。
