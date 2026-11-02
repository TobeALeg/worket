# 浏览器插件安装与 HTTP 400 修复验收

日期：2026-11-02。状态：macOS 开发版已验证，待用户验收；未提交、未发布。

## 用户问题与原因

用户要求手动安装插件的可发现入口，并报告 Worket bridge 返回 HTTP 400。本机使用已配置桥接令牌复现 `/web/transfer` 的 preview 请求，响应正文为“请先在 Worket 复制工作包或交接到网页（10 分钟内有效）”。这是未准备交接内容；旧 HTTP 客户端丢弃正文，仅保留状态码。不能据此推断其他 HTTP 400 都是同一原因。

## 实现与验证

- 应用菜单“浏览器插件”及导入弹窗“安装 / 检查浏览器插件”进入同一安装弹窗；Chrome / Edge 选择、目录准备、路径复制、扩展 ID 配对及连接检查复用现有组件。
- 手动加载由浏览器管理页完成，配对仅登记用户填写的扩展 ID；Runner 使用当前 Electron 的 Node 模式。
- 实际开发版中打开菜单入口，识别既有 Chrome ID，并点击“配对 / 修复连接”，返回“本机连接正常”。验证了打包路径、Electron Runner 与本机 HTTP 桥接，不只是源码测试。
- 使用实际登记的 Native Host 发送 transfer preview，收到具体中文提示和 TRANSFER_NOT_PREPARED；扩展把此情况显示为普通提示。
- build、diff check 通过。`node --experimental-strip-types --test test/connectors/browser-setup.test.ts test/connectors/native.test.ts test/connectors/web-transfer.test.ts test/connectors/flow.test.ts` 的 15 项检查通过，涵盖实际 Host、精确 origin、失败连接、错误代码及已有交接回归。

## 限制

浏览器工具拒绝访问 chrome://extensions/，因此日常 Chrome 的插件“重新加载”须用户手动完成，未通过其他方式绕过限制。日常 Chrome popup 已在下方追加真实选区实测，确认工作包未准备时显示中文操作提示。Windows 注册与启动代码已参与 TypeScript 构建，但未做 Windows 真机验收。连接检查成功不代表浏览器当前启用扩展，不涉及自动发送聊天或抓取历史。

## 日常 Chrome / ChatGPT 真实选区实测（同日追加）

用户报告点击“读取当前选区”无效。按用户指定使用 Chrome 已打开的“每周优先级整理”ChatGPT 页面，未发消息、未修改聊天、未发送到 Worket。

1. 读取当时 DOM 选区为空；实际插件点击后显示“请先在页面选中一条用户或助手可见消息”。当时仍打开的旧 popup 显示旧 HTTP 400 提示。
2. 关闭 popup，在实际回复的可见标题“主要风险与应对”上用鼠标建立文字选区，并只读核对选区确为该文字。
3. 通过 Chrome 工具栏实际 Worket 按钮重新打开 popup（真实 activeTab 授权），确认已显示新的“请先在 Worket 复制工作包或交接到网页”提示。
4. 点击“读取当前选区”，选定正文变为“主要风险与应对”，来源为 ChatGPT 网页，“发送到 Worket 待确认箱”启用。未点击发送，不产生工作记录。

结论：当前真实 ChatGPT 页面读取选区功能可用；本次无效反馈对应未选中文字，原空选区提示位于底部，容易被忽略。没有把此一次读取扩大为完整历史、真实发送、附件上传或其他 ChatGPT 页面全部验证。

## 发布候选补验（2026-11-02）

用户要求统一插件页面圆角并发布客户端与插件。基于最新 origin/main 的隔离分支准备 Worket 0.1.11 / 插件 0.3.1。插件外层 10px 圆角及独立滚动已在实际 Chrome 弹窗检查；主线 393 项客户端测试、34 项离线评估测试及服务端构建通过。独立插件 ZIP 已核对目录内容与 SHA256，无 macOS 资源分叉文件。最终正式包与线上发布结果以后续 Release 记录为准。
