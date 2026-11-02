# ChatGPT 当前聊天导入验收

日期：2026-11-02。状态：开发版实现及 macOS 真实 Chrome 读取／待确认预览通过，待用户验收。未提交、未发布。

## 用户要求与实现

用户明确要求当前这一个聊天的全部消息，无需手动选文字。浏览器插件新增“导入当前聊天”，通过 activeTab 的明确点击读取当前 ChatGPT 分支的可见消息正文，自动检查页面首尾并遍历滚动容器，保留角色、顺序、稳定 ID。当前 ChatGPT Work DOM 与常见旧版 DOM 均有处理。按消息显示预览并自动填写实际聊天 URL；发送到 Worket 待确认箱后继续沿用预览／确认保存。原选区读取保留。

只处理当前聊天，不调用私有聊天 API、读取认证数据或打开其他会话。附件正文与其他分支不包含。正在生成、用户操作／导航、消息变化、顺序无法确定或超限会明确失败；默认最多 90 秒、2000 条消息、800 KB 消息数据，不静默截断。CURRENT_CHAT 作为事件采集方式保存，页面首尾覆盖不能成为云端完整性或删除证明。

## 验证

- `npm run dev` 完成 TypeScript 构建、打包并启动本地开发版，沿用用户数据；实际界面路径为仓库 release/Worket-darwin-arm64/Worket.app。
- `node --experimental-strip-types --test test/connectors/current-chat.test.ts test/connectors/flow.test.ts test/connectors/web-transfer.test.ts test/connectors/browser-setup.test.ts test/connectors/native.test.ts` 共 18 项通过。隔离 Electron 验证虚拟滚动、正文／角色／顺序／稳定 ID、代码缩进／表格／链接、排除侧栏／隐藏内容／按钮、恢复滚动、旧版结构、生成与导航错误；服务测试验证待确认数据、元数据和重复导入去重。
- 在用户已打开的 Chrome“每周优先级整理”ChatGPT 页面，通过真实工具栏打开 Worket 插件，无需选字点击“导入当前聊天”。结果为 6 条消息：用户 2 条、助手 4 条，含页面起点的原始用户问题与最后一条助手回复，按顺序展示。
- 点击发送到本机待确认箱，实际新版 Worket 选择对应待确认项，自动填入聊天 URL／会话标识／标题，并显示共 6 条消息。点击预览后显示当前聊天采集边界及用户／助手正文，确认导入按钮启用；没有点击确认保存，没有触发此真实聊天的模型提炼或向第三方发送。
- 本机已有扩展目录已更新至 0.3.0 源文件，新入口通过重新打开 popup 实际可用；没有通过 Chrome 管理页操作或改变现有权限／扩展 ID。
- `git diff --check` 通过。

## 边界

真实在线验证仅覆盖上述一条会话；不能外推所有 ChatGPT 版本、长会话、附件或隐藏分支。隔离虚拟滚动测试是受控夹具，不是大量在线会话验收。页面 DOM 不提供云端消息总数证明，后端保持 historyComplete=false，不根据此次读取推断来源删除。当前消息读取需要保持 popup 打开；关闭后可重新读取。Windows 真机未验证。
