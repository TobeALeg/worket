# Contract 输入聚焦验证

日期：2026-09-28。当前状态：v0.1.7 已公开发布、同步后台并安装。隔离和真实应用两次模型验证均通过。

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

真实验证使用现有服务器内的 `deepseek-flash`，在隔离容器从零完成 2 次提取和 1 次汇总，无缓存复用，耗时 195.165 秒。服务 SUCCEEDED，经 `DistillationService.receive` 接收后隔离客户端为 AWAITING_REVIEW。请求 SHA-256 为 `b495a91dbdaabdbb19af8605fd31969a580738264b9fd0b48cc04e555f17d01d`，全部 93 条输入事件的覆盖与引用校验通过。

返回 32 条要求演进、19 个候选字段，11 个阻断审阅事项及 2 个非阻断提示。中文、连续正文、hover 辨别条目、点击引用与编辑、快速阅览提交、后台运行和桌宠完成反应均能在要求演进中找到。隔离样本的汇总字段没有把桌宠完成反应单独列明，不能把结构校验成功等同于约定语义无遗漏；候选仍需审阅。没有自动接受或发布定义。

供应商报告 prompt_tokens=18,941、completion_tokens=63,864、total_tokens=82,805；金额未提供。仅上传精简请求，模型配置与密钥留在服务器。真实结果、调用计时与请求 hash 保存于 `output/contract-filter-20260928/filtered/`。原生产任务和本地旧快照未改写。

290 项回归中初次仅旧提示版本断言未更新；改为 v1.2 后对应 HTTP 测试 9/9 通过。完整发布回归随后再次执行。新增关注：所有工具类型/状态/元数据统一省略、用户代码原文和工作决定保留、旧视图摘录兼容、所选规范角色保留、legacy/v1 失败重试独立升级。旧工具分类用例随被删除的规则移除，未降低覆盖/引用等验证器约束。

## 实际应用内重试与发布

v0.1.7 最终安装包在本机安装后，经实际应用的重试按钮处理原失败任务。新任务 `a11d588c-e405-4dca-90f6-d1cea570d46d`、快照 `233f7a72-a160-4ce4-8285-8f9397a2bf7d`，生产请求 `73527013-0b21-42ac-ab01-286b19d31b9f`；`contract-input-v2` 省略 506 条工具记录，全部 93 条输入事件通过覆盖与引用核验。

实际应用耗时 134.582 秒进入 AWAITING_REVIEW，草稿 `a19c8e9a-f70a-4dbe-a679-2a68df09f45a` 已保存在原工作库中并可打开。草稿包含 16 个字段，13 条要求演进、6 个阻断审阅事项和 1 个非阻断提示。抽查默认中文、连续条目、hover 区分、点击 ref/编辑、后台执行、处理中动效以及桌宠完成反应均进入最终候选，助手补充仍为待确认。任务结果正文在客户端接收后移入草稿，因此应读取 `definition_drafts.content`，不能以任务行中的 `result.content=null` 判断没有候选。

生产记录为 ACKNOWLEDGED、3 次真实调用，prompt_tokens=16,847、completion_tokens=43,660、total_tokens=60,507。加上隔离验证，本轮新增 6 次真实调用、143,312 tokens，无缓存复用；金额未提供。旧失败任务作为历史保留，未自动发布工作定义。

最终公开安装包、生产备份/回滚、旧版下载与本机运行核验见 [v0.1.7 发布验收](../releases/v0.1.7-verification.md)。
