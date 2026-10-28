# 基础样式与组件映射

2026-10-28 用户再次确认：列表只展示最新沉淀，移除版本彩条；版本仍在详情查找。最近活动、已沉淀与工作流列表共用 listDate（M/D HH:mm，斜杠）。已完成运行保留在下方，但去掉分区标题、计数和完成标签；仅 RUNNING 条目显示“进行中”，待验收节点在正文表达。已完成条目与沉淀复用标题、右侧日期、三行正文样式。全页只保留一个“打开全部”箭头入口，新建及定义编辑入口保留。

2026-10-28 Delegate Board 状态系列（用户指定，Figma 与动态开发版已调整、待用户验收）：版本彩条采用浅蓝底/蓝字并保持静态；Workflow 执行中采用同系列蓝色加 12px 圆环，已完成用绿色，待验收用橙色静态标签。只更换彩条和状态外观，标题/日期同排及其余布局保留。

原始色值来自本机 `/Users/dandi/Documents/skills/rea/bundle-forensics/out/delegate-board/delegate-board.css`：brand 背景 `#008ff519` / 前景 `#006dcbf2`，ok 背景 `#00a43319` / 前景 `#00713fde`，warn 背景 `#ff9c0029` / 前景 `#cc4e00`。已查看该目录 `evidence/standalone.png`；圆环直接取自 `live/live.html` 的 `.ui-dbc__spin` SVG，900ms linear 每圈与原 CSS 一致。仅核验用户提供的本机参考，不声称重新核验网站。原参考绿色表示 free，此处按 Worket 业务映射为已完成；橙色使用同系列 warn token。版本颜色不表示正在执行或新版优劣。

Figma 新局部状态组件 `182:3275`、语义变量集合 `VariableCollectionId:182:3253`（6 个原色 + 6 个别名）；圆角 5px、状态高 20px、左右 7px、图文间隔 5px，复用现有中文字体。实例子层不支持写入动效，因此只有运行中示例标签解除实例以承载圆环旋转；其他状态保持组件实例。`183:3263` 旋转关键帧为 0→−1080° / 2.7s，即每圈 900ms；Figma 时间轴可播放三圈演示，未导出视频验证，不宣称已经接入运行时无限循环。动态开发版使用同源 SVG 与 900ms CSS 无限旋转，prefers-reduced-motion 下静止。

2026-10-28 后续局部纠正：已沉淀的版本、标题、日期同排；左侧 24×18 浅绿版本彩条，中部标题，右侧 62px 日期。版本只以文字表达编号，颜色不编码质量或新旧。正文、字号、外侧间距与其余页面保留；新局部组件 `179:3240` 不替换全局 ListRow。该记录覆盖下文首版元信息独占一行的结构，视觉仍待用户验收。

2026-10-28 信息优先视觉提案：复用现有 Tab、ListRow、Button 和全局顶栏，未修改共享 master。ListRow 局部标题 13px、辅助元信息 10px、简述 12px/20px，简述用 secondary-readable，最多三行；运行行独立表达实例身份、状态、已验收数量和详情入口，不使用节点数组箭头。Workflow 底部固定次要“流程定义与编辑”和主要“新建工作流”。均为待评审的实例覆盖，尚未修改运行时 token；节点见 [页面索引](pages.md#2026-10-28-已沉淀与-workflow-小页面视觉提案)。

返回 [页面规范](README.md)。基线：`abc5bb0` 源码，2026-10-21。以下数值为现状记录，建议名称尚未写入运行时。

## 共享颜色与语义命名

来源：[theme.css](../../../src/renderer/theme.css)。第一版建议直接保留值并建立别名，避免规范整理变成无依据的全站换色。

| 现有变量 | 当前值 | 建议语义名称 | 使用约束 |
| --- | --- | --- | --- |
| `--background` | `#fbfaf7` | `color/bg/canvas` | 普通页面底色 |
| `--surface` | `#f0f2eb` | `color/bg/surface` | 控件与局部表面 |
| `--text` | `#343d36` | `color/text/primary` | 主要正文 |
| `--muted` | `#858d80` | `color/text/secondary` | 现有辅助文字；必要信息使用前需核对对比度 |
| `--line` | `#e8e8e0` | `color/border/subtle` | 轻分隔线；不能默认承担所有控件识别边界 |
| `--accent` | `#38634b` | `color/action/primary` | 主操作与选中强调 |
| `--accent-hover` | `#2b513c` | `color/action/primary-hover` | 主操作悬停 |
| `--hover` | `#e9eee3` | `color/bg/hover` | 普通控件悬停 |
| `--warning` | `#aa7b39` | `color/status/warning` | 提醒；配合文字 |
| `--danger` | `#b74737` | `color/status/danger` | 危险操作与错误 |

目前没有完整的 success、focus、disabled 等共享语义 token。不得把主操作绿直接等同于业务成功。审阅勾选的 `#46815d`、删除的 `#b96658` 以及焦点描边的 `#38634b66` 先记录为局部值，视觉核对后再决定公共别名和例外。

## 字体、尺寸与密度

| 用途 | 当前值 | 来源/处理 |
| --- | --- | --- |
| 普通字体 | 系统字体、SF Pro Text、PingFang SC、sans-serif | `theme.css`；保留平台回退 |
| 默认正文 | 12px / 1.6 | `theme.css`；建议 `type/body` |
| 普通控件文字 | 11px / 20px，500 | `panel.css`；建议 `type/control` |
| 普通二级标题 | 18px / 1.35，650 | `panel.css`；建议 `type/heading` |
| 分区标题 | 12px，600 | `panel.css`；建议 `type/section` |
| 审阅标题/正文 | 17px / 12.5px，正文行高 1.55 | `definition-review.css`；保留审阅上下文，暂不机械取整 |
| 辅助信息 | 多处 10px 或 11px | 作为审计发现，不能推广为所有必要信息的标准 |
| 普通控件最小高度 | 28px | `--control-height`；建议 `size/control/compact` |
| 普通控件圆角 | 6px | `--radius`；建议 `radius/control` |
| 普通弹层圆角 | 10px | `panel.css`；建议 `radius/dialog` |
| 全局顶栏 | 高 38px，水平内边距 17px | `panel.css`；组件级参数 |
| 主页面内边距 | 12px 18px | `panel.css`；页面级参数 |
| 子页内容内边距 | 16px 18px | `.dialog-card`；页面级参数 |
| 子页底部操作区 | 11px 17px，动作间隔 6px | `.dialog-shell > .dialog-actions` |
| 普通图标按钮 | 24px × 24px | `.icon-button`；视觉与命中区域待核对 |
| 来源品牌入口 | 28px × 28px；品牌图形 19px | `.source-provider` / `.source-icon` |
| 审阅决定按钮 | 23px × 23px；图形 19px | `.dr-decision` / `.dr-icon`；专用组件例外 |

建议共享间距先采用实际高频的 4、6、8、12、16、18、24、32px，按需要命名 `space/4` 等；此为候选尺度，不执行全局替换。17px 顶栏边距、13px 契约行距等先作为组件参数保留。尚无已批准的“宽松密度”体系，不能从被否定的工作流 UI 推导出新标准。

## 契约专用视觉

来源：[contract/tokens.css](../../../src/renderer/contract/tokens.css)、[material.css](../../../src/renderer/contract/material.css)、[work-contract.css](../../../src/renderer/work-contract.css)。

| 角色 | 现有值 | 规范处理 |
| --- | --- | --- |
| 画布/主动作 | `#fbfaf7` / `#38634b` / hover `#2b513c` | 与全局相同，后续可建立别名 |
| 纸张/底板 | `#faf8f1` / `#e9e5d7` | 保留 `contract/material/*` |
| 墨色/正文/辅助 | `#243e32` / `#4e5650` / `#7b8578` | 契约文字角色，分别核对对比度 |
| 线/鼠尾草/金色 | `#d9dcd0` / `#e2e8d8` / `#d8bf81` | 局部材质，不能直接作为业务状态色 |
| 页签默认色 | `#60765f` | 分类配色是本机展示偏好；不表示状态或版本变化 |
| 衬线字体 | Songti SC、STSong、Noto Serif CJK SC、Georgia | 保留回退；Figma 需核对可用字体和换行 |
| 圆角/行距 | 11px / 13px | 保留组件参数 |
| 纸纹 | 192px 平铺、透明度 .42 | 使用现有 SVG，不随内容高度拉伸 |
| 阴影 | 三层阴影，见 token 原文 | 映射为契约专用 Effect Style |

正式契约内容最长宽度 520px，纸页以 A4 比例为起点，长内容可自然增高。已确认分类标签保留白色衬线文字。`docs/design/work-contract/` 是历史设计产物，不能覆盖生产 renderer 的新行为。

## 组件目录与边界

名称是 Figma 与代码未来映射的建议稳定名称，不声明这些组件已完成代码抽取。

| 组件 | 当前实现入口 | 必需属性/状态 | 边界 |
| --- | --- | --- | --- |
| `WindowHeader` | `window-header.ts`、`panel.html` | 根页/子页、返回名、菜单内容 | 复用现有单一顶栏 DOM，页面不复制全局入口 |
| `Button` | `panel.css` | primary/default/quiet/danger；default/hover/focus/disabled/busy | 视觉状态由宿主提供；不调用业务 API |
| `IconButton` | `panel.css` | icon、accessibleName、pressed、disabled | 不按每个图标生成一个组件变体 |
| `Field` | `panel.css`、各表单 | label、required、help、error、disabled | 标签与错误关联控件；不内置后端业务校验 |
| `TextInput / Textarea / Select / Checkbox` | `panel.css` | value、focus、invalid、disabled | 保留原生语义与键盘行为 |
| `Tabs` | `panel.html`、`panel.ts` | items、active | 活跃项与面板对应；不决定业务导航架构 |
| `WorkRow / DefinitionRow` | `panel.ts`、`distillation.ts` | title、meta、summary、selection | 共享行骨架，工作状态与契约版本不混用 |
| `SourcePicker` | `recording-sources.ts` | provider、selected、availability | 使用既有品牌资源；列表数据由宿主提供 |
| `PageShell / Dialog` | `panel.css`、`window-header.ts` | header、body、actions、returnFocus | 全页导航和短任务弹层分别表达 |
| `InlineMessage / EmptyState` | `.notice`、`.empty`、`.source-empty` | tone、message、action | 错误、空和无搜索结果不得共用含糊文案 |
| `ReviewItem` | `definition-review.ts/css` | pending/confirmed/deleted、expanded、issues | 业务决定由审阅模块处理；保留来源与撤销 |
| `ContractSheet` | `work-contract.ts/css`、`contract/*` | confirmedVersion、category、content、savedFeedback | 只表达真实已确认版本；不替代候选审阅 |
| `ExecutorPicker` | `executor-picker.ts`、`panel.css` | loading、available/unavailable、error | 桌面及网页使用圆形品牌图标，网页增加右下角标；短名称可见，不重复手动发送说明，键盘与屏幕阅读器保留完整名称；选择执行者不代表已接手，业务保留在现有模块 |
| `AttachmentPreview` | `problem-feedback.ts/css` | image、remove、preview、error | 反馈截图与业务输入的权限、存储不合并 |

基础组件不导入 `window.workpet`，不拥有工作、契约或运行的业务状态。逐页抽取时以展示参数和回调连接既有模块；不同业务的数据模型不因视觉相似而合并。

## 后续视觉检查

2026-10-23 工作流地图局部映射：`workflow-map.css` 使用 Figma v6 的 `--map-ink: #26282c`、`--map-secondary: #777c84`、`--map-line: #e9ebef` 与 `--map-blue: #438bff`，仅在 `.wf-map-page` 内生效。卡宽 208、内边距 12、条目宽 184；有底板单行 28，无底板 18，可见边缘间隔 8，底部留白 12。共享按钮沿用现有全局 token，未替换全局字体或主题。成果色按输出身份分配；运行中的可用性与执行状态分别投影，不能以颜色代替文字。图标来源和哈希见 `src/renderer/workflow-icons/sources.json`。

当前值不等于可访问性已合格。需要在实际窗口原生尺寸验证：辅助文字与底色对比、必要信息字号、键盘焦点、不同字体回退、长标题和路径、弹层滚动与底部操作区。通过后再锁定 Figma 的文字样式和最终 token 数值。

2026-10-23 SourcePicker 搜索入口位于共享顶栏反馈按钮左侧，复用 Tabler search（16px，24px 按钮）。点击后输入框向左展开，搜索按钮位置固定；按 Escape 或再次点击收起并清空查询。切换工作阶段或进入子页收起，子页隐藏搜索入口。展开时暂隐品牌区，窄窗口输入框自动缩短；减少动态效果时无展开动画。来源与哈希见 `src/renderer/review-icons/sources.json`。

顶栏搜索、反馈、菜单、关闭统一为 24×24px 居中按钮、16×16px 图形、4px 相邻间隔；菜单不再继承普通弹出菜单的 7px 水平内边距，关闭使用 Tabler x，避免文本字形基线影响居中。

候选审阅的 `ReviewItem` 补充入口：约束分组复用 `.dr-add` 轻量文字按钮，非编辑模式也显示“＋ 添加约束”；新增后沿用局部展开编辑。

ContractSheet 底部次要按钮为“生成新版本”；手动修订复用 ReviewItem 的编辑、添加、删除与恢复，存续条目不显示逐项确认按钮，主按钮为“保存新版本”。

2026-10-27 工作详情交接改为内联图标条：状态说明槽高 32px，条内按钮 26px、图标 22px、间隔 14px；无外框、无底色；图标从交接按钮中心向下依次释放，440ms 飞行、19ms 错峰，接近终点轻微上浮回弹；收起 190ms、反向 7ms 错峰回到按钮。悬停以 90px 半径余弦衰减联动邻近图标，当前最大 1.4，120ms 过渡；键盘焦点同样联动。靠近左右 36px 边缘自动滑动，速度按接近程度平方递增至 180px/s，不显示滚动条。图标图像本身必须为满版圆形：原生圆形优先，其他素材按用户授权紧裁并做圆形 alpha；不得把带留白的方形图像放进圆壳。容器不加底色、装饰描边或内边距，保留必要焦点轮廓。隐藏图标下标签，以 title 与可访问名称提供完整名称，网页角标使用 11px 地球图标，颜色 #969c96、SVG 线宽 1.25（24px 原稿坐标），禁止使用“网／网页”文字；窄屏只横向滚动。Esc、外部点击、再次点击触发器或离开详情取消；减少动态效果时直接展开/收起并禁用悬停过渡。必要告知按需在条外显示。

2026-10-27 图像指认纠正：用户截图明确指认 ChatGPT 结绳标志；第一项按参考使用该图像，直接使用 OpenAI 官方 App Store 页面提供的当前图像（1.2026.286），紧裁为满版圆形，不从用户截图取样，停用蓝色云朵素材。执行者名称与交接仍沿用 Codex。

2026-10-27 全量官方素材核对：品牌标志必须能追溯到官网、官方商店或官方应用包原始资源；记录见 [executor-artwork.md](executor-artwork.md)。原图尺寸不足不得靠放大低分辨率 favicon 交付；保留满版圆形、无壳、无透明空边标准。


## 2026-10-28 图标轻滑调整（开发版待验收）

最近活动与详情交接共用最新圆形品牌素材，Codex 展示 ChatGPT 结绳图像。保留交接按钮原有释放动画，结束后停顿 180ms，整排轻滑再返回一次（1500ms）：溢出时实际滚动最多 24px，无溢出时位移最多 5px。鼠标进入、触摸、滚轮或键盘操作即停在当前位置，之后仅响应用户操作：恢复两端 32px 范围的柔和边缘滑动（最高 110px/s），回到中部或按下即停止；普通滚轮与触控板均可横向浏览。邻近放大最多 1.18 倍。减少动态效果偏好下不播放提示。此记录以用户后续纠正为准：停止的是演示，保留边缘浏览入口；Figma 原节点未同步，页面结构不变。


## 2026-10-28 普通活动入口清理（用户已确认）

普通活动的动作使用“查看”“刷新内容”“删除本地活动”；“记录”可用于已有内容/证据名词，不再作为普通活动的开始/停止动作。契约与流程保留明确的验收语义。桌宠只改文字与对应动作，不改变角色视觉基线。
