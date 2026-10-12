# 国内连接器验收（2026-10-12）

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
| 临时 Chromium 扩展加载 | 已运行，选区操作未验证 | action popup 未作为 Playwright page 暴露，没有绕过权限；Native Host 未在日常或测试浏览器注册 |
| 提取语义质量 | 未新增验收 | 旧关键词提取器保留；不同消息的冲突要求未必自动替代。工作包保留原文/未解决状态，由后续策略更新处理 |

审阅修复后的最终 `npm test`（含重新构建）**311/311 通过**，`npm run typecheck` 与 `git diff --check` 通过。增加了提取失败重试、停止后迟到结果保护、主动回填较早消息和交付回声去重检查。

## 逐产品本机结果

公开安装元数据与 WorkBuddy status-only 握手来自 `scripts/check-cn-apps.mjs`，没有列出或读取会话。

| 产品 | 代码交付 | 本机实际结果 | 完整第三方闭环 |
| --- | --- | --- | --- |
| WorkBuddy 5.7.7 | 保留 HISTORY/deep link/MCP/Hook；短超时降级 | 已安装且进程运行；现有扩展 socket 无监听，返回 ECONNREFUSED | 未运行发送/来源/回复验收；需正常重启使已有扩展重新激活（已请求允许）；隔离 Hook 配置需批准 |
| ZCode 3.14.4 | 保留 HISTORY/剪贴板/MCP/Hook | 公开安装版本核实 | 未读取真实会话；隔离合成 task 的原生往返待设置 |
| QwenWork 桌面 | 有限用户 Hook、显式配置函数、内联包 | 未在 system/user Applications 发现已检查名称的安装包 | 待安装、版本/包名核对、Hook/MCP 显式配置批准；不承诺完整历史/助手全文 |
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

已单独请求浏览器测试配对及 QwenWork 安装/Hook/MCP 设置批准；没有收到批准前不执行。先在独立浏览器配置注册审阅后的精确-origin Host 并确认选区流程，再使用一个无敏感的真实目标会话验证发送→双标记绑定→助手返回主动导入。WorkBuddy 先仅启动已有应用、确认扩展 status，若需改写 Hook/MCP 则提供审阅后的精确配置并请求批准。

## WorkBuddy 不扩大访问的诊断

主进程 PID 47891 启动于本机 2026-10-10 13:27:08；Worket 扩展文件更新于 18:42:50，晚于该次启动。socket 文件时间 13:27:25，当前指定 socket 没有监听进程。已安装 extension/distribution 清单为 active，与仓库一致；server/index 和 visible 的差异主要是 main 新增 Windows 命名管道/路径处理，Mac 分支仍等价。公开 WorkBuddy 5.7.7 bundle 源码显示 onStartup 激活路径，没有据此调用私有重载 IPC。

这些证据支持先重启/重新激活已有扩展再查 status，不证明某个具体崩溃原因；未读取诊断日志正文、settings 密钥或历史，也未停止潜在现有任务。已单独请求正常重启批准。这是可继续诊断的本机运行状态，不能写成 WorkBuddy 产品不支持。

## 审阅修复

code-review 的两轴审阅以 main@4103f2d 为固定点、实施 spec 为需求源。Standards 初审指出 Qwen Hook 协议泄漏到 AppService、标记解析重复及扩展目录重复；均已修复为 adapter.normalizeHook、共享 deliveryMarkers/pending 判定和构建时生成扩展目录。Spec 初审指出旧异步预览可能恢复用户编辑前的授权；已用 editRevision 防止旧返回恢复确认，真实 renderer 延迟夹具通过。两轴复查未发现剩余该类问题。

补充本机检查报告 `stalePreviewCannotRestoreRedactedAuthorization: true`；此项为真实 renderer + 延迟接口夹具，不能冒充第三方服务。

最终复测保留旧版同一行双标记兼容；Hook 显式使用 2500ms 超时，MCP 默认 60000ms，慢上下文代理测试通过，避免记录层超时策略阻断正常 MCP 准备。
