# Contract 输入聚焦验证

日期：2026-09-28。当前状态：过滤与旧任务重试升级已实现；真实模型和安装验证进行中。

## 本次故障定位

只读确认正在运行 `/Applications/Worket.app/Contents/MacOS/Worket`，Info.plist 为 0.1.6；GitHub Latest 同为 [v0.1.6](https://github.com/TobeALeg/worket/releases/tag/v0.1.6)。线上后台为 `/opt/worket/releases/71a4f94`，健康检查正常。

最新失败任务 `5f06ea05-595b-4c64-979b-b1faa4dfad88`，创建于 2026-09-28 09:11:43 UTC，快照 `8f556b19-e75a-4f6e-b65f-fbc1bacd7a3b`，已应用 `distillation-input-v1`。错误为 `INCOMPLETE_COVERAGE`，不同于 9 月 23 日原任务的 `INPUT_TOO_LARGE`。

后台请求 `088064a1-3801-45a6-810f-bee9a88941b9` 实际用了 10 次调用、约 201 秒，10 次都记录了完整用量；该路径需 19 次提取加 1 次汇总。因此错误定位在分批 `coversExactly(result.eventKeys, expected)`，不是请求超限、输出截断或最终汇总。后台不保存失败输出正文，无法确定具体漏了哪项，也不能把体积大直接声称为已经证明的唯一原因。

## 实现边界

按用户本次提出的 contract 范围，默认输入为完整对话、工作决定及主动选择的文件；所有 `tool.*` 事件统一 OMIT。完整档案不删除，省略清单保留事件 key、原始 hash、原因 `execution-detail` 与规则版本 `contract-input-v2`。用户/助手消息中的代码不会因形似实现而被截断，否定、纠正、引用、采纳和验收仍逐字保留。

工具读过的规范不会自动成为选入资料；若正文只在已省略的工具日志里，提取提示要求保留用户对资料的引用并提出信息缺口，禁止猜测具体条款。通过“含附件沉淀”选入的文件仍原样发送，角色和规范文件身份不变。

旧 legacy/v1 失败任务重试会另存当前规则快照；不会因已有 analysis 字段而继续用过时规则。旧视图的 KEEP/EXCERPT/OMIT/DUPLICATE 保持可读，已有结果仍按原快照核验。协议沿用 analysis schema 1，覆盖与引用校验未放宽。

## 同一记录的离线对比

通过真实 `DistillationService.retry → wire → chunksFor`，在只读复制的 SQLite 中执行：

```sh
node scripts/qa-distillation-input.mjs prepare output/contract-filter-20260928/filtered '/Users/dandi/Library/Application Support/WorkPet/workpet.sqlite' 5f06ea05-595b-4c64-979b-b1faa4dfad88
```

| 指标 | v1 | v2 |
| --- | ---: | ---: |
| 原始事件 | 599 | 599 |
| 实际输入事件 | 518 | 93 |
| 省略工具事件 | 81 | 506 |
| 请求字节 | 455,631 | 33,692 |
| 提取批次 | 19 | 2 |
| 加上汇总的预计调用 | 20 | 3 |

v2 比 v1 减少约 92.6%；相对未过滤的 750,278 字节减少约 95.5%。7 条用户消息、85 条助手回复与 1 条标题逐字一致，旧快照 hash 不变。私有快照、请求、模型输出保存在 Git 忽略的 `output/contract-filter-20260928/`，不提交到仓库。

## 验收状态

真实验证使用现有服务器内的模型配置，在隔离容器运行最多 3 次调用；只上传这份精简请求，配置密钥留在服务器。尚未完成前不宣称生成候选成功，单个样本成功也不代表所有输入都能成功或语义准确率。
