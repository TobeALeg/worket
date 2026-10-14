# 顶栏与返回导航验收

2026-10-09：更换历史聊天图标，统一全页顶栏和返回语义，并核查 WorkBuddy 接入不可用。

## WorkBuddy 原因与恢复

实际客户端检查返回 `connect ECONNREFUSED /Users/dandi/.workpet/workbuddy.sock`。当时没有 WorkBuddy 主进程，接入扩展已安装，socket 是残留文件；本机 WorkBuddy 为 5.5.6。启动 `/Applications/WorkBuddy.app` 后协议状态检查与历史列表读取成功，返回 30 条会话。本次只核对状态和列表数量，不向执行者发送消息，不在用户工作库中导入历史。当前适配器通过 WorkBuddy 运行中的接入扩展读取历史，应用关闭时无法连接。

## 导航变化

主页面、历史、服务与改进数据、沉淀准备及任务、契约阅读与审阅、复用、验收和反馈使用同一个顶栏 DOM。反馈、菜单、关闭控件及原监听器保持一致，子页增加左侧返回；右上角 × 调用 `panel:close` 收起整个窗口。反馈从子页逐级返回，退出反馈后恢复底层页面顶栏。审阅返回和菜单导航先暂存修改；校验或保存失败时保留编辑页，不发布定义。小型确认、截图预览及执行者选择保留弹层操作。

后台任务刷新以页面内容节点身份判断是否仍处于同一任务，不以包含可移动顶栏的整份 HTML 判断；菜单展开时延后刷新，父页刷新不移动反馈页顶栏。

## 验证

- `node scripts/qa-interface.mjs`：修复前可复现历史页缺少全局控件；最终通过 34 个界面截图状态，并检查历史、任务、服务、改进数据、反馈的控件坐标、返回焦点、嵌套返回、× 与返回的区别，以及运行中任务在反馈打开时继续刷新。
- 打包后的 Electron 合成验收：410 CSS 像素宽时反馈、菜单、关闭的矩形依次为 `(305, 6.5, 24, 24)`、`(333, 5.5, 32, 26)`、`(369, 6.5, 24, 24)`，主页、历史及嵌套反馈一致。实际点击 × 后原生窗口隐藏，历史 dialog 保持原状态；再次显示后可用左侧返回。截图和报告在 `output/playwright/navigation-*-native.png` 与 `output/playwright/cancel-confirmation-native.json`。
- `WORKPET_EXECUTABLE_PATH=.../Worket node scripts/qa-draft-materials.mjs`：最终打包版通过返回和菜单暂存、校验失败保留、重开选择保留、重启与固定版本发布、复用/MCP、手动修订及旧实例版本保留。报告为 `output/draft-materials/2026-10-09T11-10-55-700Z/report.json`，外部模型调用为 0，没有向外部执行者派发。
- 最终包中的 `window-header.js`、`panel.html`、`distillation.js`、`definition-review.js`、`recording-sources.js`、`problem-feedback.js` 与当前构建逐字节一致。

本轮只交付本地开发版，不替换正式版或发布公开更新。截图和合成验收证明布局及操作路径，不证明用户查找时间或学习成本收益。
