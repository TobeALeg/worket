# H1 人工确认页

这是抽取评测的本地人工确认界面。它把 source case JSONL 中的用户/助手可见消息和独立的 review draft 一起载入浏览器；浏览器不会上传文件，也不会从被测模型输出自动生成 gold。

## 启动

在仓库根目录执行：

```bash
node evals/extraction/review-server.mjs \
  --source evals/extraction/runs/reviews/videocreator-h1-source.jsonl \
  --draft evals/extraction/runs/reviews/videocreator-h1-draft.json \
  --output evals/extraction/runs/reviews/videocreator-h1-gold.json
```

三个路径必须明确提供。默认 server 只监听 `127.0.0.1`，默认端口 `4173`；可用 `--port 0` 取得临时端口，也可显式指定 `--root`。source、draft 和 output 的路径必须位于 `--root` 内，避免请求参数或误拼路径把文件写到工作区之外。draft 不存在时，页面从 source 建立空白待标注案例；之后保存草稿会创建它。

## 审阅流程

左侧切换案例。每条内容先展示需要确认的原子要求，再以只读摘要展示自动分类，判断按钮固定在卡片最下面。点击“正确，进入下一条”会保留该内容并滚动到下一条；点击“不对，查看原因并修改”才展开证据、原因和完整编辑字段。案例内全部处理后自动进入下一个案例。原始消息区默认折叠；展开后可查看用户/助手消息、原始 `event_id`、序号和时间。点“引用此消息”会创建一条已绑定该证据的补录内容，避免误把新证据写进另一条待确认内容。

展开修改后，内容可标记为保留、修改、不应收录、已被新规则替代或补遗漏，并填写：

- `semantic_content`、`evidence_refs`、`source_origin`、`adoption_status`、`validity`
- `scope`（只适用于本次、以后同类工作、所有工作、历史或不应成为要求）
- `destinations`（保存到本次工作、以后同类工作、还要问我、只保留历史或不要收录）
- `criticality`（模型漏掉后是否会导致返工或错误）、`required`（本轮是否要求模型识别）、`utility_reason`、`acceptable_variants`、`forbidden_inferences`

页面使用上述人话标签，保存的 JSON 仍使用稳定枚举值，避免界面文案变化破坏已有评测文件。`required` 决定一条单位是否进入本轮评分分母，`criticality` 决定漏掉它是否属于严重错误，`destinations` 只决定确认后保存到哪个结构化视图；三者互不替代。

“保存草稿”原子写入 `--draft`。所有案例完成后，设置评审人并点“完成并保存最终确认”，server 会拒绝仍有待确认单位/案例、缺少同案原文证据或包含非法枚举值的文档，再以独占方式写入 `--output`。已有最终文件不会被覆盖；如需重做，必须明确指定新的输出路径。输出顶层为 `schema_version/status/reviewer_id/updated_at/cases/human_approval`；每个 case 保留 `case_id/work_id/cutoff_event_id`，每个 unit 保留 gold 示例规定的字段，并额外带 `review_action/review_status` 以审计人工动作。标记为删除或已替代的单位会自动退出当前评分分母。

## API

- `GET /api/state`：重新读取 source 和 draft，返回渲染所需状态；包括原文消息和路径提示。
- `POST /api/save`：JSON body `{ "mode": "draft" | "final", "document": <review document> }`。
- `POST /api/reload`：重新读入 source/draft，不写文件。

请求体上限为 10 MiB。写入先在目标文件同目录生成独占临时文件，再 `rename` 替换目标；真实输入、草稿和最终输出应放在已被忽略的 `evals/extraction/runs/` 下。
