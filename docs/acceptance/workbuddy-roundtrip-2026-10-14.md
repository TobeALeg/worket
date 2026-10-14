# Worket → WorkBuddy 真实交接验收（2026-10-14）

## 测试与当前结论

使用手动导入的合成工作，要求先读取 Worket 工作说明，再计算 17 × 23，返回 `WB_ROUNDTRIP_20261014_1530_RESULT=391`。不包含私人资料，也不要求修改文件。

- work：`6b03af7a-bb36-4fa7-9d15-6d4323723d5b`
- delivery：`0254114b-3c6d-4e5a-b0bd-038d9d17ca99`
- WorkBuddy session：`913e9912-b5f9-40d0-a0af-0108e666913f`

真实安装版经界面发起交接，WorkBuddy 收到带双重标记的草稿并实际发送。首次 Step-5-Preview 队列已满，改用界面标为限时免费的 Hy3 在同一会话继续。没有把模型队列故障当作 Worket 交付故障。

当前已验证交付、发送、真实会话绑定及回复自动回流；尚未通过完整接手与正确结果验收。WorkBuddy 的 workpet MCP 显示“首次连接此 MCP 服务需要您的信任确认”，已向用户请求当场授权，未代替用户绕过信任状态。工作包读取回执仍为空，不能将失败回复回流称为完整链路通过。

## 发现与修复

1. 用户级 MCP 配置误用 `.mcp.json`；修正为 `~/.workbuddy/mcp.json` 并保留其他 MCP 配置。[官方配置说明](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/MCP-Guide)与真实配置/界面一致。首次加载仍需在 WorkBuddy 的“专家·技能·连接器 → 连接器 → 自定义连接器”信任 workpet。
2. 提交 Hook 的正文带上下文包装，不能直接在开头解析交付标记。Hook 改为最小会话通知，由现有 ConversationUpdated 路径从当前账号的本地正文核验 WORKPET 和 DELIVERY；结束通知可补偿提交早于落盘。修复后待绑定 ID 自动变为上述真实会话 ID，原会话中已落盘的消息回流到同一工作。

## 交付证据

- 修复提交：`987a21b`。构建与全量回归 343/343 通过。
- 已安装并运行 `/Applications/Worket.app`；旧应用备份于 `output/app-backups/workbuddy-roundtrip-20261014-1540/Worket.app`。
- 安装与构建 ASAR SHA-256 一致：`363e65ced1d0872eb8f35a9f14ef95cf8e085f99bd98dde99f0312e8e6748422`；签名检查通过。
- 既有用户数据保留；数据库只读 `PRAGMA quick_check` 为 `ok`。未手动修改绑定或伪造 MCP 读取回执。

## 兜底范围

用户明确排除 RPA。保留人工确认发送、复制工作包、应用导出和选定内容回流；人工处理与自动回执分别记录，不声称无人值守接力。
