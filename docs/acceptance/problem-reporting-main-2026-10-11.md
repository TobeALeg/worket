# 主线问题反馈与诊断日志迁移验收

日期：2026-10-11。环境：Windows x64、Node.js 24.19.0、Electron 44.1.1；基线 `main` / `origin/main` 为 `a8d1f06`（v0.1.8，已适配 Windows）。

## 迁移范围

用户要求仅合入 `problem-reporting` 的日志与反馈。核实远端实际分支为 `origin/codex/problem-reporting`，tip `67f8073`；诊断和报告核心来自独立功能提交 `144f7f2`，至 tip 核心文件无后续改动。迁移客户端日志、单页反馈、协议、持久队列、私有后台收件箱及测试，不整体 merge 51 个功能提交。

分支后续契约页面、审阅/派发规则、公共窗口导航重构、研究原型、线上部署记录及分支发布声明均不导入。主线的 Win32 前台识别、Codex 程序发现、WorkBuddy 命名管道、托盘、凭据异常启动保护、窗口位置、双平台打包和更新选择保持不变。无版本递增、Release、生产后台部署或 Work Core 数据迁移。

迁移修正两处：旧草稿存储用只读句柄 fsync，在 Windows 报 EPERM，改为可写句柄，保留临时文件/刷盘/rename；管理员保存监听在 await 后访问已失效的 event.currentTarget，改为预先固定按钮。新增当前主线真实打包 QA，不导入分支包含其他界面变更的旧 QA；现有渲染器 mock 补反馈 IPC 表面。

## 本轮结果

| 检查 | 结果与证据 |
| --- | --- |
| `npm test` | 302 项全部通过，无跳过；含原主线 294 项和报告 8 项 |
| `npm run typecheck` | 通过 |
| `npm run build:server` | 通过，共享报告协议包含在后台编译范围 |
| `npm run package:win` | 通过，生成 `release/Worket-win32-x64/Worket.exe` |
| `npm run qa:problem-reporting` | 真实 Windows 打包 Electron + 本机临时管理服务，完整反馈闭环通过 |
| `npm run qa:package` | 桌宠、便利贴打开面板、单实例恢复、基本布局及图形状态回归通过 |
| `node scripts/qa-updates.mjs` | 本平台附件、确认下载、hash、复用和手动替换说明通过；弹窗选择/文件显示被拦截，未替换真实应用 |

反馈 QA 使用临时目录、合成描述/令牌与空工作库，`WORKPET_SKIP_INTEGRATIONS=1`、`--dev`，不安装/改动执行者接入、不调用模型或公网后台、不发送真实工作内容。脚本在结束时关闭服务和应用，校验目录范围后清理其临时数据。

真实操作验证：打开反馈仅一处可见入口；初始日志未勾选；填写并勾选后收起/截取真实 Worket 页面；确认图片后不自动重开；草稿未提交期间报告 POST 为零；再入及应用重启恢复原图片、授权和冻结日志范围，重启保持反馈关闭。点击发送后只一次报告 POST，后台完整收到 Windows 环境、同一截图和同一日志快照，客户端显示“反馈已收到”。

用真实管理员页面修改为“已解决”、填写内部备注和公开说明；客户端刷新只能看到公开说明，本人 API 不含内部备注；用户确认删除后后台列表为空。renderer pageerror 为零，本机 JSONL 不含测试访问令牌或问题描述。自动测试另覆盖跨用户隔离、同主体请求关联/错误文本过滤、离线/回执丢失、取消迟到请求、过期与限流。

截图（忽略目录，不提交用户数据或二进制）：`output/playwright/problem-reporting-main/feedback-draft.png`、`admin-inbox.png`；本轮已检查实际画面，无表单溢出或遮挡。

## 未验范围与上线边界

本轮没有 macOS 实机，未宣称 macOS 重新打包/桌面回归；诊断与反馈未引入 Windows 专属产品流程。实际用户故障、原生崩溃转储、磁盘满的桌面表现、系统文件保存对话框导出、不同 DPI/多屏以及真实执行者交接仍需专项验收。

没有升级线上后台或安装到日常运行环境。线上启用需先确认服务具备 `problemReportSchemaVersions:[1]`，落实代理 body 上限、私有管理员访问、备份保留和删除重放，再发布客户端。旧后台不支持时客户端暂停报告并可导出，源码合入不表示线上已能接收。

当前 [设计](../specs/problem-reporting.md)、[产品定义](../product.md)、[架构](../architecture.md) 已同步。本轮源码作为一个逻辑功能提交至主线，不删除原分支。
