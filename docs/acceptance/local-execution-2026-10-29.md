# 本地自动开展验收 — 2026-10-29

状态：实现、自动检查及真实 VideoCreator 路线验证完成。用户于 2026-10-29 确认“把这个版本打包发版”，进入 v0.1.10 发布流程。以下保留验收时的构建与未提交状态，正式发布内容见 [v0.1.10](../releases/v0.1.10.md)。

发布整理：以最新主线 `446c80b` 建立独立分支，仅迁入本地自动执行、执行依据、必要的新工作分流及相关文档；原工作区的其他项目规范沉淀实验保留原样。合并后 384 项项目测试、34 项评测测试、后台构建和差异格式检查全部通过。此前 386 项是含其他未提交实验的工作区测试数量，不能作为本发布分支的测试数量。

## 最新复验：日常数据库、现有 Contract、原生界面

用户要求再实际跑一遍，确认默认目录、直接启动和工作内查回依据。本次使用日常 `WorkPet` 数据库中的现有“文本转语音与时间轴交付 · v3”，没有另建测试 Contract，也没有向数据库注入工作或执行状态。

原生 Worket 表单只填写 `After the rain, a little puddle reflects the sky. Pause and look closer.`，沿用语速 1.1。页面自动显示 `/Users/dandi/VideoCreator`；没有选择目录，未进入 Codex 界面或点击发送。点击 Worket“开始工作”后，官方 Codex app-server 返回真实 thread/turn，随后在项目独立目录创建音频及可视化时间轴。

- 工作：`cfe2d327-ea06-4570-8234-94d6e060cc69`；创建时间 `2026-10-29T04:23:31.762Z`。
- 原聊天：`01a185e6-1a5f-7c62-8fd2-46377e81dc94`；回合：`01a185e6-1b25-7f41-b46a-22d3fce2ee9c`。
- 目录来自来源工作 `e1ec5618-c02e-4f87-bed7-6dda4c42316c` 的原会话工作区，解析方式为 `SOURCE`，已保存本机默认绑定。
- 从“工作记录”打开 10 月 29 日新工作“将给定文本转换为音频，并交付时间轴。”，点击“执行依据 · 继续”，成功重新查回原文、语速、Contract v3、目录、固定 AGENTS.md 副本、完整说明、构建身份及实际 Codex 会话。
- 清单摘要 `e4144c323003d12830c5e758fcb390db30d6aff409b45fa2634badda8d5369ee`；AGENTS.md 副本摘要 `9939aa6dcec74e37ff74c0668cd26b5690519f4f04759a2b0fc88cd7a8182595`。均重新计算核对一致。
- 实际运行开发版构建摘要 `8a3a58bf7d6737b146c0bc5804df22ff9fc8f60afbf748ee5a981f397c80cafe`，清单身份、dist 和包内 build-info 一致。VideoCreator 的 Git 版本显示 `not-recorded`，没有把无记录冒充源码已固定。

首轮尝试发现可选“参与改进 Worket”的后台能力请求失败会阻止本地创建，当时没有创建工作或启动执行者。已修正为本地授权检查与样本入队，发送前再校验后台政策、目的地和有效授权；保留用户参与选择。回归覆盖离线创建、幂等、离线留队、服务暂停不上传及恢复后一次上传。最新 `npm test` **386 项全部通过**，`git diff --check` 通过，随后正常退出旧开发版并通过 `npm run dev` 启动本次构建。

本次证据：[执行清单与真实事件](../../reports/local-execution-live-2026-10-29/execution.json)、[原生界面核对记录](../../reports/local-execution-live-2026-10-29/ui-verification.json)、[运行构建](../../reports/local-execution-live-2026-10-29/dev-build.json)、[固定资料归档](../../reports/local-execution-live-2026-10-29/fixed-materials/index.json)、[测试日志](../../reports/local-execution-live-2026-10-29/tests.log)。后文保留早期隔离验证及目录修正的历史结果，不代表本次仍需选择目录。

回合于 `2026-10-29T04:30:37.034Z` 结束，执行状态 `TURN_ENDED`，工作仍为 `OPEN`，原生页面显示“本轮结束 · 待修改或验收”及完整最终回复。共 43 条执行事件，初始清单摘要未改变。真实产物位于 `/Users/dandi/VideoCreator/videos/20261029-puddle-voiceover/output/`：MP3、WAV、含内嵌音频的 HTML 时间轴，以及 JSON/SRT/Markdown/PNG。独立 ffprobe 核对 WAV 为 24 kHz 单声道、4.190 秒，7 份交付文件哈希与执行者清单一致。执行者保存了原文转录、时间边界和播放／定位／复制检查；听感及业务验收留给用户。

执行者的 Worket context MCP 请求未获准，因此成果没有登记到工作流；文件路径和最终回复已记录在这项工作内，不把此次测试表述为成果自动回收或验收闭环。最终核对见 [acceptance.json](../../reports/local-execution-live-2026-10-29/acceptance.json) 和 [交付清单](../../reports/local-execution-live-2026-10-29/delivery/delivery-manifest.json)。开发版停留在本次执行依据页，仍未提交。

## 用户要求与实现

按用户后续修正，普通 Contract 的“发起新工作”自动使用默认项目文件夹，不再要求选择；可补充需要固定的资料。已有绑定优先，首次继承来源工作会话的项目位置，没有唯一来源时使用 Worket 管理的本地目录。默认 Codex 本地自动开始，同一 Contract 后续沿用目录和资料选择。点击“开始工作”创建独立工作、固定清单并直接启动真实 Codex 回合，无需转交到 Codex 再手动发送。

工作详情的“执行依据 · 继续”保留初始约定版本、输入、特殊要求、完整说明、项目目录、主机和运行版本，以及根 AGENTS.md / 选定资料的副本与哈希。实际会话、模型、权限、命令、回复和后续修改追加记录。用户可在原聊天修改、处理命令／文件权限请求或停止本轮；回合结束不代表验收。

## 工程检查

- `npm test`：382 项通过，0 失败；包含固定副本、幂等命令、同工作防重复、重启未知态、原会话接续、审批只回答一次、快速完成竞态、篡改检测、删除级联，以及真实 stdio server request 路由测试。
- 初次在受限沙箱运行时，本机监听测试出现 EPERM；在正常本地权限重跑全部通过，未将环境失败算成成功。
- `git diff --check` 通过。
- 使用真实 Electron 表单、IPC 和 Codex app-server 执行验证；项目目录选择对话框在测试中返回指定目录，执行按钮、清单持久化、任务发起、原聊天修改均走产品代码。

## VideoCreator 真实结果

验证 Contract 为明确标记的合成测试约定“VideoCreator · 自动发起验证”，Worket 数据位于隔离目录；没有向用户日常数据库写入测试 Contract。执行者和项目文件是真实的。

- 工作：`077c257a-1a93-4276-a2ac-4dda72ae1197`。
- Codex 原聊天：`01a185c6-1be6-7662-b54c-0921a2617c99`，运行时 `0.165.0-alpha.1.2`，实际模型 `gpt-6-astra`。
- 第一轮：从 Worket 开始按钮直接执行，在 `/Users/dandi/VideoCreator/videos/20261029-worket-autostart/` 创建 `script-draft.md` 和 `execution-proof.json`，内容是 15 秒“雨后水洼像镜子”的脚本草稿。
- 第二轮：在原聊天、原目录修改草稿，追加拍摄备注“低机位靠近水面，注意脚下安全”；证明文件 revision 更新为 2。
- 重启隔离 Worket 后，项目目录及 `export-standard.md` 选择保留，旧清单和两轮回复可查；第三轮恢复原聊天，只读核对 revision 2 及备注。
- 三轮初始清单摘要均为 `30f66935a0c0a2b2595bfc1b94b486754c07d9e24c223ead450d58e121ecd394`，最终工作状态仍为 OPEN，成果阶段仍为 awaiting_review。
- Agent 实际读取了固定 AGENTS.md / export-standard.md 副本，对应命令在执行记录中；额外读取的父目录规范由 Agent 的 proof 明确列为未固定，不冒充初始清单的一部分。

原始证据：[acceptance.json](../../reports/local-execution-2026-10-29/acceptance.json)、[三轮清单与事件](../../reports/local-execution-2026-10-29/third-turn.json)、[目录记忆画面](../../reports/local-execution-2026-10-29/04-remembered-project.png)、[重启后的依据页面](../../reports/local-execution-2026-10-29/05-reopened-evidence.png)。固定资料另归档到报告的 `fixed-materials/`，保留原路径和摘要映射。

脚本：`scripts/qa-local-execution.mjs` 与 `scripts/qa-local-execution-resume.mjs`。第一次两轮执行后，测试对折叠区域使用 innerText 导致断言失败；改为 textContent 并在重启验证中确认资料实际存在。测试导航 API 名称也已纠正，不代表产品发起失败。

## 开发版交付

通过 `npm run dev` 构建启动，沿用原 `WorkPet` 用户数据。已在原生窗口确认页面来自 `/Users/dandi/YanGuan/release/Worket-darwin-arm64/Worket.app/Contents/Resources/app.asar/dist/renderer/panel.html`。

运行进程路径为仓库的 `release/Worket-darwin-arm64/Worket.app/Contents/MacOS/Worket --dev`。展示版本 v0.1.9，源码基点 `7c4f1b5c05aeff27cb553663b8fabcfc290caf67` 且有未提交修改。构建摘要 `248857a1fac4b5a5547683e882dd2e7cd5d9f4622ac037864cb257bb65865cdd`；已核对包内 build-info 与本次构建一致，详见 [开发版身份](../../reports/local-execution-2026-10-29/dev-build.json)。

## 边界

本次验证脚本草稿、修改及核对，不包括真实视频渲染或发布。支持当前本机 Codex，不包含其他执行者自动发起、流程节点自动派发、跨设备项目同步或云调度。清单固定声明输入和选定资料，不是完整环境／隐式记忆备份；项目 Git dirty 标记不等于保存全部未提交源码。

实际权限由 Codex 与本地配置决定；记录请求和回执不构成企业权限强制控制。命令与文件审批已接入，其他尚不支持的交互不自动授权。退出会关闭 Worket 所拥有的执行连接，未决任务保留为待核对；超时或断线不自动重发，不承诺长时间无人值守或无缝恢复。


## 默认目录修正（2026-10-29）

用户要求本地直接用默认目录。已移除目录选择及 start 的目录参数，由后端继承已有本机绑定／来源会话工作区；清单补充来源工作 ID 和解析方式。旧记录从原会话取 cwd，不采用工具命令的临时目录；未知项目有独立默认目录，已知项目丢失不会静默换目录。新回归覆盖首次继承、并发去重、默认目录按需创建、旧会话目录解析与缺失目录。

上文三轮真实 Agent 验证是本轮调整前的历史证据；目录选择改动以本节后续检查为准，测试脚本已移除项目目录对话框操作。

修正后检查：385 项测试全部通过；原生开发版窗口中的现有“文本转语音与时间轴交付 · v3”在首次发起页自动显示 /Users/dandi/VideoCreator，目录选择按钮和目录输入框均已移除，未启动额外任务。已正常退出旧版，再通过 npm run dev 启动新开发版，沿用现有数据。当前构建摘要为 6b203d1a4ea8a9958d5ae71255e9189711e4d1ac420d986c2d5f6b964241fab9，包内身份与构建一致，记录见 [默认目录修正构建](../../reports/local-execution-2026-10-29/default-project-build.json)。全部修改保持未提交。
