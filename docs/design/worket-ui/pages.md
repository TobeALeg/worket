# 现有客户端页面 · Figma 迁移 v0.2

2026-10-23 工作流单独接入：本轮只实现最新 v6 定义与运行地图，节点、源码、边界及验收见 [工作流索引](../workflow-three-forms.json) 和 [接入记录](../workflow-three-forms.md#客户端接入2026-10-23)。下方 15 类任务索引及其历史排除范围保持不变；工作库未迁移。

用户于 2026-10-21 确认基础样板方向，并授权按该规范整理现有页面。本批完成主客户端 **15 类任务、49 个主要页面与状态的可编辑规范化稿**。工作流继续排除，运行时界面没有修改。桌宠、浏览器扩展和后台仍按 [清单](inventory.md) 的相邻界面批次处理。

[打开全部页面](https://www.figma.com/design/DctYxpkI7FMqVfhCJGC8qC?node-id=13-69) · [基础组件](figma.md) · [逐页节点索引](pages-manifest.json)

这是按已认可风格整理的静态设计稿，不是原界面逐像素复刻，也不是可执行原型。后续实现仍要逐项确认页面差异及业务状态，不能把本稿直接作为现有产品行为的证明。

## 页面入口

| ID | 页面组 | 本批已画状态 | 视觉记录 |
| --- | --- | --- | --- |
| P01 | [最近活动与来源搜索](https://www.figma.com/design/DctYxpkI7FMqVfhCJGC8qC?node-id=14-69) | 来源列表、搜索无结果、读取失败、查找中 | 已写入；组图导出受套餐限制 |
| P02 | [工作列表](https://www.figma.com/design/DctYxpkI7FMqVfhCJGC8qC?node-id=14-256) | 进行中 · 多选、已完成、归档记录、空列表 | [预览](previews/pages/P02.png) |
| P03 | [工作详情与执行记录](https://www.figma.com/design/DctYxpkI7FMqVfhCJGC8qC?node-id=14-412) | 详情 · 正常、上下文展开、刷新失败 | [预览](previews/pages/P03.png) |
| P04 | [选定内容导入](https://www.figma.com/design/DctYxpkI7FMqVfhCJGC8qC?node-id=14-566) | 编辑 · 未预览、预览完成、待确认箱 · 空 | [预览](previews/pages/P04.png) |
| P05 | [拆分与危险确认](https://www.figma.com/design/DctYxpkI7FMqVfhCJGC8qC?node-id=14-715) | 拆分工作、取消记录 · 待确认、确认文字不符 | [预览](previews/pages/P05.png) |
| P06 | [已沉淀与沉淀任务](https://www.figma.com/design/DctYxpkI7FMqVfhCJGC8qC?node-id=14-814) | 定义与待处理任务、无已沉淀工作 | [预览](previews/pages/P06.png) |
| P07 | [沉淀范围与进度](https://www.figma.com/design/DctYxpkI7FMqVfhCJGC8qC?node-id=14-894) | 附件范围、处理中、失败重试 | 已写入；组图导出受套餐限制 |
| P08 | [候选定义审阅](https://www.figma.com/design/DctYxpkI7FMqVfhCJGC8qC?node-id=14-1006) | 逐项审阅、展开编辑与依据、来源变化 · 保存阻断 | [预览](previews/pages/P08.png) |
| P09 | [工作契约与版本管理](https://www.figma.com/design/DctYxpkI7FMqVfhCJGC8qC?node-id=14-1229) | 已确认契约、版本与管理、编辑工作分类、删除契约 | [预览](previews/pages/P09.png) |
| P10 | [从契约发起新工作](https://www.figma.com/design/DctYxpkI7FMqVfhCJGC8qC?node-id=14-1407) | 本次输入、必填缺失、工作已创建 | [预览](previews/pages/P10.png) |
| P11 | [执行者与接手状态](https://www.figma.com/design/DctYxpkI7FMqVfhCJGC8qC?node-id=14-1529) | 选择执行者、等待接手、交付失败、已接手 | 已写入；组图导出受套餐限制 |
| P12 | [固定资料与后续比较](https://www.figma.com/design/DctYxpkI7FMqVfhCJGC8qC?node-id=14-1648) | 资料缺失、持续比较 · 未开启、选择后续工作 | [预览](previews/pages/P12.png) |
| P13 | [服务与改进数据](https://www.figma.com/design/DctYxpkI7FMqVfhCJGC8qC?node-id=14-1751) | 服务设置、高级连接 · 失败、改进数据 | [预览](previews/pages/P13.png) |
| P14 | [反馈草稿与诊断](https://www.figma.com/design/DctYxpkI7FMqVfhCJGC8qC?node-id=14-1863) | 反馈编辑、诊断内容、放弃草稿确认 | 已写入；组图导出受套餐限制 |
| P15 | [我的反馈与处理进展](https://www.figma.com/design/DctYxpkI7FMqVfhCJGC8qC?node-id=14-1975) | 反馈列表、反馈已收到、离线等待、空反馈列表 | 已写入；组图导出受套餐限制 |

所有页面文字可编辑，结构使用 Auto Layout；按钮、输入框、多行输入、选择器、复选框、标签、列表、提示、审阅项及空状态复用文件内现有组件。品牌与顶栏 SVG、执行者图标、蜡印和纸张纹理来自项目已有素材。纹理及蜡印为图片，页面正文和操作保留独立节点。

## 与现状的差异及使用边界

- 统一为 400px 宽的审阅画板，长内容按内容增高；不表示客户端窗口将改成这些高度。弹窗按独立页面状态稿展示，未还原遮罩、叠层、拖动、滚动及键盘焦点。
- 使用 Noto Sans SC / Noto Serif SC 替代本机字体，沿用基础样板的辅助文字色。用户认可的是设计方向和迁移工作，尚未批准在运行时全局替换字体、颜色或控件。
- 基础 ListRow 的三行结构用于普通工作和沉淀任务，源界面的状态位置因此有所变化。审阅页用已有 ReviewItem 和明确的确认/删除按钮组成；真实界面的小图标操作、动效和来源细节仍以源码为准。
- 选择器与复选框是规范化组件；分类颜色在设计稿中用色值字段表达，运行时仍为原生颜色控件。契约保留纸色、分类白色衬线字、蜡印、确认信息与材质，但标签轮廓、局部渐变和纸张比例尚非逐像素还原。
- 页面使用虚构记录、地址和编号。状态稿选取关键分支，没有穷举全部输入类型、授权文案展开态、历史版本、上传失败、来源/文档修订和资料恢复等组合。上传范围与留存说明在真实实现中必须保留源码完整文案，不能用本稿的折叠态或摘录替代。
- 主导航保留工作流入口用于表达现有壳结构；没有绘制、修改或认可工作流内容页面。没有建立交互连线、Code Connect、发布共享库或自动双向同步。

## 验证记录

源码基线为 `9fc83b41d171cdc1925b1cb2357589017e356ffc`，在独立工作区构建，未改用户正在开发的工作流代码。

1. `npm run build` 通过。仓库 `scripts/qa-interface.mjs` 的原夹具缺少新接口 `onWorkflowDraftFlush`，首次启动失败；仅在临时副本补齐空事件处理后，通过 34 个合成界面状态、键盘导航、生命周期动作和错误分支检查。后台夹具也是本机临时数据，不是生产验收。
2. 补充夹具通过真实 renderer 挂载，取得契约、版本管理、本次输入、审阅、编辑全部、反馈、诊断共 7 张基线。后续反馈空列表导航未完成，不计入通过状态；不是契约端到端业务验收。代表截图位于 [baseline](previews/baseline/)。
3. Figma 写入返回 49 个页面节点，全部有逐页链接。已查看 10 组导出截图，修正列表重复标题、导航间距、批量操作位置及纸张/蜡印导入问题。P01、P07、P11、P14、P15 的最后一轮组图导出遇到 Starter MCP 上限；写入成功不等于这些组的全部状态已完成截图验收。P01 来源列表、P11 等待接手、P14 反馈编辑与 P15 反馈详情另通过浏览器查看。
4. 本批仅改变 Figma 与文档，未运行应用全量测试、未重新打包安装、未发布后台。

## 下一轮检查顺序

优先确认页面信息层级、状态与操作是否完整，再补轻量弹窗的真实叠层、来源/规范修订、截图附件预览和完整边界状态，最后决定哪些差异进入客户端。`inventory.md` 仍是完整状态目标，不能因为某个页面组已绘制便把整行状态标为全部完成。继续编辑时先读取 `pages-manifest.json` 中的现有节点并原位修改。
