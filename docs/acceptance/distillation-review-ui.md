# 沉淀确认页接入验收 · 2026-10-10

用户认可紧凑四分区方案，授权接入客户端并对接真实确认、删除和 Reference 数据。没有批准公网发布或后台部署。

实现：`definition-review.ts`、`definition-review-motion.ts`、`definition-review.css` 与 MIT 授权的 Tabler 原始 SVG。既有 update / publish / sourceReview / materialBindings 不变，没有数据库迁移。

验证边界：模型响应与原生选择器为明确的合成夹具；页面为真实 Electron 渲染，保存、发布、来源、SQLite、固定材料与 MCP 使用实际实现。验收不证明用户审阅效率、真实模型提取质量或真实执行者业务完成。

- 完整回归：306/306 通过（沙箱首次阻止本机监听，允许监听后重跑通过）。
- `qa-draft-materials.mjs`：四核心分区、真实文件名/完整路径、320ms 划线后 400ms 抽离的中间帧、默认隐藏/箭头展开/恢复、动画中撤销、同 key 跨集合隔离、返回与菜单自动暂存、重开及重启资料固定版本、发布/新实例/MCP、手动修订与旧实例版本隔离。
- `qa-document-revision.mjs`：空白条款采纳失败无副作用、规范修订仅清除相关决定、关联规则重新待确认、重启后确认与删除经真实 publish 生效、MCP 读取新规范行范围。

- `qa-distillation.mjs --unpackaged`：完整沉淀提炼、真实 Issue 确认/删除恢复、来源原文展开、编辑与撤回决定、资料固定、发布、输入新参数、新工作验收、重启、来源异常重试通过。真实布局宽度 410px、内容 scrollWidth 410px；契约与复用流程另覆盖 360px。
- 打包后同一 `qa-draft-materials.mjs` 全部通过，包括资料删除暂存与实际原路径重新固定、320ms + 400ms 动效中间帧。记录：`output/draft-materials/2026-10-10T10-30-18-301Z/report.json`；原始模型流程记录：`output/distillation/desktop-report.json`。

本机交付：`npm run package:mac` 生成 arm64 Electron 44.1.1 应用，ad-hoc 签名并通过深度严格验证。旧应用备份至 `/Users/dandi/YanGuan/output/app-backups/distillation-review-20261010T103122Z/Worket.app`。安装到 `/Applications/Worket.app` 并启动，`lsof` 确认实际进程 PID 98484 的 executable 来自 `/Applications/Worket.app/Contents/MacOS/Worket`。

构建与安装 ASAR SHA-256 均为 `d7652e7b84750bbfcc218542530b462b939f670ccfd3d1b8d851cdbc7174ed59`。更新前后 SQLite `quick_check=ok`，工作 6 条、基础定义 1 条、沉淀草稿 6 条均保留。没有发布 GitHub Release 或部署公网后台。

原生 CUA 在绑定安装应用时连续超时，未据此声称完成手工点击验收；页面行为证据来自同一签名打包产物的隔离 Electron 回归及截图，安装与实际运行由签名、hash、进程路径和原数据库核对证明。
