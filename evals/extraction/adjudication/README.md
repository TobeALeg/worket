# Working Context 自动对比确认页

这个本地页面读取人工确认 Gold、真实 WorkState/Handoff run 和模型提出的逐项裁定，只把 Gold 覆盖及模型标记为非 `USEFUL` 的输出放入人工确认队列。模型标为正常的输出仍保留在最终 JSON，但明确标为 `MODEL_ONLY`，不能冒充已逐项人工复核。

```bash
node evals/extraction/adjudication-server.mjs \
  --gold evals/extraction/runs/reviews/videocreator-h1-gold.json \
  --run evals/extraction/runs/<run-id> \
  --proposal evals/extraction/runs/<run-id>/adjudication-proposal.json \
  --draft evals/extraction/runs/<run-id>/adjudication-review-draft.json \
  --output evals/extraction/runs/<run-id>/adjudication-final.json \
  --port 4173
```

每项按“检查对象 → 自动判断 → 人工确认”排列。判断正确时直接进入下一项；判断不对时才展开自动判断依据、关联 ID 和修改表单。最终文件使用 `HUMAN_RISK_REVIEWED`，因为本轮只逐项人工确认高风险判断，不把自动 `USEFUL` 输出伪称为全量人工通过。
