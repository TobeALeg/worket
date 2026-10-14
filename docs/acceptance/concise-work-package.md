# 精简工作包验收（2026-10-14）

PR #15 基于 `codex/cn-ai-connectors`。初版实现 88c7af1；真实复制检查发现原文代码、Markdown 链接被过度转义，已在 a26608c 修复，并补充字面内容保真回归。

## 实际安装与复制

- 安装 `/Applications/Worket.app`，正常退出、备份旧应用、安装并重启；deep/strict 签名验证通过。
- 安装与构建 ASAR SHA256 同为 `6dd66f9bcd9a9004b2e1dbde8c41f01e15272d0bc72c15f7f458aa5d7d1154ab`。
- 在原有含 139 条记录的实际工作中，分别点击“复制工作包”和“复制网页工作包”，通过原生 Chrome 键盘粘贴到仅监听 127.0.0.1、禁止脚本及外联的临时核对页。未发送到外部网站或模型，未重新导入记录。
- 从已粘贴 textarea 的 DOM 值完整读取：本地 7361 字符，网页 7408 字符。移除网页首行工作关联标识后，两份正文完全一致。
- 内部快照索引、sourceDigest/stateDigest/materialDigest、qaProofToken、deliveryReceipt 均未进入正文；原始代码、链接及尾部内容保留完整。
- 此实际工作尚未解析，按设计保留带角色的业务原话兜底；不宣称已语义裁剪所有聊天。旧问题和决定列为线索，不写成已确认要求。
- 临时证据在 `/tmp/worket-actual-local-copy.md`、`/tmp/worket-actual-web-copy.md`、`/tmp/worket-copy-verified.png`，不提交私人工作正文。数据库 quick_check=ok。

## 回归

完整 `npm test` **337/337 PASS**。覆盖要求替换、阶段作用域、依赖、验收状态、资料可达性、内部读取确认、普通/网页内容一致性以及代码/链接不额外转义。MCP 显式 v1–v3 继续兼容，默认/v4 返回简洁工作说明。
