# 国内工作 AI 连接器：实施范围与验收契约

批准依据：2026-10-12 用户确认国内工作 AI 方案，要求在 Mac 的独立分支实现并自行验证连通性，完成后继续更新工作提取流程。不得发布、推送、部署、覆盖日常应用；新增持久访问、OAuth/API 凭据和未预期权限须另行确认。

基线为远程 main `4103f2dade91d64c12401d44610370f152169dde`。原 `/Users/dandi/YanGuan` 的 `codex/problem-reporting@67f8073` 未改动，不合入该分支的 51 条独有提交。只读检查 `.agents`、现有技能和相关本地记忆后，沿用工作身份与会话分离、主动记录、来源可核验和真实回执原则。

## 第一批

- WorkBuddy、ZCode：沿用已有本地适配，增加能力声明、交付状态，修复本地桥接 Hook 超时；不按 CodeBuddy 载荷替代 WorkBuddy 契约。
- QwenWork 桌面：有限 UserPromptSubmit Hook 专属映射，只有已绑定或用户发起交接的会话可入档。文档没有核实完整 transcript，因此不声称完整历史或助手全文回流。默认完整内联工作包；stdio MCP 配置作为显式设置步骤，不自动安装。
- Kimi Work、豆包工作、扣子及 QwenWork 网页：打开官方入口、复制/导出完整工作包、用户主动选定内容导入、重复与修订归一化。与 Kimi Code、Qwen 模型 API、Coze 开发者平台会话明确分开。
- 网页通用基础：activeTab 点击后读取当前已加载的选区，用户核对角色与正文；Native Messaging 精确扩展配对，提交至 Worket 待确认箱，Worket 预览确认后保存。不得广泛抓取、读取 Cookies/私有数据库/接口或绕过限制。

第二批 MiniMax Code/Agent、LobsterAI、AutoClaw、AutoGLM 保持候选状态，没有注册为已支持执行者。

## 必要行为

1. 连接器声明 HISTORY、HOOK_EVENTS、SELECTED_CONTENT，交付声明 MCP_REFERENCE 或 INLINE_PACKAGE；打开/复制不能证明发送、绑定、读包或附件权限。
2. 保持同一 WorkInstance；绑定需要实际目标用户消息及当前 WORKPET/DELIVERY 标记。发送后的手动导入是用户提供的来源观察，不能冒充官方发送回执或 MCP 读取。
3. 采集只归一化事件，提取调用稳定 WorkStateExtractor 接口。相同来源/消息 ID 幂等，已提供稳定 ID 的修改成为新观察；选区缺失不冒充消息删除。
4. 内联包包含有效来源和接续快照，文件只列引用。超限报错，不静默截断；已验证正文 hash 的原交付包保留原始档案，不递归成为新要求。
5. 覆盖正常采集→提取、修改要求后再交接、切换工具、重复、部分历史/附件缺失、取消、启动失败、Hook 超时、重启恢复。区分接口合成测试、本机真实进程/SQLite/UI、真实第三方会话。
6. 不要求用户为无法验证的能力降低安全设置。未安装应用、未配对扩展、缺少官方会话读取契约均列入明确缺口。

## 官方依据（2026-10-12）

- [QwenWork Connectors](https://docs.qwenwork.ai/desktop/connectors)：stdio、SSE、Streamable HTTP；文档带 International Edition 标记，国内发行版同等能力待核对。
- [QwenWork Hooks](https://docs.qwenwork.ai/desktop/hooks)：stdin session_id/cwd/事件，UserPromptSubmit.prompt；用户级 settings.json，更改需重启。未从 Stop 事件推断助手全文。
- [Kimi Work](https://www.kimi.com/en/help/kimi-work/overview)、[插件和技能](https://www.kimi.com/help/plugins-and-skills/overview)：Work/Code/Web 范围分别核实。
- [豆包工作](https://www.doubao.com/work)、[开放平台](https://open.doubao.com/document/doubao-developer-guide/skill-integration-guide)：内测入口不等于已开放消费端会话 API。
- [WorkBuddy 插件](https://www.codebuddy.cn/docs/workbuddy/Plugins)、[WorkBuddy MCP](https://open.workbuddy.cn/docs/expert)：产品专属契约。
- [扣子 MCP](https://docs.coze.cn/mcp)：远程 Streamable HTTP/SSE，不支持 stdio；不把 Worket 私有 POST bridge 当作标准 HTTP MCP，也不暴露 localhost。
- [ZCode Hooks](https://zcode.z.ai/en/docs/hooks)：transcript_path 为 Hook 生命周期内的临时文件，不能当作持久历史。
