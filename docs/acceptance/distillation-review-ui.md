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

## 2026-10-19 审阅页交互修正

已确认条目和关联提示原文继续显示；未关联的非阻断提示在发布时自动记为已知悉，不再重复拦截；自由填写的“你的决定”已移除；“编辑全部”在原条目位置显示唯一可编辑文字和下划线。真正阻断的待定问题仍需处理，删除条目仍走原有隐藏与恢复行为。

`npm run build`、`node scripts/qa-distillation.mjs --unpackaged`、`npm run package:mac` 和 `node scripts/qa-distillation.mjs` 均通过。Electron 夹具验证：勾选后条目仍存在，展开后已处理问题原文仍可见，编辑态每行只有一个文字输入且没有重复只读副本，非阻断提示无决定输入框且不阻止发布；打包版完整流程通过，410px 视口没有横向溢出。测试使用合成模型，不代表真实业务候选已由用户验收。

新包经 ad-hoc 签名及深度严格校验；构建与 `/Applications/Worket.app` 的 ASAR SHA-256 均为 `12c51f70f7ca43dd32f2856cbe3f83858e5e45cd54147673e16f664f11315761`。旧应用备份在 `output/app-backups/review-flow-20261019/Worket.app`，其 ASAR 哈希为 `96783690b5cba2df2ff12faf5c367898ef49bff239a2253b23773a4b260d1c83`。已正常退出旧版并重启新版，主进程从 `/Applications/Worket.app/Contents/MacOS/Worket` 运行；未修改现有用户数据目录。

## 2026-10-19 输入设置布局

“输入类型”和“默认值”在同一行，相关设置纵向间距收紧；选项列表和变量标识独立占整行，文件输入不显示默认值。`npm run build`、源码版与签名打包版的 `qa-distillation.mjs` 均通过。Electron 断言覆盖 360px 和 410px：两个控件同排、设置区域无横向溢出；截图见 `output/distillation/input-settings.png`。默认值预填新工作、仍可修改的既有逻辑未改。本次使用合成模型夹具，未代替真实用户可用性验收。

本机旧应用已正常退出并备份至 `output/app-backups/input-settings-20261019/Worket.app`。新包已安装、深度严格签名校验通过；构建与安装 ASAR 的 SHA-256 同为 `bf30206888bc90e4b16c48a1e4c4ddd52ac4413e719217b1999f0467319f499b`。重启后主进程路径为 `/Applications/Worket.app/Contents/MacOS/Worket`，未改动用户数据目录。

## 2026-10-19 必填开关

输入项“必填”改为有明确开关状态的控件，与变量标识同行。源码版 Electron 回归验证开关可从必填切到可选再切回；360px 与 410px 设置区域无横向溢出，截图见 `output/distillation/input-settings.png`。打包版首次完整回归在 Electron 重启连接处达到 180 秒超时，之前的开关、保存和新工作步骤已通过；清理进程后第二次完整回归通过，包括重启、来源异常和重试。本次没有改动必填字段的数据契约。

新包经 ad-hoc 签名和深度严格校验，构建与安装 ASAR 的 SHA-256 同为 `5b684b014e8f0bf7c85bd48c4e9011295505e5ed9d9c52e5ab4cb902b8d2938c`。旧应用备份至 `output/app-backups/required-toggle-20261019/Worket.app`；新版已重启，主进程路径为 `/Applications/Worket.app/Contents/MacOS/Worket`。

## 2026-10-19 待定问题定位

只读核对本机草稿确认：阻断保存的是一条关联到折叠约束的未处理规则问题，截图下方两条“保存时自动记录”的内容均为非阻断提示。原界面页脚状态文字会被“已暂存”覆盖，也没有定位入口；Electron 回归先复现 `#dr-pending` 缺失，再验证修复。现在折叠条目显示“待处理”，页脚独立显示“查看 N 项待定”，点击可展开、滚动并聚焦首个问题的处理按钮；纯非阻断区显示“其他提示”。现存条目缺失的关联问题也会在独立区域呈现，不再隐藏在删除历史内。

`npm run build` 与源码版 `qa-distillation.mjs --unpackaged` 通过；源码版验证待定定位、处理按钮、保存状态与待定入口并存、360px 和 410px 无横向溢出，截图见 `output/distillation/02-pending-revealed.png`、`output/distillation/02a-pending-saved-small.png`。签名打包版首次在测试应用首次启动时 Electron 调试连接超时，未进入审阅；正常退出本机安装版后重试，同一打包版完整流程通过（含重启与来源异常重试）。测试使用合成模型，不代表用户已决定是否采纳本机草稿中的业务条款。

安装前已正常退出旧版，并备份至 `output/app-backups/pending-location-20261019/Worket.app`。新包通过 ad-hoc 签名深度严格校验；构建与安装 ASAR 的 SHA-256 均为 `5312c1e7674f5a8356f7c429d302253bf94f6704eca0ee8b602fe9fea79052aa`。新版已重启，主进程路径是 `/Applications/Worket.app/Contents/MacOS/Worket`；未修改原有用户数据库。

## 2026-10-19 适用范围与采纳状态同排呈现

根因是后台曾把任何 `UNCERTAIN` 或 `PROPOSED` 规则自动转换成阻断问题；演进提炼和未确认重复关系也会再造同类问题。现在候选条目原行显示“仅本次”“建议·未纳入”或“范围未定”，默认不进入 `effectiveRules`；点对号将非冲突候选明确改为 `REUSABLE/ACTIVE`。旧草稿关联的范围类问题不再计入待定，暂存时记为未纳入；真实冲突、缺少执行信息和失效的规则依赖仍按原机制处理。

验证：`npm run build`、`npm run build:server`、31 项定向提炼/演进测试、源码版及打包版 `qa-distillation.mjs` 完整流程通过。合成桌面夹具确认候选同排标记、不出现重复范围问题、真正阻断问题仍可定位、保存和发布可完成；这是合成模型验证，尚未证明线上模型实际产出质量。全套 `npm test` 首次在受限环境的 WorkBuddy IPC 用例失败并停滞；以本机 IPC 权限重跑后发现一处提示版本断言未更新，修正后全套 350/350 通过。

新应用经 ad-hoc 签名和深度严格校验；构建及 `/Applications/Worket.app` 的 ASAR SHA-256 同为 `57fb6fff561ab9d294609266dc84261a7a59f80b73e74c3442cbbb128deaaca7`。旧应用备份在 `output/app-backups/scope-review-20261019/Worket.app`（ASAR `5312c1e7674f5a8356f7c429d302253bf94f6704eca0ee8b602fe9fea79052aa`）；已正常退出旧版并重启，新主进程路径为 `/Applications/Worket.app/Contents/MacOS/Worket`。

用户单独授权后，PR #34 已按目标 HEAD 合入 `main`，合入后 CI 两项成功；后台从该合入提交的干净源码构建并部署。公网 `/health` 返回 `{"ok":true,"configured":true}`，匿名 `/v1/capabilities` 返回 401，公网 `/admin/` 返回 404；运行时四份关键文件哈希与合入构建一致，原 29 条请求保留，元数据库 `quick_check=ok`。仅验证发布和代码一致性，未消耗真实模型调用重跑用户草稿，不能把线上候选质量称为真实验收。备份、旧容器及回滚信息见 [运维记录](../deployment/jp-server-worket.md)。

## 2026-10-19 增量比较的一次性候选

复核发现旧增量合并会把 `INSTANCE` 新项直接放入“未纳入要求”来源摘要，不显示为可勾选的审阅条目。现在增量草稿保留该候选行和原始证据；仍为一次性或未采纳时，发布前从新版本内容、规范资料固定和版本比较中排除。仅有一次性候选时复用原定义版本；点勾后改为 REUSABLE/ACTIVE，才发布新版本并进入以后实例。旧式来源记录在条目可见时不重复显示。

全套 `npm test` 352/352 通过，冻结模型的义务与重复场景回放通过；新增两个真实仓库集成用例分别验证“一次性候选可审阅但无新版本”和“采纳后产生有效新版本”。打包版 `qa-distillation.mjs` 的初次沉淀流程通过。旧 `qa:contract:evolution` 桌面脚本在进入增量步骤前等待已不存在的 `.definition-summary` 选择器而超时，不能据此声称增量桌面端到端回放通过；本轮增量显示依据来自实际审阅器代码路径及增量服务集成测试。

新应用签名深度严格验证通过；构建与 `/Applications/Worket.app` 的 ASAR SHA-256 同为 `90f8bc03e03f3dd4664b0e1c4287bfc39ffbb19e49e393cbb45c70dbf2b934fa`。旧应用保存在 `output/app-backups/scope-review-evolution-20261019/Worket.app`，正常退出后更新并重启，主进程来自 `/Applications/Worket.app/Contents/MacOS/Worket`。增量后台代码尚待本补充提交通过 CI 后部署，不能把本机安装视为线上已更新。
