# 接入开发与工作提取入口

## 最小提取入口

本地工作状态提取的唯一构造入口是 `src/extractor/index.ts:createWorkStateExtractor()`，策略实现目前为 `LocalRuleExtractor`；开发或验收可通过 `new AppService({ extractor })` 注入实现。稳定接口位于 `src/extractor/types.ts`：接收 previousState 与可见事件，返回 WorkStatePatch。连接器不调用模型，不解析业务要求，不直接保存提取结果。

```
桌面历史 / 已授权有限 Hook / 主动选区
  → NormalizedThread / NormalizedSourceEvent
  → SourceArchive（稳定身份、修订、幂等）
  → workEvidence（当前版本，排除推理、MCP 审计、已核对的交付回声）
  → WorkStateExtractor.extract
  → WorkStatePatch + 序号进度
```

同步与主动导入共用应用服务；归档、停止绑定或切换目标后的迟到提取结果不能应用到新执行片段。选定导入串行处理，失败不会阻塞下一次请求。没有调用 `WorkPreparation.enable` 进行隐式云端授权。

更新本地策略只需修改上述 factory/implementation，并跑 `test/connectors/flow.test.ts` 和本机验收。若“提取流程”指云端阶段理解或可复用工作定义，它们已有独立算法入口：`handoff/continuation.ts`、`distillation/analysis-input.ts`、`server` 中相应提示和校验；本次未合并不同业务目标，也未改写云端算法。新连接器提供的 SourceArchive 可沿现有沉淀路径消费，无需逐产品修改。

`test/fixtures/connectors/selected-requirements.json` 是无敏感内容的稳定输入；增补策略时保持消息 ID、来源范围、附件缺口和时间字段。旧 LocalRuleExtractor 是关键词线索工具：不同消息的冲突要求未必自动退出，不能把适配器验收当成提取语义质量提升。

## 连接器契约

- `src/executors/types.ts`：能力与传输；无完整历史的 source 可缺省，历史列表不会伪造数据。
- `src/connectors/selected-content.ts`：只允许用户/助手正文；不读取本地路径或附件 URL。提供 message.id 时支持同 ID 修订。无 ID 使用角色/正文 hash 与同快照出现次数，重复相同的无 ID 文本可能合并，修改可能成为新消息。
- `src/connectors/catalog.ts`：产品身份与官方入口；构建通过 sync-browser-catalog 生成扩展 options/host 列表，避免两份目录漂移；消息 URL 去掉查询/hash/凭据。实际 conversationId 必须显式选择，不能依标题推断。网页、Code 和模型 API 分开。
- `src/connectors/inline-package.ts`：完整有效上下文，500000 字符上限拒绝超限；保持用户原始消息在 JSON 原文段，不隐式读取附件。既有复制/导出工作包保持兼容，新增完整网页包入口。
- `src/connectors/delivery-ledger.ts`：本地 `connector_deliveries` 表只记录交付正文摘要，按 workId/deliveryId/hash 验证原封不动的启动包。原档案保留，提取及再次交付不递归复制回声；改过正文则继续作为用户证据。旧代码回滚可忽略此独立表。
- `src/connectors/inbox.ts`：最多 10 项、10 分钟、重启清空；暂存不是采集或上传授权。
- `src/bridge/http-bridge.ts`：仅 loopback、private token、拒绝浏览器 Origin；Native host 只能提交选定内容，扩展不获得桥接凭据。

## 安全隔离运行

从该 worktree 执行 `npm run build`，然后使用一个新临时目录：

```sh
WORKPET_SKIP_INTEGRATIONS=1 WORKET_CONNECTOR_ISOLATION=1 \
WORKPET_DATA_DIR="$TASK_DATA_DIR" WORKPET_BRIDGE_CONFIG="$TASK_DATA_DIR/bridge.json" \
./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron . \
  --user-data-dir="$TASK_DATA_DIR" --use-mock-keychain --dev
```

`TASK_DATA_DIR` 必须先由 `mktemp -d` 生成。ISOLATION 模式不注册任何 HISTORY 适配器，避免验收启动时扫描私人会话；SKIP 阻止已有自动集成安装与服务启动注册。不要直接运行普通 `npm run dev` 验收：既有程序会自动安装历史执行者集成。不要覆盖 `/Applications/Worket.app`。

## 网页扩展配对（临时合成验收已完成，日常浏览器未配置）

1. 审阅 `integrations/browser-extension`。只声明 activeTab/scripting/nativeMessaging，没有 host_permissions、Cookies、history 或全部标签页采集。加载扩展本身属于持久访问设置，须获明确批准；先在单独测试浏览器配置使用。
2. 取得实际扩展 ID；执行 `node scripts/prepare-browser-native.mjs <实际扩展ID> <审阅输出目录> <隔离bridge.json绝对路径>`。这只生成 bundle，不注册。ID 限定 `[a-p]{32}`，manifest.allowed_origins 精确到该 ID。
3. 审阅输出中的 shell runner、pairing.json 与 native manifest 后，批准再把 manifest 注册到选定浏览器 NativeMessagingHosts。Chrome 146+ 支持在独立 `--user-data-dir` 的 NativeMessagingHosts 子目录注册；本轮真实 Chrome for Testing 148 协议验收已验证这一路径，优先避免日常浏览器目录。若测试分支未替换日常 Worket，必须给 runner 明确设置隔离实例的 WORKPET_BRIDGE_CONFIG；不要把它指向日常旧实例或直接改写 ~/.workpet/bridge.json。
4. 打开用户批准的会话，选中一条可见消息→点击扩展→核对角色/会话/脱敏正文→提交→Worket 最近活动的“导入选定网页内容”→待确认箱→预览→确认。
5. 多条消息逐条选择，或导入所选消息的稳定 JSON 格式。不自动翻页，不推断未加载历史完整性，不抓取附件正文。待确认内容可丢弃；停止记录/归档后不允许来自旧会话的增量写入。

未加载扩展/未注册 host 时 native 请求明确失败，不退回无授权 HTTP 或私有接口。真正发送或上传文件仍由用户在目标应用操作。豆包实际打开 `/chat/`；官方 `/work` 是下载介绍页。2026-10-14 起，网页手动导入支持 Kimi、豆包普通聊天及 Work 会话、DeepSeek、Gemini、扣子、QwenWork 和通用 HTTPS，不要求用户切到 Work 模式。Kimi/豆包持久 ID 保留，显示名称已扩展为普通网页。

## QwenWork 显式设置（应用已安装，实际 Hook/MCP 尚未激活）

`src/adapters/qwenwork/install.ts` 不参加自动安装。确认安装版与文档一致、应用路径和 settings 配置后才调用；它保留无关 Hook，仅增加 UserPromptSubmit 代理，需重启应用。未自动增加 MCP；按官方连接器页面显式添加 STDIO：command 为本机 Node，args 为当前独立 worktree 的 `integrations/workbuddy-marketplace/plugins/workpet/bridge/mcp-proxy.mjs`。开发测试同样设置隔离 WORKPET_BRIDGE_CONFIG。

当前桌面交付为完整内联包，即使没有 MCP 仍可开展工作。有限 Hook 仅提供绑定/已授权用户提交；适配器 normalizeHook 解释具体载荷，应用层仅按通用能力验证授权/绑定；官方历史或助手正文接口尚未核实，不读私有数据库补齐。配置开启后通过本次双标记的合成消息验收，不把 SessionStart 或 Stop 当作完整回复。

## 检查命令

- `npm run typecheck` / `npm test`：现有和新增回归。
- `node scripts/qa-cn-connectors.mjs`：真实 Electron、IPC、SQLite、默认提取、剪贴板、native 子进程、本地桥接、确认箱和重启；合成数据，无第三方发送。
- `node scripts/qa-browser-selection.mjs`：隔离 Chromium 扩展选区验收。可通过 WORKET_QA_CHROMIUM 指定已有 Chromium；不下载，不访问真实站点（页面由 route.fulfill 提供），不注册 native host。
- `node scripts/check-cn-apps.mjs`：公开安装版本与已有 WorkBuddy status-only 握手，绝不列出或读取历史。

验收报告、截图默认在忽略的 `output/playwright/cn-connectors`；可提交的无敏感结果摘要见 `docs/acceptance/cn-ai-connectors.md`。新增产品需先确认官方契约，再添加适配器和夹具，不把候选清单当已连接清单。

2026-10-13 批准后的进展：临时独立浏览器 Native Messaging 已在实际 Chrome for Testing 中通过发送→待确认箱→应用接口提取；移除 manifest 后请求明确失败，整个临时目录删除。报告是实际 browser/native 传输 + 合成 payload，不是线上第三方回复。`node scripts/qa-native-browser.mjs` 可重跑；activeTab 实际扩展菜单操作与确认链路已由下述独立收尾验收补齐。官方依据：[Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)。

QwenWork 测试安装函数可传 `{bridgeConfig,captureScope}`，以脚本参数固定隔离桥接与测试范围，不依赖应用注入环境变量。范围文件只包含已批准测试的 `{sessions:[],deliveries:[{workId,deliveryId}]}`；代理先识别允许的交付并登记该测试 session，其他 session 在传输前忽略。此范围测试已通过，不代表 QwenWork 应用已产生实际事件。获批安装的 1.0.4 已核验签名；原生界面因锁屏未启动，未写入全局 `.qwenwork` Hook 配置或导入 MCP。目前应用首次登录、协议和真实配置激活仍是下一步，避免把离线代理测试冒充应用闭环。

QwenWork 手动回复回流：在“导入选定内容”选择 QwenWork 桌面，当前工作有已绑定 session 时自动填入；用户只粘贴该测试任务的可见助手正文、选择助手角色并预览确认。此路径明确标记 DESKTOP_VISIBLE，不冒充 Hook 或完整 transcript。nativeMessaging 待确认箱不能提交该桌面来源。

## 浏览器扩展完整本机闭环验收

构建后执行 `node scripts/qa-browser-roundtrip.mjs`。可设置 `WORKET_QA_CHROMIUM` 指向已有 Chrome for Testing；不下载浏览器。脚本使用临时 browser user-data-dir、临时 NativeMessagingHosts、独立 Worket 数据库/user-data-dir/mock keychain，开启 SKIP_INTEGRATIONS 与 CONNECTOR_ISOLATION；不加载日常浏览器配置或私人会话。临时加载/配对属于已获批准的测试范围，其他环境须先明确范围。

出现 `WAITING_REAL_EXTENSION_ACTION` 后，只在标题为 `WORKET SYNTHETIC SELECTION TEST` 的测试窗口点击扩展菜单中的“Worket 选定网页内容”。脚本已建立合成文字选区；实际菜单操作才取得 Chrome activeTab。不要改为调用 `chrome.action.openPopup()`、添加 host_permissions 或给站点永久授权：独立实测 openPopup 本身不能授予 activeTab。脚本以单独 CDP 连接识别真实 popup，随后用真实 popup 与 Electron 控件完成采集、暂存、预览、取消、确认、编辑、重启和清理验收。最多等待实际菜单操作 15 分钟，超时明确失败并执行清理。

报告和合成截图位于 `output/playwright/cn-connectors/roundtrip/`。`PASS_SYNTHETIC_BROWSER_ELECTRON_ROUNDTRIP` 不包含线上模型；真实站点下一步只需选一个用户已登录的产品，发送合成任务，再导入其真实回复及带双标记的重新交付。Kimi 登录入口：https://www.kimi.com/ 。新增协议由用户确认；ZCode 和 Qwen 原生 UI 属于独立验收，不是本项依赖。

## 日常 Chrome 加载目录（2026-10-14）

本机扩展复制到 `~/Library/Application Support/Worket/browser-extension`。在 Chrome 扩展管理页开启开发者模式，点击“加载未打包的扩展程序”；macOS 选择器中用 Command+Shift+G 输入完整目录，无需显示隐藏的 Library。加载后取得卡片实际 ID，再由 prepare-browser-native.mjs 生成 exact-origin 本机配对；扩展加载与本机 Host 注册是两个独立步骤。工具禁止访问 chrome:// 管理页时，加载步骤由用户完成，不改写浏览器配置绕过该限制。
