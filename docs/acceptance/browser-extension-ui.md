# 浏览器扩展界面统一（2026-10-14）

目标：让网页交接弹窗沿用当前 Worket 客户端的视觉语言，保留原工作包传输、主动选区和待确认箱流程。

## 改动

品牌栏复用客户端标识。构建时从 `src/renderer/theme.css` 原样同步扩展主题，统一暖白底色、深绿主操作、字体、控件尺寸和圆角；`popup.css` 只负责扩展布局与控件外观。接收工作包与导入选区以细线分区，来源和角色并排，完整采集边界按需展开。按钮显示读取、发送和填入的真实等待状态；反馈使用无底色文本，失败保留原原因。

未改变 manifest 权限、Native Messaging 协议、选区范围、网页发送及 Worket 保存确认边界。

## 验证

- `npm test`：346/346 通过。测试需要本地 HTTP/Unix socket；受限沙箱中的首次运行失败，允许本地监听后完整重跑通过。
- TypeScript 构建、`node --check integrations/browser-extension/popup.js`、`git diff --check` 通过。
- 隔离 Chrome for Testing 实际加载 MV3 扩展，主题和脚本正常运行，无页面异常；正常布局为 410×552px。未注册 Native Host，未使用私人浏览器资料。
- 合成 Chrome API 场景验证读取后字段填入、正文编辑与脱敏后的发送 payload、等待期间禁用、待确认成功提示、填入成功/失败、空选区、断连及超长标题/附件名。主题文件与客户端逐字一致，长内容无横向溢出。此项不代表真实网页上传或 Native Messaging 传输验收。
- `node scripts/qa-electron.mjs --packaged`：隔离打包应用启动、Dock、再次启动恢复、410×660 主面板及桌宠界面检查通过。

渲染与合成交互报告：`output/playwright/browser-extension-ui/report.json`、`extension-report.json`；截图位于同目录。原有 `qa-browser-selection.mjs` 未取得工具栏弹窗，结果为 `NOT_VERIFIED`，未把它计为真实选区成功。
