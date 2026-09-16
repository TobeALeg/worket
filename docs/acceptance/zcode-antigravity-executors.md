# ZCode / Antigravity 接入验收

日期：2026-09-16。范围：macOS arm64；ZCode 3.11.2、Antigravity 2.14.0。

## 已实现与验证

- 默认注册四个执行者，共用现有历史、记录、同步、交接和定义复用路径。两个新执行者的当前聊天需要明确选择，不以最近更新时间猜测。
- ZCode 只读本地 ZCode Agent（provider=glm）任务索引与 CLI 消息库。实测列出 14 个会话，抽取其中一条得到 367 个唯一可见事件，没有 reasoning 事件。未完成回复等其结束后再入档，避免 append-only 档案锁定半句回复。
- Antigravity 实测列出并读取 8 个顶层桌面会话，各会话事件 ID 唯一；读取结果分别为 40、169、122、110、508、694、600、2 条。只读取明确的 content/tool_calls 字段，不复制 thinking、系统消息或底层模型元数据。源文件截断的正文或工具参数有显式提示；不能称为完整无损工具历史。
- 自动化测试 125 项通过，包含两个存储适配器、静止历史、分页、隐藏内容过滤、流式事件、源截断、路径验证、配置保留/空配置/重复安装，以及真实执行 Hook 代理进程的最小通知契约。
- 通用交接测试覆盖多个执行者、同名会话 ID、保持工作身份、重复回执、取消后的迟到回执、只带会话 ID 的通知，以及没有待确认交付时不读取陌生会话。
- 另用纯内存 Worket 数据库从两款应用各导入 2 条真实会话，得到 368、867、41、170 条工作档案事件（含 Worket 本地事件）；再次统一同步无重复，完成四项工作后均停止采集。测试内容未保存到项目、用户正式工作库或云端。
- 已生成 macOS 应用包。`node scripts/qa-new-executors.mjs` 使用独立 Worket 数据目录，真实历史选择器显示 ZCode 14 条、Antigravity 8 条；交接选项可用，截图已检查，无横向溢出。脚本不发送提示词、不调用模型、不上传材料。
- `npm run qa:package` 通过，验证正式应用身份、桌宠和面板。截图与报告位于 `output/playwright/`，未提交真实历史截图或聊天内容。
- 本机两款应用的 MCP/Hook 配置已合并安装，重复安装返回 already-installed。原配置备份在 `~/.workpet/integration-backups/2026-09-16T13-42-11.287Z/`，不提交至仓库。

## 用户操作

记录：历史聊天中选择 ZCode 或 Antigravity，选择目标会话。已有静止历史不需补发消息；后续消息完成后由轮询同步。

交接/复用：选择目标执行者后，Worket 打开应用并复制启动指令。在目标应用新建聊天，粘贴并发送。ZCode 的 UserPromptSubmit Hook 或 Antigravity 的会话通知确认真实目标后，Worket 开始在对应执行片段持续记录。打开应用、复制指令或模型读取 MCP 本身不冒充真实会话绑定。

ZCode 的 Hook 配置在新会话启动时生效；旧聊天未必加载新配置。首次安装后在两个应用中新建聊天使用；如应用未重载 MCP/Hook，重启目标应用后再新建。显式禁用的 Hook 不被强制重新启用。

## 仍未验证或不支持

- 尚未通过两款真实模型执行完整 Codex → ZCode → Antigravity → Codex 接力，不能把合成回执测试说成真实模型接手成功。当前工具环境缺少可用的本机 UI 控制运行时；没有用猜测的内部接口发送模型任务。
- 交付需要用户新建聊天、粘贴并发送；当前不承诺自动预填或自动执行。ZCode 的已安装深链处理只发现工作区打开及认证/支付回调。
- ZCode 当前仅支持本机原生 Agent 数据；不覆盖远端工作区或其他 provider 的历史格式。两者内部索引布局均属于已验证版本兼容范围。
- Antigravity 无 transcript 时明确报错，不把 summary 导入成完整会话。截断内容不会从私有二进制轨迹或隐藏思维中猜测补全。
- 普通轮询可恢复已有记录；Worket 离线期间若错过首次交付的所有 Hook，待确认状态不会仅凭最新聊天自动解除。目标有后续通知时重试确认。
- 本次为本地源码与打包验收，未推送、创建发布或上传安装包。

## 协议依据

官方资料核实于 2026-09-16：[ZCode MCP](https://zcode.z.ai/en/docs/mcp-services)、[ZCode Hooks](https://zcode.z.ai/en/docs/hooks)、[Antigravity MCP](https://antigravity.google/docs/mcp)、[Antigravity Hooks](https://antigravity.google/docs/hooks)。它们支持配置与通知协议；SQLite 字段和 transcript 实际事件结构另由本机只读检查验证，不视作长期兼容承诺。
