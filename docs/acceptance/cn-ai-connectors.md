# 国内连接器验收（2026-10-13）

范围：独立 `codex/cn-ai-connectors`，基线 `main@4103f2d`。日常 `/Applications/Worket.app` 未覆盖，原 `/Users/dandi/YanGuan` 未切换或修改；未推送、发布或部署。临时测试目录使用新数据库、新 Electron 用户目录、mock keychain、SKIP_INTEGRATIONS 和 CONNECTOR_ISOLATION。没有读取私人会话、浏览器数据库、Cookies 或账户密钥。

## 验证层级

| 检查 | 结果 | 证据与限度 |
| --- | --- | --- |
| 已有全套回归（第一次） | PASS，306 项 | `node --experimental-strip-types --test test/**/*.test.ts`；沙箱 loopback EPERM 后在获批本机执行，全部通过 |
| 选定采集→提取接口 | PASS | flow.test 与真实 Electron 默认 LocalRuleExtractor；夹具为无敏感内容的合成要求 |
| 重复、同消息修订、目标切换、取消、启动失败 | PASS | flow.test 的真实 AppService/SQLite；外部 transport 为隔离 stub，不证明站点发送 |
| 选区缺失/附件缺失 | PASS | 不声明完整历史、不标消息删除；附件仅引用且提示缺失；不读取附件正文 |
| QwenWork 有限 Hook | PASS（接口合成） | 已发起交付双标记绑定、重复幂等、未授权/已停止目标不采；不覆盖第三方 app 运行 |
| WorkBuddy/Qwen Hook 超时 | PASS（真实代理子进程） | 临时 HTTP bridge 挂起，代理在短超时后退出成功；不拦截模型控制流 |
| Native Messaging framing | PASS（协议与真实本机子进程） | 拆分帧、精确 origin、超限/不完整帧；准备 bundle 未注册，真实 host→Electron bridge 进入待确认箱 |
| Worket 本地预览确认→SQLite→提取→剪贴板 | PASS（真实本机 UI） | `scripts/qa-cn-connectors.mjs`，实际 IPC/SQLite/default extractor/clipboard，非模型/第三方执行证据 |
| 待确认箱不自动入档、浏览器 Origin 拒绝、重启恢复 | PASS（真实本机） | qa-cn-connectors 报告；重启清箱而保留工作，未调用外部模型 |
| 临时 Chromium 扩展/Native Messaging | PASS（合成选区与确认闭环） | 真实 Chrome 扩展菜单操作→popup 采集→Native Host→真实 Electron 待确认/预览/导入/提取；移除注册后拒绝。没有日常浏览器注册，不代表线上 AI 往返 |
| 提取语义质量 | 未新增验收 | 旧关键词提取器保留；不同消息的冲突要求未必自动替代。工作包保留原文/未解决状态，由后续策略更新处理 |

审阅修复后的最终 `npm test`（含重新构建）**311/311 通过**，`npm run typecheck` 与 `git diff --check` 通过。增加了提取失败重试、停止后迟到结果保护、主动回填较早消息和交付回声去重检查。

## 逐产品本机结果

公开安装元数据与 WorkBuddy status-only 握手来自 `scripts/check-cn-apps.mjs`，没有列出或读取会话。JSON 的 `installedApps` 是 2026-10-13 02:00 UTC+8 的历史快照；之后 QwenWork 安装状态以 `approvedSetup` 为准，未把旧快照当当前状态。

| 产品 | 代码交付 | 本机实际结果 | 完整第三方闭环 |
| --- | --- | --- | --- |
| WorkBuddy 5.7.7 | 保留 HISTORY/deep link/MCP/Hook；短超时降级 | 已安装且进程运行；现有扩展 socket 无监听，返回 ECONNREFUSED | 未运行发送/来源/回复验收；需正常重启使已有扩展重新激活（已请求允许）；隔离 Hook 配置需批准 |
| ZCode 3.14.4 | 保留 HISTORY/剪贴板/MCP/Hook | 公开安装版本核实 | 未读取真实会话；隔离合成 task 的原生往返待设置 |
| QwenWork 桌面 | 有限用户 Hook、显式配置函数、内联包和手动选定回复 | 已按批准安装并验签 1.0.4 | 首次启动/登录及实际配置未验收（先前锁屏阻塞，本轮未操作该原生 UI）；不承诺完整历史或自动助手全文 |
| Kimi Work 网页 | 官方入口、完整内联包、主动导入 | Worket 内部 Kimi 格式合成任务闭环通过 | 真实账号发送/返回导入未验收；不使用 Kimi Code API |
| 豆包工作网页 | 官方 work 入口、完整内联包、主动导入 | 同一工作切换到豆包的接口合成验收通过 | 未宣称内测 API 已开放；真实账号闭环待验 |
| 扣子网页 | 官方入口、完整内联包、主动导入 | 取消、失败恢复与再次交付的接口合成通过 | 无远程 MCP 实现，不暴露 localhost；真实账号闭环待验 |
| QwenWork 网页/通用 HTTPS | 内联包与选区/文件导入基础 | 归一化/站点限制/去凭据 URL 测试通过 | 国内版本入口与实际模式、真实会话待核实 |
| Antigravity 2.16.0 / Codex 26.1007.30912 | 原能力兼容声明 | 公开安装版本核实；原 transport 回归通过 | 本轮未访问真实会话 |
| 第二批候选 | 未注册适配器 | 未安装或调查执行配置 | MiniMax Code/Agent、LobsterAI、AutoClaw、AutoGLM 保持待评估 |

## 可复现本机证据

忽略目录 `output/playwright/cn-connectors/`：`report.json`、`installed-apps.json`、`browser-selection-report.json`，以及 `01-import-preview.png`、`02-record-state.png`、`03-native-inbox-confirmation.png`。这些文件只有合成内容及公开版本；完整执行命令与身份隔离说明见 [开发说明](../development/cn-ai-connectors.md)。

浏览器报告不能替代网页真实闭环，安装元数据不能替代 conversation 能力。本轮不声称全部国内应用已接通。

## 最小后续操作

两项业务批准已于 2026-10-13 收到，临时浏览器 Native Messaging 已验收并清理，QwenWork 已安装验签。本轮独立收尾已在可操作桌面完成浏览器扩展合成闭环；不再把锁屏视为所有任务的共同阻碍。当前最小下一步是在一个真实站点（优先 Kimi）由用户完成必要登录/协议，再验证真实发送→双标记绑定→助手返回主动导入。WorkBuddy 需先观察是否有运行任务或未保存输入，再决定可否正常重启；本轮未强退或改写其现有配置。

## WorkBuddy 不扩大访问的诊断

主进程 PID 47891 启动于本机 2026-10-10 13:27:08；Worket 扩展文件更新于 18:42:50，晚于该次启动。socket 文件时间 13:27:25，当前指定 socket 没有监听进程。已安装 extension/distribution 清单为 active，与仓库一致；server/index 和 visible 的差异主要是 main 新增 Windows 命名管道/路径处理，Mac 分支仍等价。公开 WorkBuddy 5.7.7 bundle 源码显示 onStartup 激活路径，没有据此调用私有重载 IPC。

这些证据支持先重启/重新激活已有扩展再查 status，不证明某个具体崩溃原因；未读取诊断日志正文、settings 密钥或历史，也未停止潜在现有任务。已单独请求正常重启批准。这是可继续诊断的本机运行状态，不能写成 WorkBuddy 产品不支持。

## 审阅修复

code-review 的两轴审阅以 main@4103f2d 为固定点、实施 spec 为需求源。Standards 初审指出 Qwen Hook 协议泄漏到 AppService、标记解析重复及扩展目录重复；均已修复为 adapter.normalizeHook、共享 deliveryMarkers/pending 判定和构建时生成扩展目录。Spec 初审指出旧异步预览可能恢复用户编辑前的授权；已用 editRevision 防止旧返回恢复确认，真实 renderer 延迟夹具通过。两轴复查未发现剩余该类问题。

补充本机检查报告 `stalePreviewCannotRestoreRedactedAuthorization: true`；此项为真实 renderer + 延迟接口夹具，不能冒充第三方服务。

最终复测保留旧版同一行双标记兼容；Hook 显式使用 2500ms 超时，MCP 默认 60000ms，慢上下文代理测试通过，避免记录层超时策略阻断正常 MCP 准备。

## 真实站点尝试（2026-10-13，浏览器现有 Chrome 会话）

这部分使用实际生产站点，不是 fixture。只新建测试标签页，不查询浏览历史、Cookies、会话数据库或私人聊天；未接受新协议、填写账号凭据、付费或增加权限。

- Kimi：实际提交无敏感提示 `20261013-KIMI-A`（只要求 KIMI_INITIAL_OK，不调用工具）后弹出登录页面，协议未勾选。页面未生成目标回复；登录阻塞，不记为发送成功或 Work 闭环。
- 豆包：实际 `/work` 是客户端下载介绍；从普通站点进入 `/chat/`，明确点击“工作”，界面出现“新工作任务/云电脑”及工作编辑器。只输入合成提示 `20261013-DOUBAO-A` 后触发“使用豆包或飞书账号登录”与协议选项，没有目标回复。连接器打开入口已修正为实际 `/chat/`，交付提示要求用户切换“工作”模式；不把介绍页当可发送会话。
- 扣子：实际首页跳至 `/overview`；点击“使用网页版”出现个人版手机号登录与协议复选框，尚未登录，未发送任务。
- ZCode：尝试通过现有电脑控制打开已安装应用，工具明确返回 Mac 锁定，要求人工解锁。没有取得原生界面或发送合成任务；不通过替代控制方式绕过锁屏。

无二维码/凭据的证据截图在 `output/playwright/cn-connectors/online/`：`kimi-login-required.jpg`、`doubao-login-required.jpg`、`coze-login-required.jpg`。为安全排除登录二维码，前两张只保留手机登录/协议区域。已保留待登录标签页并向用户报告具体阻碍；等待人工登录/协议处理及解锁后继续真实发送→导入→完整包交付→回复回流。以上均未达到线上往返通过。

## 两项批准后的执行（2026-10-13）

用户对临时测试浏览器配对及官方 QwenWork 安装/合成范围 Hook/MCP 回复“都同意”，业务批准已到位；没有自动批准审查拒绝。机器锁屏及站点登录是独立实际阻碍，不是上述两项业务批准未到位。

1. 真正 Chrome for Testing 148 以独立临时 user-data-dir 加载扩展并精确-origin 注册 Native Messaging。实际 `chrome.runtime.sendNativeMessage` 启动本机 Host，提交合成 payload 到 private-token bridge，stage 不入档；应用接口确认后进入默认提取器。删除 manifest 后再请求得到 host-not-found，关闭浏览器并删除整个临时目录。报告 `online/native-browser-report.json` 为 PASS_BROWSER_NATIVE_TRANSPORT；activeTab 选区操作未混入该传输结论。
2. 通过官网实际 Apple silicon 下载链接取得 QwenWork 1.0.4；DMG SHA256 `bc4b95d136627117534693303bfe27d4c735d9db2e04f7ae22bd74f64608a51a`。DMG 无附带 SLA，codesign deep/strict 通过，Developer ID 为 Taobao (China) Software CO.,LTD，TeamIdentifier XN6U3EV979，Gatekeeper accepted / Notarized Developer ID。新安装至 `/Applications/QwenWork.app`，安装后再验签通过，挂载盘已卸载；未覆盖 Worket 或其他应用，未去除 quarantine 或改安全设置。官方来源：https://qwenwork.ai/ → https://assets.qwenwork.ai/release/latest/qwenwork-darwin-arm64.dmg 。
3. 合成范围 Hook 参数和发送前 session/delivery 白名单已实现并通过真实代理子进程测试；未知会话不会传往桥接。QwenWork 真实 GUI 未启动，用户级 `.qwenwork` 尚未创建，Hook/MCP 配置没有据此宣称完成。解锁后继续首次启动/登录、实际配置和合成会话回执。

安装与临时浏览器传输都已实际执行；第一批消费端任务发送、回复及同一工作回流仍等待解锁和人工登录，不宣布整体目标完成。

QwenWork 的选定回复入口已补齐：允许用户主动选取桌面可见正文并导入到已绑定的同一测试 session，标记为 SELECTED_CONTENT / DESKTOP_VISIBLE；与自动 UserPromptSubmit 的 HOOK_EVENTS / HOOK 分开。浏览器待确认箱拒绝冒充桌面来源。接口夹具通过，但未将其写成真实 QwenWork 模型回复。

## 独立收尾实证（2026-10-13）

工作树 HEAD `f5d8a85` 的现有未提交改动在两次内容哈希检查间保持稳定。所有构建与新增验收先在独立副本执行，没有覆盖日常 Worket 或原仓库源码。类型检查通过；完整 `npm test` 为 **313/313 PASS**，旧 311 项报告保留为历史结果。首次沙箱运行因本机 loopback `EPERM` 失败，获自动审批的隔离本机复测通过。

`qa-browser-roundtrip.mjs` 通过 **PASS_SYNTHETIC_BROWSER_ELECTRON_ROUNDTRIP**：

- 真正 Chrome for Testing 148 中的合成 HTTPS 页面，以 Playwright 建立明确的文字选区，再由 Computer Use 点击实际扩展菜单项。没有调用 `openPopup()` 充当 activeTab 授权，也未增加 host_permissions。
- popup 的真实“读取当前选区”与“发送到 Worket 待确认箱”按钮，经真实浏览器 Native Messaging 启动 Host 子进程，进入独立 Electron 实例；只包含所选正文，未选文本未采集，URL 去掉 query。
- 待确认不入档；真实 Worket 预览、取消仍不入档且保留暂存；再次预览确认后才入 SQLite 并经默认提取器得到英文要求。
- 重复导入不增加记录；编辑正文会撤销旧确认，重新预览后增加“结论需注明来源”的要求并保持同一工作 ID。
- Worket 重启后已确认工作及要求保留、待确认箱为空。删除临时 native manifest 后请求明确失败；浏览器、Electron 与整个临时配置目录均清理。

产物在忽略目录 `output/playwright/cn-connectors/roundtrip/`：`report.json`、`01-extension-selected.png`、`02-worket-preview.png`、`03-worket-recorded.png`。测试 URL 虽使用 Kimi 域名，但由 route.fulfill 返回合成页面，**没有访问 Kimi 服务、账号或模型**。这证明浏览器插件与 Worket 的本机闭环，不证明任何产品的真实模型往返、Qwen Hook 激活或 ZCode 接通。

补充直接 Native 子进程→loopback→暂存→确认导入→默认提取独立复测也通过。原 02:05 的 `browser-selection-report.json: NOT_VERIFIED` 是历史失败，已由此完整实际 action 测试补齐；程序打开 popup 不授予 activeTab 的负向观察仍成立。

## 普通网页会话扩展（2026-10-14）

Kimi/豆包普通网页入口、DeepSeek 和 Gemini 已加入共享目录；原 Kimi/豆包持久 ID 保留。完整测试 325/325 通过，新增四站点同一工作交接、暂存不绑定、去重、查询参数脱敏与错站拒绝回归。日常 Chrome 实测 Gemini 普通新会话返回 WORKET_GEMINI_OK；Kimi/豆包/DeepSeek 当前需要用户登录，尚未完成插件到 Worket 的真实四站闭环。浏览器工具禁止访问 chrome://extensions，扩展加载交由用户在管理页操作；已准备稳定目录，待取得实际扩展 ID 后精确配对。桌面安装结果将在交付时补充。

日常功能整合：已合并 codex/problem-reporting，保留紧凑审阅、全局进度、反馈顶栏及 Windows 修复；完整测试 332/332、提取评测工具测试 34/34、server TypeScript 构建通过。GitHub 下载 Electron 失败后使用本机缓存的同版本 44.1.1 ZIP 打包，scripts/package-desktop.mjs 支持显式 --electron-zip-dir；打包排除无关 reports 目录。

本机交付：正常退出旧应用后备份到 output/app-backups/web-connectors-20261014（含 SQLite 一致性备份），安装 /Applications/Worket.app 并重启，签名 deep/strict 通过。安装与构建 ASAR SHA256 均为 5ff1abf8bb67697254bce6eb78edd038ec6cf910f22e5d3b94a197a811c633b5。实际进程 PID 7477 来自 /Applications/Worket.app/Contents/MacOS/Worket；原数据库 quick_check=ok，原 28 张表均无计数减少。实际导入下拉框已显示 Kimi、豆包、DeepSeek、Gemini。尚未发布 GitHub Release 或部署后台。

用户完成登录后，日常 Chrome 的 Kimi 普通聊天、DeepSeek 和 Gemini 分别真实返回 WORKET_KIMI_OK / WORKET_DEEPSEEK_OK / WORKET_GEMINI_OK。豆包当前落在企业工作空间，普通聊天模式待切换；扩展 ID 及真实选区到 Worket 的完整闭环仍待完成。

### 日常 Chrome 扩展真实验收（2026-10-14）

用户在日常 Chrome 手动加载扩展 0.1.1，提供实际 ID `jijleglgedabifdnfefjnolonbdmfhpc`。本机 Host 注册到 `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/site.dandi.worket.selected.json`，仅允许该扩展 origin；稳定运行目录 `~/Library/Application Support/Worket/browser-native`，连接日常 `.workpet/bridge.json`，未输出或复制访问令牌。

真实浏览器逐站选中模型回复，通过原生工具栏打开扩展、读取选区、核对站点与助手角色、填写对应实际会话 URL、发送后均显示已送入待确认箱。随后在 `/Applications/Worket.app` 的实际界面逐条预览并确认，均显示已导入 1 条选定内容：

- Gemini 普通聊天：WORKET_GEMINI_OK。
- Kimi 普通聊天：WORKET_KIMI_OK；未导入邻近的思考说明。
- DeepSeek 普通聊天：WORKET_DEEPSEEK_OK。

以上为真实日常 Chrome → 实际扩展 activeTab → Native Messaging → 正式本机 Worket 待确认箱 → 预览确认入档，不是 route.fulfill 或脚本直接注入。仅使用无私人数据的短测试消息，不代表完整历史同步、真实业务提取质量或四站交接的业务收益。豆包登录后仍是 MentiTrek 企业工作空间，普通聊天页待用户切换后补验。

SQLite 只读复核三条测试 agent.response 的正文、SELECTED_CONTENT 范围及来源 URL 与页面完全一致，quick_check=ok。测试工作 ID 分别为 Gemini `94697bd4-ad02-4ea3-8226-711628eaf370`、Kimi `7c1db13b-968c-441d-87c0-00e4f990da13`、DeepSeek `93133edd-fab6-402a-840a-9fcf14e23423`；三条均通过实际 Worket 界面归档，保留可恢复证据，不占用进行中列表。
