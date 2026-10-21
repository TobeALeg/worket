# Figma 基础组件与视觉样板

2026-10-21 后续：用户认可本套基础风格方向，现已据此建立 [15 类任务、49 个主要页面与状态稿](pages.md)。下面保留基础组件交付记录；认可方向不代表全部差异已批准进入运行时。

日期：2026-10-21。归属：Dean's team。状态：**已创建并完成结构及视觉检查，待用户评审**。此状态不代表批准客户端改版。

[打开 Figma 文件](https://www.figma.com/design/DctYxpkI7FMqVfhCJGC8qC) · [页面规范](README.md) · [基础映射](foundations.md) · [机器可读节点索引](figma-manifest.json)

## 看什么

| 样板 | 内容 | Figma 链接 |
| --- | --- | --- |
| Foundations | 核心颜色、文字层级、间距、尺寸与字体替代说明 | [基础风格](https://www.figma.com/design/DctYxpkI7FMqVfhCJGC8qC?node-id=4-11) |
| Components | 基础组件的正常、悬停、焦点、禁用、处理中及业务提示等状态 | [组件状态](https://www.figma.com/design/DctYxpkI7FMqVfhCJGC8qC?node-id=4-72) |
| Visual samples | 本次输入的组件组合、契约纸色/字体/阴影样板、空状态 | [组合与材质](https://www.figma.com/design/DctYxpkI7FMqVfhCJGC8qC?node-id=4-234) |

三张样板位于同一页，主组件在右侧独立区域；评审样板使用组件实例，文字通过组件属性修改，状态通过变体切换。材质样板只覆盖颜色、文字和阴影，不是完整 ContractSheet：尚未迁移纸纹、分类页签、蜡封、版本管理或完整页面交互。

交付时截图：[基础风格](previews/foundations.png)、[组件状态](previews/components.png)、[组合与材质](previews/samples.png)。截图是本次审阅快照；后续修改以 Figma 实际节点为准。

## 组件到源码的对应

| Figma 组件 | 节点 | 变体数 | 源码参考 | 暴露的属性 |
| --- | --- | --- | --- | --- |
| Button | `4:2` | 20 | `src/renderer/panel.css` | Kind、State、Label；Busy 显示处理中反馈 |
| TextInput | `4:3` | 4 | `src/renderer/panel.css` | State、Value |
| Textarea | `4:4` | 2 | `src/renderer/panel.css` | State、Value |
| Select | `4:5` | 2 | `src/renderer/panel.css` | State、Value |
| Checkbox | `4:6` | 3 | `src/renderer/panel.css` | State、Label |
| Tab | `4:7` | 2 | `src/renderer/panel.html`、`panel.css` | State、Label |
| ListRow | `4:8` | 2 | `src/renderer/panel.ts`、`distillation.ts` | State、Title、Meta、Summary |
| InlineMessage | `4:9` | 3 | `src/renderer/panel.css` | Tone、Message；切换 Tone 后按真实状态编辑文字 |
| ReviewItem | `4:10` | 3 | `src/renderer/definition-review.ts/css` | State、Text；仅展示基础文字/决定状态 |
| EmptyState | `3:105` | 1 | `src/renderer/panel.css` | Message |

总计 10 类、42 个主组件（9 个变体组和 1 个独立组件）。上述为源码参考映射，不是已实现的共享 TypeScript 组件库，也未发布 Code Connect。ReviewItem 尚未迁移完整的编辑、来源、恢复/撤销交互；页面壳、顶栏、执行者选择器等复杂组件留待后续批次。

## 变量与样式

- 2 个单 Light 模式集合：Primitives 与 Semantic，各 51 个变量。语义变量通过别名引用基础变量。
- 已有 CSS 变量保留真实名称，例如 `var(--accent)`、`var(--control-height)`；提取的局部值使用候选 `--worket-*` 名称，并在描述中标注尚未接入运行时。不能把这些新名称直接复制到当前 CSS 使用。
- 8 个文字样式、1 个契约阴影样式；组件文字关联共享样式，主要配色、间距、圆角与边框绑定变量。固定图标几何保留既有 SVG，图标来源见 `src/renderer/review-icons/sources.json` 及同目录许可证。
- Figma 的 opacity 数值变量使用百分比 45，对应现有 CSS 的 `.45`。导出时需要转换，不能把 45 直接作为 CSS opacity。

## 待用户确认的差异

1. **字体替代**：远端可用字体中没有 PingFang SC / Songti SC。本样板使用 Noto Sans SC 与 Noto Serif SC，标题用 Bold 近似现有系统 650 字重。客户端字体未变；落地前核对字重与中文换行。
2. **辅助文字可读性**：保留 `--muted: #858d80` 的现状变量；样板中的必要辅助信息试用契约已有色 `#687361`，单独命名 `color/text/secondary-readable`。这是待评审建议，尚未批准全局替换。
3. **原生控件近似**：Checkbox、Select 为可编辑的设计表达，不能代表不同操作系统的原生控件像素完全一致。焦点、错误与 Busy 状态属于基础组件提案，落地仍需真实键盘和业务行为验证。
4. **本次范围**：未创建或修改工作流页面；页面迁移范围及缺口见 [后续页面记录](pages.md)；未更改应用代码、安装包或后台。

## 验证与后续维护

结构检查确认：102 个变量，别名全部可解析，无缺失 WEB 代码语法，无 ALL_SCOPES；42 个主组件，组件文字均关联 Text Style。三张样板截图经实际查看，修正了横向容器高度、焦点描边裁切、禁用透明度及状态文案，并补齐多行输入错误样例。

后续修改先按节点索引读取 Figma 当前状态，保留已有组件 ID 与实例关系，再更新对应节点、文档与索引。评审通过后在本文件明确记录确认范围；确认某个组件不代表所有候选调整都获认可。当前没有自动双向同步或库发布。
