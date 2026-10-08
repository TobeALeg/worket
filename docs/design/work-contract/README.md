# Worket 工作契约 · 标准设计组件 v1.1

2026-10-08。用户认可竖版融合方向：自然档案的纸页与顶部版本页签，结合凭证式底部确认区；移除左侧 Worket 品牌竖栏，页签颜色允许用户自定义。

本目录是可运行、可复用的设计交付，尚未接入已安装 Worket。内容为演示数据；“已确认”用于展示已被用户确认保存的定义版本，不表示它已经过多次复用验证。

## 交付格式

| 文件 | 职责 |
| --- | --- |
| `tokens.css` | 颜色、字体、间距、圆角、阴影等设计变量 |
| `contract.css` | 纸页、版本页签、条款、确认区、按钮与响应式样式 |
| `paper-grain.svg` | 本地矢量纸纹；图标与确认印记的 SVG 在组件内 |
| `contract.js` | 用原生 DOM 渲染数据、切换页签颜色、向宿主回调操作 |
| `contract.d.ts` | TypeScript 数据与回调接口 |
| `index.html`、`preview.css`、`preview.js` | 独立预览与调色工具，接入时无需带入 |

核心是 HTML + CSS；SVG 负责图标和纸纹，少量 JavaScript 负责内容和交互。没有框架或网络依赖，可直接适配当前 Worket 的原生 TypeScript renderer。PNG 仅适合作为效果参考，不能承担真实文字、动态条款和自定义颜色。

从项目根目录启动：

```sh
python3 -m http.server 8770 --bind 127.0.0.1 --directory docs/design/work-contract
```

访问 `http://127.0.0.1:8770/`。ES Module 通过 HTTP 加载，不直接双击 HTML。

## 视觉规则

- 竖版单列，建议宽度 400–420px，可用范围 320–520px；高度随条款增长，不锁定固定纸张比例，不省略长标题或约束。
- 层级依次为版本页签、契约名称与目的、有效条款、确认区、操作。没有左侧品牌栏。
- 暖白纸页 `#faf8f1`，森林绿正文与主操作 `#38634b`，浅鼠尾草确认区 `#e2e8d8`，麦金分隔线与印记；只有顶部页签使用分类色。
- 标题优先使用系统宋体 `Songti SC`，正文用系统无衬线体。其他平台使用声明的字体回退，字形和换行可能略有差异；不捆绑商业字体。
- 纸纹是固定 192px 平铺的双层 SVG 噪声：细颗粒加短纤维。纸页低强度叠加，底板保留较明显的纤维；由 `--wc-grain-opacity` 与 `--wc-grain-size` 控制。纹理尺寸不随卡片宽高缩放，不使用整张底板或 `background-size: cover`。
- 立体感来自独立的底板、纸页边缘、底部多层纸厚、接触阴影与扩散阴影。页签、确认印记和按钮各有边缘高光；金色印记有浅压印。阴影、齿线和缺口随 DOM 延伸，长内容仍可自然撑高。宿主背景可用 `--wc-canvas` 对齐。
- 空条款分区不渲染；长条款完整换行。确认日期来自数据，不能取渲染时的当前时间。
- 接入回调才显示相应操作按钮。确认状态由文字“已确认”表达；分类也需保留文字名称，不能只依赖颜色。

## 自定义颜色

默认提供鼠尾草 `#60765f`、麦金 `#92743c`、陶土 `#946752`、雾蓝 `#5f7989`。预览支持原生取色器与六位 HEX 输入，刷新后恢复预览所选颜色，并可导出 CSS。

通过公共函数设置颜色，它会依据 sRGB 相对亮度选择黑色或白色页签文字：

```js
setTabColor(card, '#92743c');
```

或者使用导出的变量：

```css
.wc-contract {
  --wc-tab-color: #92743c;
  --wc-tab-ink: #000000;
}
```

组件创建时会设置行内颜色变量；动态实例优先传入 `color` 或调用 `setTabColor`。导出 CSS 可作为设计 token 参考，或用于没有行内覆盖的静态 DOM。不要只改背景色而遗忘文字对比度。半透明、渐变和非六位 HEX 输入不在 v1 接口内。

颜色是展示偏好。未来按工作类型或项目保存时，由宿主维护颜色映射；组件不写数据库，也不因换色产生 WorkDefinition 新版本。当前仅预览页使用独立 localStorage 键，正式应用的分类模型与偏好存储尚未实现。

## 使用接口

页面加载 `contract.css`，然后创建组件：

```js
import { createWorkContract, setTabColor } from './contract.js';

const card = createWorkContract({
  id: 'WC–024',
  title: '客户方案设计',
  version: 'v1.0',
  purpose: '将客户需求转化为可评审、可执行的方案。',
  confirmedAt: '2026-10-08T08:22:00+08:00',
  color: '#60765f',
  categoryLabel: '客户方案',
  sections: [
    { kind: 'inputs', label: '输入', items: ['需求简报', '访谈记录'] },
    { kind: 'deliverables', label: '交付', items: ['方案文档', '实施路线'] },
    { kind: 'constraints', label: '约束', items: ['先确认范围，再展开设计'] },
    { kind: 'acceptance', label: '验收', items: ['范围与交付一一对应'] },
  ],
}, {
  onReuse: ({ id, version }) => openNewWork(id, version),
  onDetails: ({ id, version }) => openDefinitionDetails(id, version),
});

document.querySelector('#contract-host').replaceChildren(card);
```

`openNewWork`、`openDefinitionDetails` 是宿主提供的函数。回调只通知操作，不直接创建实例。`id`、`version` 为传入值，示例编号不能用作真实数据库标识；宿主可以通过闭包保留真实 Definition 身份。样式类统一使用 `wc-` 前缀，预览控制台有独立样式，不应复制进产品流。

## 接入 Worket 时的数据边界

确认保存成功后读取真实 `Definition`，映射为 `ContractView`；候选生成完成不是显示此确认凭证的触发点。名称取 `content.name`，版本由宿主格式化，日期取 `confirmedAt`。先沿用 `effectiveRules(content)` 与 `ruleText(item)` 投影有效条款，再传入组件，不能直接展示被取代或未确认的规则。

现有定义字段含 `purpose`、`inputs`、`deliverables`、`constraints`、`acceptanceCriteria`、`methods`、`materialRoles`；示例里的“上下文”是视觉演示，当前没有对应独立字段，接入时必须有明确真实来源，否则省略。分类文字目前作为页签提示和辅助技术文本保留，正式类型/项目选择入口仍需由宿主呈现。

本次未修改 `src/`、数据库、发布流程或已安装应用。后续集成需要验证真实定义投影、发布后的展示时机、复用入口和偏好保存，并按项目约定完成本地应用构建安装。

## 本次验证

在本机 Chromium 预览中检查标准内容、320px 长标题及多条约束、400px 精简条目；长内容无横向溢出或裁切。验证浅黄/深绿自定义色、自动黑白文字、刷新保留、无效 HEX 提示、CSS 文件下载，以及新工作回调和详情弹窗。预览的新工作操作只显示回调结果，不创建实际工作。

样式通过真实 DOM 渲染核对，未将概念 PNG 作为界面。打印规则仅做基础处理，尚未验证分页；不宣称已完成 PDF 输出或原生客户端验收。

v1.1 根据用户指出的纸质感、立体感不足重新制作材质层，增强标题字重、图标旁压线与纸边层次。再次检查 320px 长内容及陶土分类色：无内部横向溢出或文字裁切，纹理保持 192px 原尺寸平铺。视觉接近程度仍由用户评审，不将浏览器渲染通过视为设计认可。
