# WorkBuddy 修复后真实链路复验（2026-10-15）

## 结论

本轮不能判定完整链路通过。正式安装版 Worket → WorkBuddy 5.8.2 / Hy3 的草稿交付、真实目标绑定、MCP 工作包读取、中文路径 CSV 读取、正确结果生成及文字自动回流均通过；两个输出文件未登记到 Worket。自动状态整理也未通过，初次交接准备约等待 10 分钟后走原话兜底。

## 安装身份与任务

- 运行程序：`/Applications/Worket.app/Contents/MacOS/Worket`；测试源码 main `45b6121a9e2d792c1132fc1d95e14f805ed2e0cc`，含 #21 修复及 #20。
- ASAR SHA-256：`829f96c3c08aed6cd7385940646d901ab34ba4b921d951c7737ca849deba9efa`，与上一轮安装一致，签名有效。
- work：`431d05fe-789e-4de5-9ec6-32175cfd7da6`
- 源 session：`035af90e-3bfe-48e8-850e-44508d95f5aa`
- delivery：`70765cec-7c1c-42cb-aea2-c1d6568e122b`
- 目标 session：`63ed15f6-d74a-415b-b95d-7f26a78cfc9c`
- 合成资料与只读核对结果：本机 `output/qa-workbuddy-regression-20261015/verification.json`。不含私人任务正文。

## 实际链路

1. 新源会话只登记待交接工作，显式引用中文路径 CSV；“最近活动 → 开始记录”识别 1 份 INPUT。校验码仅在附件中，没有写进任务要求。
2. 经正式 Worket 界面选择交接给 WorkBuddy。诊断 `preparing` 为北京时间 10:37:06.623，`prepared` 为 10:47:02.849，耗时约 596 秒。自动状态未成功，原话兜底草稿仍出现。本轮未定位后台根因，不推断由 #21 引入。
3. 人工确认发送一次应用生成的原草稿；未修改草稿、未重发或补充执行指令。目标自行识别“新接手会话读取工作包后执行”的条件。
4. 真实 MCP 读取回执于 10:50:33.886 落盘，delivery 与目标 binding 匹配。WorkBuddy 界面显示实际读取输入 CSV。
5. 独立 Decimal 核对：5 单、15 件、195.00；逐单金额 37.20 / 39.90 / 36.50 / 46.80 / 34.60。结果报告正确包含输入路径与附件独有校验码 `WBRG-8N2P-261015`。
6. 目标仍运行时只读检查其 episode 中 `agent.response` 数量为 0；结束后最终回复于 10:54:53.449 自动回流。这支持 #21 的延迟入档修复没有阻断结束后的文字同步；未在真实存储中人为注入内部摘要。
7. Worket 界面显示“16 条记录 · 1 份资料 · 2 段执行 · 已绑定 · 工作包已读取”。数据库 quick_check=ok。未手工写库、导入结果或伪造回执。

## 未通过项

**输出文件引用缺失。** WorkBuddy 最终回复为 `[汇总报告.md](file:///Users/...)` 与 `[订单金额.csv](file:///Users/...)`。当前 `src/adapters/workbuddy/local-transcript.ts` 仅匹配 `](/...)`，因此最终文字回流但没有生成两个 OUTPUT 事件；资料仍只有原 INPUT。与 #21 的账号/内部消息过滤修改无关，是此前存在的链接格式覆盖缺口。没有强制执行者重写链接来冒充本轮全链路通过。

**自动状态整理未成功且影响交接等待。** 原始上下文兜底可继续实际执行，但不能将本轮记录为自动状态准备成功或快速交接。服务端根因未核实。

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| 输入资料/回归订单.csv | 132 | 270d1effa7df8c51fd8c7018786cdc5b79ff114e95c5e2362cf0caa216c86fed |
| 结果文件/汇总报告.md | 555 | cf2631c36f06fbd937315fc02c680c599fb96f492edda4eb98f908c3d61409ae |
| 结果文件/订单金额.csv | 130 | 0c755dba303f19502d943827bbca1163f99f3effb317e5441b7b06213a360af7 |

本次只覆盖同一 Mac 的合成 CSV → Markdown/CSV。账号过滤已由 #21 自动回归覆盖，此次未切换真实账号。测试通过 Computer Use 操作现有应用，不代表 Worket 产品增加 RPA。只增加验收文档，没有修复上述新发现或修改运行时代码。

## file URI 修复后原现场复验（同日）

用户要求新增 file URI 识别后，#23（main `aa55409e2c7bfb9ffce31bec883669d4b8d50739`）在可见助手回复中使用 Node `fileURLToPath` 转换本机 file URI，并复用现有 ArtifactTracker。编码中文/空格/百分号、去重、localhost、远端/无效 URI 排除及活动回复延迟入档回归覆盖；全量测试 349/349、评测工具 34/34、服务构建、打包应用验收及合并后 CI 均通过。

正式应用更新并正常重启，安装与构建 ASAR SHA-256 均为 `3cd924d92b27e3f7c35525645d0b359e340942e7d288a6938d8210f980ec02e9`；构建提交与 squash 后 main 的完整源码树一致。旧应用备份在 `output/app-backups/file-url-20261015/Worket.app`。实际进程来自 `/Applications/Worket.app/Contents/MacOS/Worket`。

使用本文件同一 work/session，未重发或补充 WorkBuddy 消息，未手工导入或写库。启动后的正常同步自动增加两个 OUTPUT，原 INPUT 保留；三个引用全部 AVAILABLE，文件字节数与 SHA-256 逐一匹配上表，数据库 quick_check=ok。原生 Worket 显示“18 条记录 · 3 份资料 · 2 段执行 · 已绑定 · 工作包已读取”。本机结构化核对记录为 `output/qa-workbuddy-regression-20261015/file-url-fix-verification.json`。

本轮已解决“文件 URI 输出引用缺失”。上文失败现场保留作为修复前证据；自动状态整理失败与约 10 分钟交接等待仍未解决，不据此改为自动状态全链路通过。
