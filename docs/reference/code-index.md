# 代码索引（自动生成）

入口：[架构总览](README.md) · [接口手册](interfaces.md) · [字段字典](fields.md)

此文件保留代码中的原始名称与可选标记，不补造缺失的运行时约束。只索引源码，不读取数据库、配置或用户记录。

覆盖 src/ 与 server/ 下 175 个 TypeScript/JavaScript 文件；内容摘要 SHA-256：`ae2cad854421d1319a3ca43c283252a1114e8cb07a594951075d0725c7b630ef`。

更新：`node scripts/architecture-reference.mjs`；检查是否过期：`node scripts/architecture-reference.mjs --check`。需先安装项目依赖。

## 桌面 IPC 完整索引

包含 preload 调用、主进程注册和事件监听；同一通道可能有多个方向。回调参数为源码签名，event 是 Electron 事件。

| 文件/位置 | 操作 | 通道 | 包装方法或回调参数 |
| --- | --- | --- | --- |
| [src/desktop/pet-position.ts:28](../../src/desktop/pet-position.ts#L28) | this.window.webContents.send | `pet:placement` | — |
| [src/desktop/workflow-draft-flush.ts:18](../../src/desktop/workflow-draft-flush.ts#L18) | ipcMain.on | `workflow:draftFlushed` | — |
| [src/desktop/workflow-draft-flush.ts:18](../../src/desktop/workflow-draft-flush.ts#L18) | window.webContents.send | `workflow:flushDraft` | — |
| [src/main.ts:202](../../src/main.ts#L202) | panelWindow.webContents.on | `render-process-gone` | () |
| [src/main.ts:203](../../src/main.ts#L203) | panelWindow.webContents.on | `unresponsive` | () |
| [src/main.ts:205](../../src/main.ts#L205) | panelWindow?.webContents.send | `feedback:collapse` | — |
| [src/main.ts:228](../../src/main.ts#L228) | petWindow.webContents.on | `context-menu` | () |
| [src/main.ts:287](../../src/main.ts#L287) | panelWindow.webContents.send | `panel:shown` | — |
| [src/main.ts:308](../../src/main.ts#L308) | ipcMain.handle | `workflow:command` | (event, action, input) |
| [src/main.ts:313](../../src/main.ts#L313) | ipcMain.handle | `distillation:command` | (event, action, input) |
| [src/main.ts:320](../../src/main.ts#L320) | ipcMain.handle | `distillation:configure` | (event, input) |
| [src/main.ts:325](../../src/main.ts#L325) | ipcMain.handle | `distillation:connection` | (event) |
| [src/main.ts:333](../../src/main.ts#L333) | ipcMain.handle | `distillation:copy-recovery` | (event) |
| [src/main.ts:339](../../src/main.ts#L339) | ipcMain.handle | `distillation:restore-account` | (event, recoveryCode) |
| [src/main.ts:344](../../src/main.ts#L344) | ipcMain.handle | `distillation:choose-file` | (event, kind) |
| [src/main.ts:352](../../src/main.ts#L352) | ipcMain.handle | `distillation:copy` | (event, workId) |
| [src/main.ts:360](../../src/main.ts#L360) | ipcMain.handle | `distillation:export` | (event, workId) |
| [src/main.ts:375](../../src/main.ts#L375) | ipcMain.handle | `panel:toggle` | () |
| [src/main.ts:376](../../src/main.ts#L376) | ipcMain.handle | `pet:open-distillation` | (event) |
| [src/main.ts:380](../../src/main.ts#L380) | panelWindow?.webContents.send | `distillation:open` | — |
| [src/main.ts:382](../../src/main.ts#L382) | ipcMain.handle | `pet:get-view` | () |
| [src/main.ts:390](../../src/main.ts#L390) | ipcMain.handle | `panel:record-current-context` | () |
| [src/main.ts:395](../../src/main.ts#L395) | ipcMain.on | `pet:mouse-passthrough` | (event, ignored: boolean) |
| [src/main.ts:401](../../src/main.ts#L401) | ipcMain.on | `pet:drag` | (event, phase: string, cursor?: { x: number; y: number }) |
| [src/main.ts:416](../../src/main.ts#L416) | ipcMain.on | `panel:resize-right` | (event, phase: string, cursorX: number) |
| [src/main.ts:427](../../src/main.ts#L427) | ipcMain.handle | `panel:close` | () |
| [src/main.ts:428](../../src/main.ts#L428) | ipcMain.handle | `dashboard:get` | (_event, workId?: string) |
| [src/main.ts:434](../../src/main.ts#L434) | ipcMain.handle | `connectors:preview` | (event, input: SelectedContent) |
| [src/main.ts:438](../../src/main.ts#L438) | ipcMain.handle | `connectors:import` | (event, input: SelectedContent) |
| [src/main.ts:442](../../src/main.ts#L442) | ipcMain.handle | `connectors:inbox` | (event) |
| [src/main.ts:443](../../src/main.ts#L443) | ipcMain.handle | `connectors:inbox-read` | (event, id: string) |
| [src/main.ts:444](../../src/main.ts#L444) | ipcMain.handle | `connectors:inbox-remove` | (event, id: string) |
| [src/main.ts:445](../../src/main.ts#L445) | ipcMain.handle | `connectors:copy-inline` | (event, workId: string) |
| [src/main.ts:446](../../src/main.ts#L446) | ipcMain.handle | `connectors:export-inline` | (event, workId: string) |
| [src/main.ts:453](../../src/main.ts#L453) | ipcMain.handle | `connectors:choose-import` | (event) |
| [src/main.ts:463](../../src/main.ts#L463) | ipcMain.handle | `executors:list` | () |
| [src/main.ts:464](../../src/main.ts#L464) | ipcMain.handle | `conversations:list` | (_event, executorId: string) |
| [src/main.ts:467](../../src/main.ts#L467) | ipcMain.handle | `conversations:recent` | () |
| [src/main.ts:470](../../src/main.ts#L470) | ipcMain.handle | `conversations:history` | (_event, executorId: string, cursor?: string, searchTerm?: string) |
| [src/main.ts:475](../../src/main.ts#L475) | ipcMain.handle | `conversations:preview` | (_event, executorId: string, threadId: string) |
| [src/main.ts:480](../../src/main.ts#L480) | ipcMain.handle | `conversations:selection` | () |
| [src/main.ts:483](../../src/main.ts#L483) | ipcMain.handle | `work:create-from-conversation` | (_event, request) |
| [src/main.ts:486](../../src/main.ts#L486) | ipcMain.handle | `work:split-points` | (_event, workId: string) |
| [src/main.ts:489](../../src/main.ts#L489) | ipcMain.handle | `work:create-from-message` | (_event, request) |
| [src/main.ts:492](../../src/main.ts#L492) | ipcMain.handle | `work:open-artifact` | (event, workId: string, itemId: string) |
| [src/main.ts:500](../../src/main.ts#L500) | ipcMain.handle | `work:refresh` | (_event, workId: string) |
| [src/main.ts:503](../../src/main.ts#L503) | ipcMain.handle | `work:complete` | (_event, workId: string) |
| [src/main.ts:506](../../src/main.ts#L506) | ipcMain.handle | `work:archive` | (_event, workId: string) |
| [src/main.ts:509](../../src/main.ts#L509) | ipcMain.handle | `work:resume` | (_event, workId: string) |
| [src/main.ts:512](../../src/main.ts#L512) | ipcMain.handle | `work:cancel-handoff` | (_event, workId: string, confirmation: string) |
| [src/main.ts:517](../../src/main.ts#L517) | ipcMain.handle | `work:reopen-handoff` | (_event, workId: string) |
| [src/main.ts:518](../../src/main.ts#L518) | ipcMain.handle | `work:handoff` | (_event, workId: string, executorId: string) |
| [src/main.ts:524](../../src/main.ts#L524) | ipcMain.handle | `work:cancel-recording` | (_event, workId: string, confirmation: string) |
| [src/preload.cjs:3](../../src/preload.cjs#L3) | ipcRenderer.on | `workflow:flushDraft` | (_event, id) |
| [src/preload.cjs:4](../../src/preload.cjs#L4) | ipcRenderer.send | `workflow:draftFlushed` | — |
| [src/preload.cjs:5](../../src/preload.cjs#L5) | ipcRenderer.send | `workflow:draftFlushed` | — |
| [src/preload.cjs:9](../../src/preload.cjs#L9) | ipcRenderer.invoke | `connectors:preview` | previewSelectedContent |
| [src/preload.cjs:10](../../src/preload.cjs#L10) | ipcRenderer.invoke | `connectors:import` | importSelectedContent |
| [src/preload.cjs:11](../../src/preload.cjs#L11) | ipcRenderer.invoke | `connectors:inbox` | listSelectedInbox |
| [src/preload.cjs:12](../../src/preload.cjs#L12) | ipcRenderer.invoke | `connectors:inbox-read` | readSelectedInbox |
| [src/preload.cjs:13](../../src/preload.cjs#L13) | ipcRenderer.invoke | `connectors:inbox-remove` | removeSelectedInbox |
| [src/preload.cjs:14](../../src/preload.cjs#L14) | ipcRenderer.invoke | `connectors:choose-import` | chooseSelectedImport |
| [src/preload.cjs:15](../../src/preload.cjs#L15) | ipcRenderer.invoke | `connectors:export-inline` | exportInlinePackage |
| [src/preload.cjs:16](../../src/preload.cjs#L16) | ipcRenderer.invoke | `connectors:copy-inline` | copyInlinePackage |
| [src/preload.cjs:17](../../src/preload.cjs#L17) | ipcRenderer.invoke | `feedback:command` | feedback |
| [src/preload.cjs:18](../../src/preload.cjs#L18) | ipcRenderer.on | `feedback:collapse` | onFeedbackCollapse |
| [src/preload.cjs:19](../../src/preload.cjs#L19) | ipcRenderer.invoke | `work:open-artifact` | openArtifact |
| [src/preload.cjs:20](../../src/preload.cjs#L20) | ipcRenderer.invoke | `distillation:command` | distillation |
| [src/preload.cjs:21](../../src/preload.cjs#L21) | ipcRenderer.invoke | `workflow:command` | workflow |
| [src/preload.cjs:23](../../src/preload.cjs#L23) | ipcRenderer.invoke | `distillation:choose-file` | chooseDefinitionFile |
| [src/preload.cjs:24](../../src/preload.cjs#L24) | ipcRenderer.invoke | `distillation:export` | exportWorkPackage |
| [src/preload.cjs:25](../../src/preload.cjs#L25) | ipcRenderer.invoke | `distillation:copy` | copyWorkPackage |
| [src/preload.cjs:26](../../src/preload.cjs#L26) | ipcRenderer.invoke | `distillation:configure` | configureWorketService |
| [src/preload.cjs:27](../../src/preload.cjs#L27) | ipcRenderer.invoke | `distillation:connection` | getWorketServiceStatus |
| [src/preload.cjs:28](../../src/preload.cjs#L28) | ipcRenderer.invoke | `distillation:copy-recovery` | copyWorketRecoveryCode |
| [src/preload.cjs:29](../../src/preload.cjs#L29) | ipcRenderer.invoke | `distillation:restore-account` | restoreWorketAccount |
| [src/preload.cjs:30](../../src/preload.cjs#L30) | ipcRenderer.invoke | `panel:record-current-context` | recordCurrentContextFromPet |
| [src/preload.cjs:33](../../src/preload.cjs#L33) | ipcRenderer.on | `pet:placement` | onPetPlacement |
| [src/preload.cjs:36](../../src/preload.cjs#L36) | ipcRenderer.invoke | `pet:open-distillation` | openDistillationFromPet |
| [src/preload.cjs:39](../../src/preload.cjs#L39) | ipcRenderer.on | `distillation:open` | onOpenDistillation |
| [src/preload.cjs:42](../../src/preload.cjs#L42) | ipcRenderer.invoke | `pet:get-view` | getPetView |
| [src/preload.cjs:43](../../src/preload.cjs#L43) | ipcRenderer.invoke | `panel:toggle` | togglePanelFromPet |
| [src/preload.cjs:44](../../src/preload.cjs#L44) | ipcRenderer.send | `pet:mouse-passthrough` | setPetMousePassthrough |
| [src/preload.cjs:45](../../src/preload.cjs#L45) | ipcRenderer.send | `pet:drag` | dragPet |
| [src/preload.cjs:46](../../src/preload.cjs#L46) | ipcRenderer.invoke | `dashboard:get` | getDashboard |
| [src/preload.cjs:47](../../src/preload.cjs#L47) | ipcRenderer.invoke | `executors:list` | listExecutors |
| [src/preload.cjs:48](../../src/preload.cjs#L48) | ipcRenderer.invoke | `conversations:list` | listConversations |
| [src/preload.cjs:49](../../src/preload.cjs#L49) | ipcRenderer.invoke | `conversations:recent` | listRecentConversations |
| [src/preload.cjs:50](../../src/preload.cjs#L50) | ipcRenderer.invoke | `conversations:history` | listConversationHistory |
| [src/preload.cjs:51](../../src/preload.cjs#L51) | ipcRenderer.invoke | `conversations:preview` | previewConversation |
| [src/preload.cjs:52](../../src/preload.cjs#L52) | ipcRenderer.invoke | `work:create-from-conversation` | createWorkFromConversation |
| [src/preload.cjs:53](../../src/preload.cjs#L53) | ipcRenderer.invoke | `work:split-points` | listSplitPoints |
| [src/preload.cjs:54](../../src/preload.cjs#L54) | ipcRenderer.invoke | `work:create-from-message` | createWorkFromMessage |
| [src/preload.cjs:55](../../src/preload.cjs#L55) | ipcRenderer.invoke | `conversations:selection` | consumeSourceSelection |
| [src/preload.cjs:56](../../src/preload.cjs#L56) | ipcRenderer.invoke | `work:refresh` | refreshWork |
| [src/preload.cjs:57](../../src/preload.cjs#L57) | ipcRenderer.invoke | `work:complete` | completeWork |
| [src/preload.cjs:58](../../src/preload.cjs#L58) | ipcRenderer.invoke | `work:archive` | archiveWork |
| [src/preload.cjs:59](../../src/preload.cjs#L59) | ipcRenderer.invoke | `work:resume` | resumeWork |
| [src/preload.cjs:60](../../src/preload.cjs#L60) | ipcRenderer.invoke | `work:reopen-handoff` | reopenHandoff |
| [src/preload.cjs:61](../../src/preload.cjs#L61) | ipcRenderer.invoke | `work:cancel-handoff` | cancelHandoff |
| [src/preload.cjs:62](../../src/preload.cjs#L62) | ipcRenderer.invoke | `work:handoff` | handoff |
| [src/preload.cjs:63](../../src/preload.cjs#L63) | ipcRenderer.invoke | `work:cancel-recording` | cancelRecording |
| [src/preload.cjs:66](../../src/preload.cjs#L66) | ipcRenderer.on | `panel:shown` | onPanelShown |
| [src/preload.cjs:69](../../src/preload.cjs#L69) | ipcRenderer.send | `panel:resize-right` | resizePanelRight |
| [src/preload.cjs:70](../../src/preload.cjs#L70) | ipcRenderer.invoke | `panel:close` | closePanel |
| [src/problem-reports/desktop.ts:7](../../src/problem-reports/desktop.ts#L7) | ipc.handle | `feedback:command` | (event, action:unknown, input:unknown) |

## 命令分发完整索引

三组 action 字符串分别属于不同通道，不能跨组混用。精确参数与返回值沿处理分支追至下方方法签名；通用入口本身没有完整的逐命令静态类型。

| 入口 | action | 处理分支 |
| --- | --- | --- |
| `distillation:command` | `evidence` | [src/distillation/desktop.ts:33](../../src/distillation/desktop.ts#L33) |
| `distillation:command` | `previewDocumentRevision` | [src/distillation/desktop.ts:50](../../src/distillation/desktop.ts#L50) |
| `distillation:command` | `adoptDocumentRevision` | [src/distillation/desktop.ts:52](../../src/distillation/desktop.ts#L52) |
| `distillation:command` | `capabilities` | [src/distillation/desktop.ts:54](../../src/distillation/desktop.ts#L54) |
| `distillation:command` | `prepare` | [src/distillation/desktop.ts:56](../../src/distillation/desktop.ts#L56) |
| `distillation:command` | `continuousEvolution` | [src/distillation/desktop.ts:60](../../src/distillation/desktop.ts#L60) |
| `distillation:command` | `setContinuousEvolution` | [src/distillation/desktop.ts:63](../../src/distillation/desktop.ts#L63) |
| `distillation:command` | `evolutionSources` | [src/distillation/desktop.ts:67](../../src/distillation/desktop.ts#L67) |
| `distillation:command` | `evolutionHistory` | [src/distillation/desktop.ts:70](../../src/distillation/desktop.ts#L70) |
| `distillation:command` | `improvementSamples` | [src/distillation/desktop.ts:73](../../src/distillation/desktop.ts#L73) |
| `distillation:command` | `recordingNotice` | [src/distillation/desktop.ts:75](../../src/distillation/desktop.ts#L75) |
| `distillation:command` | `improvementPreference` | [src/distillation/desktop.ts:77](../../src/distillation/desktop.ts#L77) |
| `distillation:command` | `setImprovementPreference` | [src/distillation/desktop.ts:79](../../src/distillation/desktop.ts#L79) |
| `distillation:command` | `stopImprovement` | [src/distillation/desktop.ts:83](../../src/distillation/desktop.ts#L83) |
| `distillation:command` | `deleteImprovement` | [src/distillation/desktop.ts:87](../../src/distillation/desktop.ts#L87) |
| `distillation:command` | `syncImprovement` | [src/distillation/desktop.ts:93](../../src/distillation/desktop.ts#L93) |
| `distillation:command` | `start` | [src/distillation/desktop.ts:97](../../src/distillation/desktop.ts#L97) |
| `distillation:command` | `job` | [src/distillation/desktop.ts:137](../../src/distillation/desktop.ts#L137) |
| `distillation:command` | `activity` | [src/distillation/desktop.ts:140](../../src/distillation/desktop.ts#L140) |
| `distillation:command` | `seen` | [src/distillation/desktop.ts:151](../../src/distillation/desktop.ts#L151) |
| `distillation:command` | `jobs` | [src/distillation/desktop.ts:158](../../src/distillation/desktop.ts#L158) |
| `distillation:command` | `snapshot` | [src/distillation/desktop.ts:163](../../src/distillation/desktop.ts#L163) |
| `distillation:command` | `cancel` | [src/distillation/desktop.ts:166](../../src/distillation/desktop.ts#L166) |
| `distillation:command` | `retry` | [src/distillation/desktop.ts:169](../../src/distillation/desktop.ts#L169) |
| `distillation:command` | `sourceReview` | [src/distillation/desktop.ts:173](../../src/distillation/desktop.ts#L173) |
| `distillation:command` | `draft` | [src/distillation/desktop.ts:176](../../src/distillation/desktop.ts#L176) |
| `distillation:command` | `update` | [src/distillation/desktop.ts:179](../../src/distillation/desktop.ts#L179) |
| `distillation:command` | `publish` | [src/distillation/desktop.ts:185](../../src/distillation/desktop.ts#L185) |
| `distillation:command` | `definitions` | [src/distillation/desktop.ts:191](../../src/distillation/desktop.ts#L191) |
| `distillation:command` | `definition` | [src/distillation/desktop.ts:193](../../src/distillation/desktop.ts#L193) |
| `distillation:command` | `setDefinitionCategory` | [src/distillation/desktop.ts:196](../../src/distillation/desktop.ts#L196) |
| `distillation:command` | `examples` | [src/distillation/desktop.ts:198](../../src/distillation/desktop.ts#L198) |
| `distillation:command` | `versions` | [src/distillation/desktop.ts:205](../../src/distillation/desktop.ts#L205) |
| `distillation:command` | `revise` | [src/distillation/desktop.ts:208](../../src/distillation/desktop.ts#L208) |
| `distillation:command` | `deleteDefinition` | [src/distillation/desktop.ts:210](../../src/distillation/desktop.ts#L210) |
| `distillation:command` | `create` | [src/distillation/desktop.ts:212](../../src/distillation/desktop.ts#L212) |
| `distillation:command` | `materialRecovery` | [src/distillation/desktop.ts:249](../../src/distillation/desktop.ts#L249) |
| `distillation:command` | `recoverMaterial` | [src/distillation/desktop.ts:251](../../src/distillation/desktop.ts#L251) |
| `distillation:command` | `instanceFiles` | [src/distillation/desktop.ts:254](../../src/distillation/desktop.ts#L254) |
| `distillation:command` | `updateInstanceFiles` | [src/distillation/desktop.ts:261](../../src/distillation/desktop.ts#L261) |
| `distillation:command` | `package` | [src/distillation/desktop.ts:264](../../src/distillation/desktop.ts#L264) |
| `distillation:command` | `artifacts` | [src/distillation/desktop.ts:271](../../src/distillation/desktop.ts#L271) |
| `distillation:command` | `attach` | [src/distillation/desktop.ts:277](../../src/distillation/desktop.ts#L277) |
| `distillation:command` | `accept` | [src/distillation/desktop.ts:293](../../src/distillation/desktop.ts#L293) |
| `distillation:command` | `dispatch` | [src/distillation/desktop.ts:297](../../src/distillation/desktop.ts#L297) |
| `workflow:command` | `queryRuns` | [src/workflows/desktop.ts:15](../../src/workflows/desktop.ts#L15) |
| `workflow:command` | `drafts` | [src/workflows/desktop.ts:16](../../src/workflows/desktop.ts#L16) |
| `workflow:command` | `draft` | [src/workflows/desktop.ts:17](../../src/workflows/desktop.ts#L17) |
| `workflow:command` | `saveDraft` | [src/workflows/desktop.ts:18](../../src/workflows/desktop.ts#L18) |
| `workflow:command` | `publishDraft` | [src/workflows/desktop.ts:19](../../src/workflows/desktop.ts#L19) |
| `workflow:command` | `removeDraft` | [src/workflows/desktop.ts:20](../../src/workflows/desktop.ts#L20) |
| `workflow:command` | `openOutput` | [src/workflows/desktop.ts:21](../../src/workflows/desktop.ts#L21) |
| `workflow:command` | `previewOutput` | [src/workflows/desktop.ts:27](../../src/workflows/desktop.ts#L27) |
| `workflow:command` | `catalog` | [src/workflows/desktop.ts:34](../../src/workflows/desktop.ts#L34) |
| `workflow:command` | `confirmPorts` | [src/workflows/desktop.ts:39](../../src/workflows/desktop.ts#L39) |
| `workflow:command` | `definition` | [src/workflows/desktop.ts:40](../../src/workflows/desktop.ts#L40) |
| `workflow:command` | `save` | [src/workflows/desktop.ts:41](../../src/workflows/desktop.ts#L41) |
| `workflow:command` | `runs` | [src/workflows/desktop.ts:42](../../src/workflows/desktop.ts#L42) |
| `workflow:command` | `detail` | [src/workflows/desktop.ts:43](../../src/workflows/desktop.ts#L43) |
| `workflow:command` | `create` | [src/workflows/desktop.ts:44](../../src/workflows/desktop.ts#L44) |
| `workflow:command` | `submit` | [src/workflows/desktop.ts:45](../../src/workflows/desktop.ts#L45) |
| `workflow:command` | `review` | [src/workflows/desktop.ts:46](../../src/workflows/desktop.ts#L46) |
| `workflow:command` | `rework` | [src/workflows/desktop.ts:47](../../src/workflows/desktop.ts#L47) |
| `workflow:command` | `impact` | [src/workflows/desktop.ts:48](../../src/workflows/desktop.ts#L48) |
| `workflow:command` | `adopt` | [src/workflows/desktop.ts:49](../../src/workflows/desktop.ts#L49) |
| `workflow:command` | `status` | [src/workflows/desktop.ts:50](../../src/workflows/desktop.ts#L50) |
| `workflow:command` | `dispatch` | [src/workflows/desktop.ts:51](../../src/workflows/desktop.ts#L51) |
| `feedback:command` | `draft` | [src/problem-reports/desktop.ts:10](../../src/problem-reports/desktop.ts#L10) |
| `feedback:command` | `save` | [src/problem-reports/desktop.ts:11](../../src/problem-reports/desktop.ts#L11) |
| `feedback:command` | `add-image` | [src/problem-reports/desktop.ts:12](../../src/problem-reports/desktop.ts#L12) |
| `feedback:command` | `remove-image` | [src/problem-reports/desktop.ts:13](../../src/problem-reports/desktop.ts#L13) |
| `feedback:command` | `discard` | [src/problem-reports/desktop.ts:14](../../src/problem-reports/desktop.ts#L14) |
| `feedback:command` | `fault` | [src/problem-reports/desktop.ts:15](../../src/problem-reports/desktop.ts#L15) |
| `feedback:command` | `submit` | [src/problem-reports/desktop.ts:16](../../src/problem-reports/desktop.ts#L16) |
| `feedback:command` | `list` | [src/problem-reports/desktop.ts:17](../../src/problem-reports/desktop.ts#L17) |
| `feedback:command` | `get` | [src/problem-reports/desktop.ts:18](../../src/problem-reports/desktop.ts#L18) |
| `feedback:command` | `remote` | [src/problem-reports/desktop.ts:19](../../src/problem-reports/desktop.ts#L19) |
| `feedback:command` | `remote-detail` | [src/problem-reports/desktop.ts:20](../../src/problem-reports/desktop.ts#L20) |
| `feedback:command` | `retry` | [src/problem-reports/desktop.ts:21](../../src/problem-reports/desktop.ts#L21) |
| `feedback:command` | `cancel` | [src/problem-reports/desktop.ts:22](../../src/problem-reports/desktop.ts#L22) |
| `feedback:command` | `delete-remote` | [src/problem-reports/desktop.ts:23](../../src/problem-reports/desktop.ts#L23) |
| `feedback:command` | `capture` | [src/problem-reports/desktop.ts:24](../../src/problem-reports/desktop.ts#L24) |
| `feedback:command` | `add-capture` | [src/problem-reports/desktop.ts:28](../../src/problem-reports/desktop.ts#L28) |
| `feedback:command` | `export` | [src/problem-reports/desktop.ts:32](../../src/problem-reports/desktop.ts#L32) |
| `feedback:command` | `renderer-error` | [src/problem-reports/desktop.ts:39](../../src/problem-reports/desktop.ts#L39) |

## 核心模块方法签名

只列显式公开的方法、访问器与构造器。省略 private/# 成员；未标注返回类型的方法保留原状，须查看实现，不能据此推定 void。

### AppService

[src/app/app-service.ts:96](../../src/app/app-service.ts#L96)

```typescript
constructor(readonly options: AppServiceOptions);
async listExecutors(): Promise<ExecutorView[]>;
async listConversations(executorId: string): Promise<ConversationView[]>;
async listRecentConversations(): Promise<{
    threads: ConversationView[];
    errors: string[];
  }>;
async listConversationHistory(
    executorId: string,
    cursor?: string,
    searchTerm?: string,
  ): Promise<ConversationPageView>;
async captureForegroundContext(): Promise<CurrentApplicationContext | null>;
async getPetView(): Promise<PetView>;
async recordCurrentContext(): Promise<DashboardView>;
async createWorkFromCurrentContext(
    context: CurrentApplicationContext,
  ): Promise<DashboardView>;
consumeSourceSelection(): string | undefined;
async previewConversation(
    executorId: string,
    threadId: string,
  ): Promise<ConversationPreview>;
async createWorkFromConversation(
    request: CreateWorkRequest,
  ): Promise<DashboardView>;
async listSplitPoints(workId: string): Promise<SplitPointView[]>;
async createWorkFromMessage(
    request: CreateWorkFromMessageRequest,
  ): Promise<DashboardView>;
async refreshWork(workId: string): Promise<DashboardView>;
prepareContinuation(workId: string): Promise<ContinuationSnapshot>;
preparationNoticeRequired(): boolean;
previewSelectedContent(input: SelectedContent): { thread: NormalizedThread; notice: string };
importSelectedContent(input: SelectedContent): Promise<DashboardView>;
exportInlinePackage(workId: string): string;
async prepareWebTransfer(workId: string, adapterId?: string, prompt?: string): Promise<string>;
async syncHook(
    executorId: string,
    payload: Record<string, unknown>,
  ): Promise<{
    accepted: boolean;
    appendedCount: number;
    workInstanceId?: string;
  }>;
async syncRecordedWorks(): Promise<void>;
artifactPath(workId: string, itemId: string): string;
dashboard(workId?: string): DashboardView;
async dashboardWithContext(workId?: string): Promise<DashboardView>;
completeWork(workId: string): DashboardView;
archiveWork(workId: string): DashboardView;
resumeWork(workId: string): DashboardView;
async handoff(workId: string, executorId: string): Promise<DashboardView>;
async reopenHandoff(workId: string): Promise<DashboardView>;
cancelHandoff(workId: string, confirmation: string): DashboardView;
cancelRecording(workId: string, confirmation: string): DashboardView;
core(): WorkCore;
close(): void;
```

### DefinitionRepository

[src/definitions/repository.ts:77](../../src/definitions/repository.ts#L77)

```typescript
constructor(
    readonly db: DatabaseSync,
    directory: string,
  );
collectUnusedMaterials(copied: Material[] = []): void;
read<T>(
    table: "source_snapshots" | "distillation_jobs" | "definition_drafts",
    id: string,
  ): T;
write(
    table: "source_snapshots" | "distillation_jobs" | "definition_drafts",
    value: { id: string },
  ): void;
list<T>(
    table: "source_snapshots" | "distillation_jobs" | "definition_drafts",
  ): T[];
command<T>(id: string, input: unknown, owner: string, run: () => T): T;
get(id: string): Definition;
setCategory(input: { definitionKey: string; category: string }): string;
definitions(input: { cursor?: string; limit?: number } = {}): {
    items: Definition[];
    cursor: string | null;
  };
versions(key: string): Definition[];
saveDraft(draft: Draft): Draft;
evolutionHistory(definitionKey: string): (EvolutionReview & { definitionKey: string; definitionId: string; at: string })[];
revise(input: { definitionId: string; commandId: string }): Draft;
update(input: {
    draftId: string;
    expectedRevision: number;
    content: DefinitionContent;
    issueResolutions: Resolution[];
    replaceResolutions?: boolean;
    materialBindings?: Record<string, string>;
  }): Draft;
publish(input: {
    sourceReviewHash?: string;
    draftId: string;
    expectedRevision: number;
    materialBindings: Record<string, string>;
    commandId: string;
  }): Definition;
create(input: CreateFromDefinition): string;
updateInstanceFiles(input: UpdateInstanceFiles): void;
inputs(workId: string): InstanceInputs;
accept(input: {
    workId: string;
    artifactIds: string[];
    criteriaResults: Record<string, "PASS" | "NEEDS_REVISION">;
    commandId: string;
  }, workflowReview = false): { completed: boolean };
delete(input: {
    definitionKey: string;
    confirmation: string;
    commandId: string;
  }): void;
redactSource(workId: string): void;
```

### DistillationService

[src/distillation/service.ts:99](../../src/distillation/service.ts#L99)

```typescript
close(): void;
async tick(): Promise<void>;
constructor(
    readonly core: WorkCore,
    readonly client: AIClient,
    now = Date.now,
  );
collectFeedback(): void;
evolutionSources(definitionId: string);
prepare(input: { workIds: string[]; includedFileIds: string[]; fileRoles?: Record<string, DocumentRole>; baseDefinitionId?: string }, allowedEvents?: Set<string>): Snapshot;
wire(snapshot: Snapshot): ExtractionRequest;
refs(snapshot: Snapshot): SourceRef[];
assertSources(snapshot: Snapshot, unchanged: boolean): void;
start(input: {
    preparationId: string;
    expectedContentHash: string;
    consentVersion: string;
    commandId: string;
  }, automatic?: AutomaticComparison): Job;
async submit(job: Job): Promise<void>;
async get(id: string): Promise<Job>;
async receive(job: Job, remote: RemoteJob): Promise<void>;
async cancel(id: string): Promise<Job>;
retry(input: {
    jobId: string;
    expectedContentHash: string;
    commandId: string;
  }): Job;
```

### DistillationDesktop

[src/distillation/desktop.ts:18](../../src/distillation/desktop.ts#L18)

```typescript
constructor(
    readonly app: AppService,
    readonly client: AIClient,
  );
async call(action: string, input: unknown = {}): Promise<unknown>;
async dispatch(input: {
    workId: string;
    commandId: string;
    executorId: string;
  }): Promise<unknown>;
```

### WorkflowCore

[src/workflows/core.ts:13](../../src/workflows/core.ts#L13)

```typescript
constructor(readonly core: WorkCore, readonly repository: DefinitionRepository);
get db();
definitions(): WorkflowDefinition[];
definition(id: string): WorkflowDefinition;
save(input: { content: WorkflowContent; baseId?: string; commandId: string }): WorkflowDefinition;
runs(workflowId?: string): WorkflowRun[];
run(id: string): WorkflowRun;
event(run: WorkflowRun, type: string, detail: string, nodeId?: string): void;
command<T>(input: RunCommand, op: string, action: (run: WorkflowRun, definition: WorkflowDefinition) => T): T;
node(run: WorkflowRun, input: NodeCommand): NodeRun;
create(input: { workflowId: string; name: string; inputs: Inputs; commandId: string }): string;
output(run: WorkflowRun, nodeId: string, key: string): OutputVersion;
prepare(input: NodeCommand): string;
context(workId: string);
assertActive(workId: string): void;
submit(input: NodeCommand & { outputs: Inputs }): void;
review(input: ReviewCommand): void;
rework(input: NodeCommand & { note: string }): void;
impact(runId: string, sourceNodeId: string): string[];
adopt(input: NodeCommand): void;
setStatus(input: RunCommand & { status: 'RUNNING' | 'PAUSED' | 'CANCELLED' }): void;
detail(id: string): RunDetail;
```

### WorkflowDrafts

[src/workflows/drafts.ts:10](../../src/workflows/drafts.ts#L10)

```typescript
constructor(private readonly workflows: WorkflowCore);
get(id: string): WorkflowDraft;
list(): DraftSummary[];
save(input: { id: string; expectedRevision: number; content: WorkflowContent; selectedNode: string; baseId?: string }): WorkflowDraft;
publish(input: { id: string; expectedRevision: number; commandId: string }): WorkflowDefinition;
remove(input: { id: string; expectedRevision: number }): void;
```

### WorkflowDesktop

[src/workflows/desktop.ts:10](../../src/workflows/desktop.ts#L10)

```typescript
constructor(readonly app: AppService, readonly distillation: DistillationDesktop, readonly openPath: (path: string) => Promise<unknown>);
async call(action: string, input: unknown = {}): Promise<unknown>;
```

### WorketAIClient

[src/ai-service/client.ts:31](../../src/ai-service/client.ts#L31)

```typescript
constructor(
    readonly config: () => ServiceConfig,
    readonly connect?: () => Promise<void>,
    readonly diagnostics?: import("../diagnostics/recorder.js").Diagnostics,
  );
async request(
    path: string,
    method = "GET",
    body?: unknown,
    key?: string,
    beforeSend?: () => void,
  ): Promise<any>;
improvementIdentity();
uploadSample(input: SampleUpload, beforeSend?: () => void);
deleteSample(id: string, beforeSend?: () => void);
capabilities();
async continuation(request: ContinuationRequest, beforeSend: () => void): Promise<unknown>;
submit(request: ExtractionRequest, key: string, beforeSend?: () => void): Promise<RemoteJob>;
get(id: string, beforeSend?: () => void): Promise<RemoteJob>;
cancel(id: string, beforeSend?: () => void);
ack(id: string, beforeSend?: () => void);
```

## 核心数据类型原文

下列文件中的导出 type/interface 为选定的核心业务与协议范围；工具函数、UI 私有类型及未选文件请沿源码继续查阅。交叉引用的 TypeScript 类型保留引用，不自动展开。

### src/core/types.ts

[src/core/types.ts:16](../../src/core/types.ts#L16)

```typescript
export type WorkStateField = (typeof WORK_STATE_FIELDS)[number];
export type WorkStatus = "OPEN" | "COMPLETED" | "ARCHIVED";
export type EpisodeStatus = "ACTIVE" | "ENDED";
export type BindingStatus = "ACTIVE" | "INACTIVE";
export type WorkStateOrigin =
  | "USER_STATED"
  | "AGENT_PROPOSED"
  | "SYSTEM_INFERRED"
  | "USER_EDITED";
export interface WorkStateItem {
  id: string;
  text: string;
  origin: WorkStateOrigin;
  sourceMessageIds: string[];
  editedAt?: string;
  originalText?: string;
}
export type ExtractedWorkStateItem = Omit<WorkStateItem, "origin" | "editedAt" | "originalText"> & {
  origin: Exclude<WorkStateOrigin, "USER_EDITED">;
};
export type WorkStatePatch = Partial<
  Record<WorkStateField, ExtractedWorkStateItem[]>
>;
export type WorkState = Record<WorkStateField, WorkStateItem[]>;
export interface Executor {
  type: "HUMAN" | "AGENT" | "TOOL" | "SAAS";
  name: string;
}
export interface ExecutionEnvironment {
  type: string;
  name: string;
}
export interface WorkDefinition {
  kind?: "GENERAL" | "REUSABLE";
  id: string;
  key: string;
  name: string;
  version: number;
}
export interface WorkInstance {
  id: string;
  definitionId: string;
  status: WorkStatus;
  createdAt: string;
  updatedAt: string;
}
export interface WorkRecord {
  id: string;
  workInstanceId: string;
}
export interface ExecutionEpisode {
  id: string;
  workInstanceId: string;
  executor: Executor;
  environment: ExecutionEnvironment;
  status: EpisodeStatus;
  startedAt: string;
  endedAt: string | null;
}
export interface CaptureBinding {
  id: string;
  workInstanceId: string;
  episodeId: string;
  adapter: string;
  conversationId: string;
  sourceLocator: string | null;
  status: BindingStatus;
}
export type CaptureBindingSource = Pick<CaptureBinding, "adapter" | "conversationId"> & {
  sourceLocator?: string;
};
export interface ArtifactRef {
  id: string;
  workInstanceId: string;
  episodeId: string | null;
  path: string;
  role: string;
  filename: string;
  mimeType: string | null;
  size: number;
  sha256: string;
  lastModifiedAt: string;
  availability: "AVAILABLE" | "CHANGED" | "MISSING";
}
export type ArtifactRefInput = Omit<
  ArtifactRef,
  "id" | "workInstanceId" | "episodeId"
> & { episodeId?: string | null };
export type SourceEventKind =
  | "work.acceptance"
  | "work.definition_applied"
  | "work.input_provided"
  | "conversation.title"
  | "source.check"
  | "source.absent"
  | "user.prompt"
  | "agent.response"
  | "tool.call"
  | "tool.result"
  | "reasoning.summary"
  | "artifact.added"
  | "artifact.changed";
export interface SourceEvent {
  id: string;
  workInstanceId: string;
  externalId: string;
  sequence: number;
  kind: SourceEventKind;
  content: string | null;
  timestamp: string;
  executorType: Executor["type"];
  environmentType: string;
  metadata: Record<string, unknown>;
  artifactRefs: string[];
  episodeId: string | null;
}
export type SourceEventInput = Omit<
  SourceEvent,
  "id" | "workInstanceId" | "episodeId"
> & { episodeId?: string };
export interface WorkSnapshot {
  packageReadAt?: string | null;
  packageDeliveryId?: string | null;
  definition: WorkDefinition;
  instance: WorkInstance;
  record: WorkRecord;
  episodes: ExecutionEpisode[];
  bindings: CaptureBinding[];
  activeEpisode: ExecutionEpisode | null;
  activeBinding: CaptureBinding | null;
  state: WorkState;
  sourceArchive: SourceEvent[];
  artifactRefs: ArtifactRef[];
  handoffPackages: HandoffPackage[];
}
export interface HandoffPackage {
  sourceNotice?: string;
  workPackage?: WorkPackage;
  continuation?: ContinuationSnapshot;
  id: string;
  workInstanceId: string;
  workDefinition: { key: string; version: number };
  generatedAt: string;
  currentTask: string | null;
  nextStep: string | null;
  state: WorkState;
  neededArtifacts: ArtifactRef[];
  sourceArchiveSummary: {
    eventCount: number;
    artifactCount: number;
  };
}
export interface CreateWorkInput {
  definition: Pick<WorkDefinition, "key" | "name" | "version">;
  objective?: string;
  objectiveSourceMessageIds?: string[];
  executor: Executor;
  environment: ExecutionEnvironment;
  source: CaptureBindingSource;
}
export interface ResumeWorkInput {
  executor: Executor;
  environment: ExecutionEnvironment;
  source: CaptureBindingSource;
}
export interface StartExecutionEpisodeInput extends ResumeWorkInput {
  endCurrentEpisode?: boolean;
}
export interface WorkCoreOptions {
  databasePath: string;
  now?: () => string;
  id?: () => string;
}
export interface WorkCore {
  readonly definitions: DefinitionRepository;
  readonly workflows: WorkflowCore;
  createWorkFromDefinition(input: CreateFromDefinition): WorkSnapshot;
  createWork(input: CreateWorkInput): WorkSnapshot;
  getWork(workInstanceId: string): WorkSnapshot | null;
  sourceCheckpoint(workInstanceId: string): { rowId: number; recording: boolean } | null;
  listWorks(status?: WorkStatus): WorkSnapshot[];
  findWorkByBinding(adapter: string, conversationId: string): WorkSnapshot | null;
  findWorkBySourceLocator(adapter: string, sourceLocator: string): WorkSnapshot | null;
  appendSourceEvents(
    workInstanceId: string,
    events: SourceEventInput[],
  ): { appendedCount: number; duplicateCount: number; work: WorkSnapshot };
  extractedSequence(workInstanceId: string): number;
  applyExtractorPatch(workInstanceId: string, patch: WorkStatePatch, throughSequence?: number): WorkSnapshot;
  completeWork(workInstanceId: string): WorkSnapshot;
  archiveWork(workInstanceId: string): WorkSnapshot;
  stopCapture(workInstanceId: string): WorkSnapshot;
  resumeWork(workInstanceId: string, input: ResumeWorkInput): WorkSnapshot;
  startExecutionEpisode(
    workInstanceId: string,
    input: StartExecutionEpisodeInput,
  ): WorkSnapshot;
  bindConversation(
    workInstanceId: string,
    adapter: string,
    previousConversationId: string,
    conversationId: string,
    sourceLocator?: string,
  ): WorkSnapshot;
  recordPackageRead(workInstanceId: string, deliveryId: string): boolean;
  createHandoffPackage(workInstanceId: string, options?: { continuation?: ContinuationSnapshot }): HandoffPackage;
  getLatestHandoffPackage(workInstanceId: string): HandoffPackage | null;
  addArtifactRef(workInstanceId: string, artifact: ArtifactRefInput): WorkSnapshot;
  deleteWorkPermanently(
    workInstanceId: string,
    input: { confirmation: string },
  ): void;
  close(): void;
}
```

### src/ui-contract.ts

[src/ui-contract.ts:13](../../src/ui-contract.ts#L13)

```typescript
export type WorkStateField = keyof typeof WORK_STATE_LABELS;
export type WorkStatus = "OPEN" | "COMPLETED" | "ARCHIVED";
export type PetState = "sleeping" | "awake" | "waiting" | "carrying" | "alert";
export type CaptureStatus = "recording" | "waiting" | "stopped" | "selected";
export interface StateItemView {
  file?: { name: string; path: string; url: string };
  id: string;
  text: string;
  origin: "USER_STATED" | "AGENT_PROPOSED" | "SYSTEM_INFERRED" | "USER_EDITED";
  sourceMessageIds: string[];
}
export type WorkStateView = Record<WorkStateField, StateItemView[]>;
export interface WorkSummaryView {
  id: string;
  agentName: string;
  title: string;
  status: WorkStatus;
  captureStatus: CaptureStatus;
  updatedAt: string;
  eventCount: number;
  artifactCount: number;
  episodeCount: number;
}
export interface WorkDetailView extends WorkSummaryView {
  workflowRunId?: string;
  preparationStatus?: "RUNNING" | "QUEUED";
  understandingStatus?: "RESOLVED" | "PARTIAL" | "UNRESOLVED" | "STALE";
  understandingNotice?: string;
  currentStageTask?: string;
  sourceNotice?: string;
  latestActivity?: { text: string; sourceMessageId: string };
  reusableDefinitionId?: string;
  hasInstanceFiles?: boolean;
  hasPinnedMaterials?: boolean;
  dispatchStatus?: string;
  dispatchReadAt?: string | null;
  state: WorkStateView;
  episodes: Array<{
    id: string;
    executor: string;
    environment: string;
    status: "ACTIVE" | "ENDED";
    startedAt: string;
    endedAt: string | null;
  }>;
  bindings: Array<{
    id: string;
    episodeId: string;
    adapter: string;
    conversationId: string;
    status: "ACTIVE" | "INACTIVE";
  }>;
}
export interface ExecutorView {
  capabilities?: import("./executors/types.js").ConnectorCapabilities;
  id: string;
  name: string;
  mark: string;
  available: boolean;
  canDeliver: boolean;
  deliveryError?: string;
  error?: string;
}
export interface DashboardView {
  sourceSelection?: string;
  petState: PetState;
  selectedWorkId: string | null;
  works: WorkSummaryView[];
  selectedWork: WorkDetailView | null;
  notice: string | null;
}
export interface CurrentConversationView {
  adapter: string;
  applicationName: string;
  mark?: string;
  needsSelection?: boolean;
  title: string;
  workId: string | null;
  workStatus: WorkStatus | null;
  isRecording: boolean;
  captureStatus?: CaptureStatus;
}
export type PetUpdateState = "none" | "available" | "receiving" | "ready";
export interface PetView {
  updateState?: PetUpdateState;
  distillation?: import("./distillation/activity.js").DistillationActivity | null;
  placement?: PetPlacement;
  edge?: "left" | "right" | "top" | "bottom" | null;
  recordingUploadNoticeRequired?: boolean;
  petState: PetState;
  currentConversation: CurrentConversationView | null;
}
export interface ConversationView {
  executorId: string;
  id: string;
  agentName: string;
  title: string | null;
  preview: string;
  cwd: string;
  projectLabel?: string;
  updatedAt: string;
  status: unknown;
  workId?: string;
}
export interface ConversationPageView {
  notice?: string;
  threads: ConversationView[];
  nextCursor: string | null;
}
export interface ConversationPreview extends ConversationView {
  messageCount: number;
  userPromptCount: number;
  agentResponseCount: number;
  artifactCount: number;
  toolEventCount: number;
}
export interface CreateWorkRequest {
  executorId: string;
  threadId: string;
  /** Legacy callers may pass this; automatic preparation is scoped by the recording action. */
  allowCloudExtraction?: boolean;
}
export interface SplitPointView {
  externalId: string;
  label: string;
  timestamp: string;
}
export interface CreateWorkFromMessageRequest {
  sourceWorkId: string;
  startExternalId: string;
}
export interface WorkPetApi {
  workflow(action: string, input?: unknown): Promise<any>;
  onWorkflowDraftFlush(callback: () => Promise<void>): () => void;
  previewSelectedContent(input: import("./connectors/selected-content.js").SelectedContent): Promise<{ thread: import("./adapters/types.js").NormalizedThread; notice: string }>;
  importSelectedContent(input: import("./connectors/selected-content.js").SelectedContent): Promise<DashboardView>;
  listSelectedInbox(): Promise<{ id: string; title: string; adapterId: string; expiresAt: number }[]>;
  readSelectedInbox(id: string): Promise<import("./connectors/selected-content.js").SelectedContent>;
  removeSelectedInbox(id: string): Promise<void>;
  chooseSelectedImport(): Promise<import("./connectors/selected-content.js").SelectedContent | null>;
  exportInlinePackage(workId: string): Promise<string | null>;
  copyInlinePackage(workId: string): Promise<void>;
  feedback(action: string, input?: unknown): Promise<any>;
  onFeedbackCollapse(callback: () => void): () => void;
  resizePanelRight(phase: "start" | "move" | "end", screenX: number): void;
  openArtifact(workId: string, itemId: string): Promise<void>;
  distillation(action: string, input?: unknown): Promise<any>;
  chooseDefinitionFile(kind?: "SKILL"): Promise<string | null>;
  exportWorkPackage(workId: string): Promise<string | null>;
  copyWorkPackage(workId: string): Promise<void>;
  configureWorketService(input: { url: string; token: string }): Promise<void>;
  getWorketServiceStatus(): Promise<{ url: string; automatic: boolean; hasCredential: boolean; expiresAt: string | null; userId: string | null; deviceId: string | null; hasRecoveryCode: boolean }>;
  copyWorketRecoveryCode(): Promise<void>;
  restoreWorketAccount(recoveryCode: string): Promise<void>;
  recordCurrentContextFromPet(): Promise<DashboardView>;
  getPetView(): Promise<PetView>;
  openDistillationFromPet(): Promise<void>;
  onOpenDistillation(callback: (jobId: string) => void): () => void;
  togglePanelFromPet(): Promise<void>;
  setPetMousePassthrough(ignored: boolean): void;
  onPetPlacement(callback: (placement: PetPlacement) => void): () => void;
  dragPet(
    phase: "start" | "move" | "end",
    cursor?: { x: number; y: number },
  ): void;
  getDashboard(workId?: string): Promise<DashboardView>;
  listExecutors(): Promise<ExecutorView[]>;
  listConversations(executorId: string): Promise<ConversationView[]>;
  listRecentConversations(): Promise<{
    threads: ConversationView[];
    errors: string[];
  }>;
  listConversationHistory(
    executorId: string,
    cursor?: string,
    searchTerm?: string,
  ): Promise<ConversationPageView>;
  previewConversation(
    executorId: string,
    threadId: string,
  ): Promise<ConversationPreview>;
  createWorkFromConversation(
    request: CreateWorkRequest,
  ): Promise<DashboardView>;
  listSplitPoints(workId: string): Promise<SplitPointView[]>;
  createWorkFromMessage(
    request: CreateWorkFromMessageRequest,
  ): Promise<DashboardView>;
  consumeSourceSelection(): Promise<string | undefined>;
  refreshWork(workId: string): Promise<DashboardView>;
  completeWork(workId: string): Promise<DashboardView>;
  archiveWork(workId: string): Promise<DashboardView>;
  resumeWork(workId: string): Promise<DashboardView>;
  reopenHandoff(workId: string): Promise<DashboardView>;
  cancelHandoff(workId: string, confirmation: string): Promise<DashboardView>;
  handoff(workId: string, executorId: string): Promise<DashboardView>;
  cancelRecording(workId: string, confirmation: string): Promise<DashboardView>;
  onPanelShown(callback: (workId?: string) => void): () => void;
  closePanel(): Promise<void>;
}
```

### src/contracts/definition.ts

[src/contracts/definition.ts:4](../../src/contracts/definition.ts#L4)

```typescript
export type Origin = "USER_STATED" | "AGENT_PROPOSED" | "SYSTEM_INFERRED" | "DOCUMENT_STATED";
export type SourceRef = {
  snapshotId: string;
  workId: string;
  eventId: string;
  excerpt?: string;
  role?: "CONTEXT";
  deleted?: boolean;
};
export type Basis =
  | { type: "SOURCE"; origin: Origin; refs: SourceRef[] }
  | { type: "INFERRED"; refs: SourceRef[]; rationale: string }
  | { type: "USER_AUTHORED"; reviewEventId: string };
export type PortValueType = 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'CHOICE' | 'FILE';
export type DefinedItem = { key: string; text: string; basis: Basis; rule?: RulePolicy; document?: DocumentClause; valueType?: PortValueType; choices?: string[] };
export type InputSpec = DefinedItem & {
  valueType: "TEXT" | "NUMBER" | "BOOLEAN" | "CHOICE" | "FILE";
  required: boolean;
  choices?: string[];
  defaultValue?: string | number | boolean;
};
export type DefinitionContent = {
  schemaVersion: 1;
  name: string;
  purpose: DefinedItem;
  inputs: InputSpec[];
  deliverables: DefinedItem[];
  constraints: DefinedItem[];
  acceptanceCriteria: DefinedItem[];
  methods: (DefinedItem & { obligation: "REFERENCE" | "REQUIRED" })[];
  materialRoles: (DefinedItem & { required: boolean; kind?: "SKILL" })[];
};
export type Issue = {
  id: string;
  type:
    | "MISSING_INFORMATION"
    | "CONFLICT"
    | "UNCERTAIN_GENERALIZATION"
    | "UNSUPPORTED_SOURCE";
  field: string;
  message: string;
  blocking: boolean;
};
export type Resolution = {
  issueId: string;
  action: "REWRITE" | "DELETE" | "CHOOSE" | "ACCEPT";
  explanation: string;
};
export type WireEvent = {
  document?: { name: string; role: DocumentRole };
  key: string;
  sequence: number;
  kind: string;
  content: string;
  hash: string;
};
export type ExtractionRequest = {
  schemaVersion: 1;
  analysis?: { schemaVersion: 1; ruleVersion: string; originalEvents: number; omittedEvents: number; excerptEvents: number };
  ruleSchemaVersion?: 1;
  evidenceSchemaVersion?: 1;
  skillSchemaVersion?: 1;
  evolution?: EvolutionBaseline;
  snapshotHash: string;
  sources: { key: string; events: WireEvent[] }[];
};
export type ExtractionResult = {
  schemaVersion: 1;
  compatibility: "COMPATIBLE" | "CONFLICTING" | "UNRELATED";
  content: DefinitionContent | null;
  evolution?: EvolutionResult;
  issues: Issue[];
  groups: { sourceKeys: string[]; reason: string }[];
  requirements: {
    id: string;
    text: string;
    scope: "INSTANCE" | "REUSABLE" | "UNCERTAIN";
    sourceKeys: string[];
    replacedBy: string | null;
  }[];
  coverage: {
    inputEvents: number;
    processedEvents: number;
    processedChunks: number;
    eventKeys: string[];
    exclusions: { key: string; reason: string }[];
  };
  versions: { schema: number; prompt: string; model: string };
};
```

### src/contracts/rules.ts

[src/contracts/rules.ts:3](../../src/contracts/rules.ts#L3)

```typescript
export type DocumentRole = 'NORMATIVE' | 'REFERENCE' | 'INPUT';
export type RulePolicy = {
  scope: 'REUSABLE' | 'INSTANCE' | 'UNCERTAIN';
  status: 'ACTIVE' | 'PROPOSED' | 'RETIRED';
  condition?: string;
  relation?: { kind: 'DUPLICATE' | 'SUPPLEMENTS' | 'REPLACES' | 'CONFLICT'; target: string };
};
export type DocumentClause = {
  source: SourceRef;
  startLine: number;
  endLine: number;
  hash: string;
  name: string;
};
export type InstanceOverride = { target: string; text: string };
export type EffectiveRules = { content: DefinitionContent; omitted: { address: string; reason: string; retained?: string }[] };
```

### src/contracts/evolution.ts

[src/contracts/evolution.ts:5](../../src/contracts/evolution.ts#L5)

```typescript
export type EvolutionSection = typeof evolutionSections[number];
export type EvolutionBaseline = { contentHash: string; content: DefinitionContent };
export type EvolutionChange = {
  kind: 'ADD' | 'DUPLICATE' | 'REPLACES' | 'SUPPLEMENTS' | 'CONFLICT';
  section: EvolutionSection;
  item: DefinedItem & Partial<Pick<InputSpec, 'valueType' | 'required' | 'choices' | 'defaultValue'>> & { obligation?: 'REFERENCE' | 'REQUIRED'; kind?: 'SKILL' };
  target?: string;
};
export type EvolutionResult = { baseHash: string; changes: EvolutionChange[] };
```

### src/contracts/continuation.ts

[src/contracts/continuation.ts:5](../../src/contracts/continuation.ts#L5)

```typescript
export type ContinuationRequest = { schemaVersion: 1; input: ContinuationGeneratorInput };
```

### src/contracts/improvement.ts

[src/contracts/improvement.ts:10](../../src/contracts/improvement.ts#L10)

```typescript
export type SampleEvent = {
  id: string;
  kind: typeof SAMPLE_EVENT_KINDS[number];
  at: string;
  data: Record<string, unknown>;
};
export type SampleUpload = {
  schemaVersion: 1 | 2 | 3;
  sampleId: string;
  consent: { version: string; at: string; scope: "DISTILLATION" | "REUSE" | "RECORDING" };
  event: SampleEvent;
};
```

### src/contracts/problem-report.ts

[src/contracts/problem-report.ts:13](../../src/contracts/problem-report.ts#L13)

```typescript
export type ReportState = typeof REPORT_STATES[number];
export type DiagnosticAction = typeof DIAGNOSTIC_ACTIONS[number];
export type DiagnosticEvent = { at: string; traceId: string; action: DiagnosticAction; phase: "start" | "complete" | "failed" | "pending" | "selected" | "open-requested" | "preparing" | "prepared" | "opening"; code?: string; elapsedMs?: number; requestId?: string; executor?: "codex" | "workbuddy"; count?: number };
export type DiagnosticSnapshot = { from: string; to: string; events: DiagnosticEvent[]; truncated: boolean; previousExit: boolean };
export type ReportImage = { id: string; mime: "image/png"; data: string; bytes: number; sha256: string; width: number; height: number };
export type ProblemReport = { schemaVersion: 1; reportId: string; occurredAt: string; submittedAt: string; description: string; environment: { version: string; platform: string; arch: string }; screenshots: ReportImage[]; diagnostics: DiagnosticSnapshot | null; authorization: { scopeVersion: 1; diagnostics: boolean } };
export type ReportEnvelope = { report: ProblemReport; sha256: string };
export type ReportReceipt = { reportId: string; sha256: string; receivedAt: string };
```

### src/definitions/repository.ts

[src/definitions/repository.ts:34](../../src/definitions/repository.ts#L34)

```typescript
export type Draft = {
  materials?: Material[];
  id: string;
  jobId?: string;
  baseDefinitionId?: string;
  revision: number;
  content: DefinitionContent;
  originalContent: DefinitionContent;
  refs: SourceRef[];
  issues: Issue[];
  resolutions: Resolution[];
  publishedId?: string;
  invalidated?: boolean;
  evolution?: EvolutionReview;
};
export type Definition = {
  id: string;
  definitionKey: string;
  version: number;
  kind: "REUSABLE";
  content: DefinitionContent;
  refs: SourceRef[];
  confirmedAt: string;
  contentHash: string;
  materials: Material[];
  category?: string;
};
export type Inputs = Record<string, string | number | boolean>;
export type CreateFromDefinition = {
  definitionId: string;
  inputs: Inputs;
  referenceExampleIds: string[];
  ruleOverrides?: InstanceOverride[];
  commandId: string;
};
```

### src/definitions/storage.ts

[src/definitions/storage.ts:47](../../src/definitions/storage.ts#L47)

```typescript
export type Material = {
  bundle?: SkillBundle;
  id: string;
  path: string;
  originalPath: string;
  hash: string;
  size: number;
  role: string;
};
```

### src/definitions/instance-files.ts

[src/definitions/instance-files.ts:7](../../src/definitions/instance-files.ts#L7)

```typescript
export type InstanceReference = { id: string; path: string; hash: string; filename: string; role: string; material?: Material };
export type InstanceInputs = { inputs: Inputs; referenceExamples: InstanceReference[]; ruleOverrides?: InstanceOverride[]; inputMaterials?: Material[] };
```

### src/definitions/instance-file-update.ts

[src/definitions/instance-file-update.ts:9](../../src/definitions/instance-file-update.ts#L9)

```typescript
export type UpdateInstanceFiles = {
  workId: string; files: Record<string, string>; removeReferenceIds: string[];
  expectedHash: string; commandId: string;
};
```

### src/definitions/evolution.ts

[src/definitions/evolution.ts:6](../../src/definitions/evolution.ts#L6)

```typescript
export type EvolutionReview = {
  baseHash: string;
  changes: { kind: EvolutionChange['kind']; address: string; target?: string; previousText?: string }[];
  evidence: { target: string; baselineText: string; refs: SourceRef[] }[];
  ignored: { reason: 'INSTANCE' | 'RETIRED'; refs: SourceRef[]; address?: string }[];
  sourceEvents: { workId: string; eventId: string; hash: string }[];
};
```

### src/definitions/skill-materials.ts

[src/definitions/skill-materials.ts:8](../../src/definitions/skill-materials.ts#L8)

```typescript
export type SkillFile = { path: string; hash: string; size: number; executable: boolean };
export type SkillBundle = { entrypoint: 'SKILL.md'; files: SkillFile[]; directories: string[] };
```

### src/definitions/work-package.ts

[src/definitions/work-package.ts:13](../../src/definitions/work-package.ts#L13)

```typescript
export type WorkPackage = {
  workflow?: ReturnType<typeof workflowWorkContext>;
  packageVersion: 1;
  continuation?: ContinuationSnapshot;
  stateStatus?: "RESOLVED" | "PARTIAL" | "UNRESOLVED" | "STALE";
  purpose: "START" | "CONTINUE";
  workId: string;
  generatedAt: string;
  definition: Definition | null;
  inputs: Inputs;
  inputMaterials?: Material[];
  ruleOverrides?: InstanceOverride[];
  acceptanceChecks?: { key: string; rule: string }[];
  ruleSources?: { rule: string; name: string; hash: string; startLine: number; endLine: number }[];
  fixedMaterials: Material[];
  skills: { name: string; required: boolean; entrypoint: string; directory: string; hash: string; files: string[] }[];
  referenceExamples: unknown[];
  state: WorkState;
  nextStep: string | null;
  acceptanceRequired: boolean;
  fileAccess: string;
  sourceNotice?: string;
};
```

### src/distillation/service.ts

[src/distillation/service.ts:31](../../src/distillation/service.ts#L31)

```typescript
export type Snapshot = {
  id: string;
  schemaVersion: 1;
  capturedAt: string;
  contentHash: string;
  baseDefinitionId?: string;
  baseContentHash?: string;
  analysis?: AnalysisInput;
  sources: {
    workId: string;
    key: string;
    title: string;
    status: string;
    events: {
      id: string;
      key: string;
      sequence: number;
      kind: string;
      content: string;
      hash: string;
    }[];
    files: {
      id: string;
      name: string;
      path: string;
      hash: string;
      availability?: "AVAILABLE" | "CHANGED" | "MISSING";
      content?: string;
      role?: DocumentRole;
    }[];
    deleted?: boolean;
  }[];
};
export type Job = {
  automatic?: AutomaticComparison;
  remoteDestination?: string;
  progress?: import("./activity.js").ExtractionProgress;
  seenStatus?: string;
  id: string;
  snapshotId: string;
  status:
    | "PREPARED"
    | "SUBMITTED"
    | "RUNNING"
    | "AWAITING_REVIEW"
    | "SAVED"
    | "NEEDS_SELECTION"
    | "FAILED"
    | "INTERRUPTED"
    | "CANCELLED";
  attempt: number;
  commandId: string;
  requestId?: string;
  draftId?: string;
  error?: string;
  ackPending?: boolean;
  cancelPending?: boolean;
  result?: ExtractionResult;
  createdAt: string;
};
```

### src/distillation/activity.ts

[src/distillation/activity.ts:3](../../src/distillation/activity.ts#L3)

```typescript
export type ExtractionProgress = { phase: "extract" | "generalize"; completed: number; total: number };
export type DistillationActivity = {
  jobId: string;
  state: "running" | "ready" | "failed";
  label: string;
  detail: string;
  activeCount: number;
  activeWorkIds: string[];
};
```

### src/distillation/analysis-input.ts

[src/distillation/analysis-input.ts:7](../../src/distillation/analysis-input.ts#L7)

```typescript
export type AnalysisEntry = {
  sourceKey: string; eventKey: string; sourceHash: string;
  action: 'KEEP' | 'EXCERPT' | 'OMIT' | 'DUPLICATE';
  reason: string; range?: { start: number; end: number }; duplicateOf?: string;
};
export type AnalysisInput = { schemaVersion: 1; ruleVersion: string; entries: AnalysisEntry[] };
```

### src/distillation/continuous-evolution.ts

[src/distillation/continuous-evolution.ts:11](../../src/distillation/continuous-evolution.ts#L11)

```typescript
export type AutomaticComparison = { definitionKey: string; generation: string; destination: string };
```

### src/handoff/continuation.ts

[src/handoff/continuation.ts:8](../../src/handoff/continuation.ts#L8)

```typescript
export type ContinuationClaim = {
  text: string;
  sourceEventIds: string[];
  excerpts: Array<{ sourceEventId: string; text: string }>;
  manualStateIds?: string[];
};
export type ContinuationEvidence = {
  id: string;
  object: string;
  version: string;
  scope: string;
  result: string;
  sourceEventId: string;
  excerpt: string;
};
export type ContinuationBasis = {
  sourceDigest: string;
  stateDigest: string;
  materialDigest: string;
  throughSequence: number;
  coverage: "COMPLETE" | "PARTIAL";
  missingEvidenceIds: string[];
};
export type ContinuationSnapshot = {
  schemaVersion: 1;
  resolution: "RESOLVED" | "PARTIAL" | "UNRESOLVED";
  basis: ContinuationBasis;
  objective: ContinuationClaim[];
  currentStageId: string | null;
  currentStageBasis: ContinuationClaim[];
  stages: Array<{
    id: string;
    task: ContinuationClaim;
    execution: "UNKNOWN" | "NOT_STARTED" | "IN_PROGRESS" | "REPORTED_DONE" | "SUPPORTED_DONE";
    completionEvidence: ContinuationEvidence[];
    outcomes: Array<{
      id: string;
      summary: ContinuationClaim;
      artifactRefId: string | null;
      version: string;
      checks: ContinuationEvidence[];
      acceptance: "UNKNOWN" | "ACCEPTED" | "NEEDS_CHANGES";
      acceptanceEvidence: ContinuationEvidence[];
    }>;
    dependsOn: Array<{ stageId: string; outcomeId: string; version: string }>;
    remaining: ContinuationClaim[];
    blockers: ContinuationClaim[];
  }>;
  requirements: Array<{
    id: string;
    kind: "CONSTRAINT" | "DECISION" | "SUCCESS_CRITERION";
    claim: ContinuationClaim;
    scope: { kind: "WORK" | "STAGE" | "OUTCOME"; ids: string[] };
    status: "ACTIVE" | "SUPERSEDED" | "CONFLICT";
    supersedes: string[];
    replacementEvidence: ContinuationClaim[];
  }>;
  uncertainties: ContinuationClaim[];
};
export type ContinuationMaterials = Array<{ id: string; version: string; availability: string }>;
export type ContinuationGeneratorInput = {
  basis: ContinuationBasis;
  events: Array<Pick<SourceEvent, "id" | "sequence" | "kind" | "timestamp" | "executorType" | "content" | "metadata">>;
  state: WorkState;
  materials: ContinuationMaterials;
  artifacts: Array<Pick<WorkSnapshot['artifactRefs'][number], 'id' | 'filename' | 'sha256' | 'availability' | 'role'>>;
};
export interface ContinuationGenerator {
  generate(input: ContinuationGeneratorInput): Promise<unknown>;
}
export type ContinuationInput = {
  work: WorkSnapshot;
  materials: ContinuationMaterials;
  cached?: ContinuationSnapshot;
};
export type ContinuationLoader = (workId: string) => Promise<ContinuationInput>;
export type ContinuationGeneratorProvider = (workId: string) => ContinuationGenerator | null;
```

### src/workflows/types.ts

[src/workflows/types.ts:6](../../src/workflows/types.ts#L6)

```typescript
export type ValueType = InputSpec['valueType'];
export type Port = { key: string; text: string; valueType: ValueType; required: boolean; choices?: string[]; defaultValue?: string | number | boolean };
export type Binding = { type: 'INPUT'; key: string } | { type: 'VALUE'; value: string | number | boolean } | { type: 'OUTPUT'; nodeId: string; key: string };
export type WorkflowNode = { id: string; name: string; contractId: string; bindings: Record<string, Binding>; after: string[] };
export type WorkflowContent = { name: string; inputs: Port[]; nodes: WorkflowNode[]; outputs: { key: string; nodeId: string; outputKey: string }[] };
export type WorkflowDefinition = WorkflowContent & { id: string; key: string; version: number; confirmedAt: string };
export type OutputVersion = { id: string; key: string; valueType: ValueType; value: string | number | boolean; material?: Material; artifactId?: string; acceptedAt?: string };
export type Adoption = { inputKey: string; nodeId: string; generation: number; outputId: string; outputKey: string };
export type NodeRun = { generation: number; phase: 'WAITING' | 'READY' | 'PREPARED' | 'SUBMITTED' | 'ACCEPTED' | 'SUPERSEDED'; workId?: string; directory?: string; manifestId?: string; adopted: Adoption[]; outputs: OutputVersion[]; note?: string; criteria?: Record<string, 'PASS' | 'NEEDS_REVISION'>; acceptedAt?: string };
export type WorkflowRun = { id: string; workflowId: string; name: string; status: 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED'; revision: number; createdAt: string; updatedAt: string; directory: string; inputs: Inputs; inputMaterials: Material[]; nodes: Record<string, NodeRun[]>; events: { at: string; type: string; nodeId?: string; detail: string }[] };
export type RunDetail = { run: WorkflowRun; definition: WorkflowDefinition; contracts: Record<string, Definition>; phases: Record<string, string>; updates: Record<string, string[]> };
export type RunCommand = { runId: string; expectedRevision: number; commandId: string };
export type NodeCommand = RunCommand & { nodeId: string; generation: number };
```

### src/workflows/drafts.ts

[src/workflows/drafts.ts:6](../../src/workflows/drafts.ts#L6)

```typescript
export type WorkflowDraft = { id: string; baseId?: string; revision: number; content: WorkflowContent; selectedNode: string; updatedAt: string; publishedId?: string };
export type DraftSummary = Pick<WorkflowDraft, 'id' | 'baseId' | 'revision' | 'updatedAt'> & { name: string };
```

### src/workflows/queries.ts

[src/workflows/queries.ts:5](../../src/workflows/queries.ts#L5)

```typescript
export type RunSummary = { id: string; name: string; workflowId: string; workflowKey: string; workflowName: string; version: number; status: WorkflowRun['status']; revision: number; updatedAt: string; accepted: number; total: number; review: { nodeId: string; name: string; generation: number }[] };
export type RunQuery = { workflowKey?: string; status?: WorkflowRun['status']; search?: string; review?: boolean; cursor?: { updatedAt: string; id: string }; limit?: number };
export type RunPage = { items: RunSummary[]; cursor: RunQuery['cursor'] | null };
```

### src/workflows/outputs.ts

[src/workflows/outputs.ts:32](../../src/workflows/outputs.ts#L32)

```typescript
export type ReviewCommand = NodeCommand & { decision: 'PASS' | 'REVISE'; criteria: Record<string, 'PASS' | 'NEEDS_REVISION'>; note?: string };
```

### src/executors/types.ts

[src/executors/types.ts:6](../../src/executors/types.ts#L6)

```typescript
export interface ConversationSummary {
  id: string;
  title: string | null;
  preview: string;
  cwd: string;
  updatedAt: string;
  status: unknown;
}
export interface ConversationPage {
  threads: ConversationSummary[];
  nextCursor: string | null;
  notice?: string;
}
export interface ConversationSource {
  listThreadPage?(limit?: number, cursor?: string, searchTerm?: string): Promise<ConversationPage>;
  listRecentThreads?(limit?: number): Promise<ConversationSummary[]>;
  readThread(id: string): Promise<NormalizedThread>;
  close(): void;
}
export type DeliveryMode = "MCP_REFERENCE" | "INLINE_PACKAGE";
export interface ConnectorCapabilities {
  deliveryMode: DeliveryMode;
  transport: "DEEP_LINK" | "CLIPBOARD" | "WEB_CLIPBOARD";
  source: "HISTORY" | "HOOK_EVENTS" | "SELECTED_CONTENT";
  mcp: boolean;
  manualSelection?: boolean;
  sendsAutomatically: boolean;
  files: "LOCAL_REFERENCES" | "MANUAL_UPLOAD" | "EXTENSION_UPLOAD";
}
export interface DeliveryRequest {
  workId: string;
  deliveryId: string;
  title: string;
  purpose: "START" | "CONTINUE";
  /** Final application-owned bootstrap. Adapters transport it without rewriting. */
  prompt: string;
  cwd?: string;
}
export interface DeliveryReceipt {
  /** Observed transport result; never evidence of sending or reading. */
  status?: "OPEN_REQUESTED" | "OPENED" | "DRAFT_PREPARED";
  conversationId?: string;
  guidance?: string;
}
export interface ExecutorAdapter {
  id: string;
  name: string;
  mark: string;
  bundleIds: readonly string[];
  environment: ExecutionEnvironment;
  source?: ConversationSource;
  capabilities?: ConnectorCapabilities;
  installation?: "EXPLICIT";
  normalizeHook?(payload: Record<string, unknown>): import("../connectors/selected-content.js").SelectedContent | null;
  reconcileHistory?(
    thread: NormalizedThread,
    archive: readonly SourceEvent[],
  ): NormalizedThread;
  resolveCurrent(
    application: ForegroundApplication,
  ): Promise<ConversationSummary | null>;
  install?(appPath: string): Promise<string>;
  inspect(): Promise<void>;
  /** Check delivery transport independently of history; legacy adapters share inspect. */
  inspectDelivery?(): Promise<void>;
  deliver?(request: DeliveryRequest): Promise<DeliveryReceipt>;
}
```

### src/adapters/types.ts

[src/adapters/types.ts:3](../../src/adapters/types.ts#L3)

```typescript
export type ExecutionEnvironmentType = string;
export interface NormalizedSourceEvent {
  id: string;
  externalId: string;
  sequence: number;
  kind: SourceEventKind;
  content: string;
  timestamp: string;
  executorType: Executor["type"];
  environmentType: ExecutionEnvironmentType;
  metadata?: Record<string, unknown>;
}
export interface NormalizedThread {
  threadId: string;
  title: string;
  applicationTitle?: string | null;
  cwd: string;
  createdAt: string;
  updatedAt: string;
  events: NormalizedSourceEvent[];
  history?: { complete: true; observedExternalIds: string[] };
}
```

### src/ai-service/client.ts

[src/ai-service/client.ts:13](../../src/ai-service/client.ts#L13)

```typescript
export type RemoteJob = {
  progress?: import("../distillation/activity.js").ExtractionProgress;
  requestId: string;
  status: string;
  result?: ExtractionResult;
  error?: { code: string; message: string; retryable: boolean };
};
export interface AIClient {
  continuation?(request: ContinuationRequest, beforeSend: () => void): Promise<unknown>;
  capabilities(): Promise<unknown>;
  improvementIdentity?(): string;
  uploadSample?(input: SampleUpload, beforeSend?: () => void): Promise<unknown>;
  deleteSample?(id: string, beforeSend?: () => void): Promise<unknown>;
  submit(request: ExtractionRequest, key: string, beforeSend?: () => void): Promise<RemoteJob>;
  get(id: string, beforeSend?: () => void): Promise<RemoteJob>;
  cancel(id: string, beforeSend?: () => void): Promise<unknown>;
  ack(id: string, beforeSend?: () => void): Promise<unknown>;
}
```

### src/connectors/selected-content.ts

[src/connectors/selected-content.ts:4](../../src/connectors/selected-content.ts#L4)

```typescript
export interface SelectedMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}
export interface SelectedContent {
  schemaVersion: 1;
  adapterId: string;
  /** Explicit locator entered by the user; never infer a conversation from a title. */
  conversationId: string;
  title: string;
  url: string;
  messages: SelectedMessage[];
  scope: "SELECTED_CONTENT" | "HOOK_EVENTS";
  missingAttachments?: string[];
}
```

### src/problem-reports/store.ts

[src/problem-reports/store.ts:7](../../src/problem-reports/store.ts#L7)

```typescript
export type FeedbackDraft = { description: string; screenshots: ReportImage[]; diagnostics: DiagnosticSnapshot; consent: boolean; scope: string; occurredAt: string; updatedAt: number };
export type SendState = "WAITING" | "SENDING" | "RECEIVED" | "PAUSED" | "CANCELLED" | "EXPIRED" | "DELETED";
export type LocalReport = { id: string; scope: string; createdAt: number; status: SendState; attempts: number; nextAttempt: number; error: string; envelope: ReportEnvelope | null; receipt: ReportReceipt | null };
```

## 数据库建表语句来源

这是源码中的 CREATE TABLE 语句索引，含初建与迁移前结构，不代表当前物理表清单；ALTER/RENAME 和运行时增表见字段字典。

| 声明文件/位置 | SQL 中的表名 |
| --- | --- |
| [server/improvement.mjs:13](../../server/improvement.mjs#L13) | `settings` |
| [server/improvement.mjs:13](../../server/improvement.mjs#L13) | `samples` |
| [server/improvement.mjs:13](../../server/improvement.mjs#L13) | `events` |
| [server/improvement.mjs:13](../../server/improvement.mjs#L13) | `sample_usage` |
| [server/improvement.mjs:13](../../server/improvement.mjs#L13) | `tombstones` |
| [server/problem-reports.mjs:10](../../server/problem-reports.mjs#L10) | `problem_reports` |
| [server/service.mjs:79](../../server/service.mjs#L79) | `requests` |
| [src/connectors/delivery-ledger.ts:10](../../src/connectors/delivery-ledger.ts#L10) | `connector_deliveries` |
| [src/connectors/delivery-ledger.ts:11](../../src/connectors/delivery-ledger.ts#L11) | `connector_reopen_requests` |
| [src/core/package-receipts.ts:8](../../src/core/package-receipts.ts#L8) | `work_package_receipts` |
| [src/core/schema.ts:4](../../src/core/schema.ts#L4) | `work_definitions` |
| [src/core/schema.ts:4](../../src/core/schema.ts#L4) | `work_instances` |
| [src/core/schema.ts:4](../../src/core/schema.ts#L4) | `work_records` |
| [src/core/schema.ts:4](../../src/core/schema.ts#L4) | `execution_episodes` |
| [src/core/schema.ts:4](../../src/core/schema.ts#L4) | `capture_bindings` |
| [src/core/schema.ts:4](../../src/core/schema.ts#L4) | `source_events` |
| [src/core/schema.ts:4](../../src/core/schema.ts#L4) | `artifact_refs` |
| [src/core/schema.ts:4](../../src/core/schema.ts#L4) | `handoff_packages` |
| [src/definitions/migration.ts:21](../../src/definitions/migration.ts#L21) | `workflow_drafts` |
| [src/definitions/migration.ts:32](../../src/definitions/migration.ts#L32) | `workflow_definitions` |
| [src/definitions/migration.ts:32](../../src/definitions/migration.ts#L32) | `workflow_contract_refs` |
| [src/definitions/migration.ts:32](../../src/definitions/migration.ts#L32) | `workflow_runs` |
| [src/definitions/migration.ts:32](../../src/definitions/migration.ts#L32) | `workflow_node_works` |
| [src/definitions/migration.ts:44](../../src/definitions/migration.ts#L44) | `definition_categories` |
| [src/definitions/migration.ts:73](../../src/definitions/migration.ts#L73) | `source_snapshots` |
| [src/definitions/migration.ts:73](../../src/definitions/migration.ts#L73) | `distillation_jobs` |
| [src/definitions/migration.ts:73](../../src/definitions/migration.ts#L73) | `definition_drafts` |
| [src/definitions/migration.ts:73](../../src/definitions/migration.ts#L73) | `definition_materials` |
| [src/definitions/migration.ts:73](../../src/definitions/migration.ts#L73) | `definition_material_refs` |
| [src/definitions/migration.ts:73](../../src/definitions/migration.ts#L73) | `pending_dispatches` |
| [src/definitions/migration.ts:73](../../src/definitions/migration.ts#L73) | `instance_inputs` |
| [src/definitions/migration.ts:73](../../src/definitions/migration.ts#L73) | `review_events` |
| [src/definitions/migration.ts:73](../../src/definitions/migration.ts#L73) | `command_results` |
| [src/distillation/continuous-evolution.ts:30](../../src/distillation/continuous-evolution.ts#L30) | `continuous_evolution` |
| [src/handoff/work-preparation.ts:22](../../src/handoff/work-preparation.ts#L22) | `work_preparation` |
| [src/handoff/work-preparation.ts:22](../../src/handoff/work-preparation.ts#L22) | `work_preparation_notice` |
| [src/improvement/collector.ts:23](../../src/improvement/collector.ts#L23) | `improvement_subscriptions` |
| [src/improvement/collector.ts:23](../../src/improvement/collector.ts#L23) | `improvement_outbox` |
| [src/improvement/collector.ts:23](../../src/improvement/collector.ts#L23) | `improvement_preferences` |
| [src/improvement/recording.ts:10](../../src/improvement/recording.ts#L10) | `recording_samples` |
| [src/improvement/recording.ts:10](../../src/improvement/recording.ts#L10) | `recording_views` |
| [src/improvement/recording.ts:10](../../src/improvement/recording.ts#L10) | `recording_checkpoints` |
| [src/improvement/recording.ts:10](../../src/improvement/recording.ts#L10) | `recording_notice` |
