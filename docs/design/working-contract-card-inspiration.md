# 工作契约成就 UI：卡牌游戏视觉参考

核实日期：2026-09-29。状态：素材研究与设计建议，用户尚未确认新方案。

## 用户要求

在工作流程沉淀为通用 working contract 时，出现精致、可爱且正式的 UI，并与 Worket 搭配。此前 A 的部分视觉风格获得偏好，但后续深绿金色大浮层被否定；不能将该浮层视为已确认方案。用户本轮要求先找卡牌游戏素材作为灵感。

## Worket 当前视觉依据

已读取 [theme.css](../../src/renderer/theme.css)、[pet-visual.ts](../../src/renderer/pet-visual.ts)，并查看 [清醒角色图集](../../src/renderer/pet-assets/clay-poses-awake-v3.png)。当前主题背景为 `#fbfaf7`，浅色面为 `#f0f2eb`，强调绿为 `#38634b`，品牌小标使用 `#dfca8d`；桌宠为暖黄色圆润拟物角色，配小芽与白色便签。新 UI 应延续这些形状、颜色与材质关系。真实接入时复用现有角色素材，保持其像素与比例，不重新生成角色。

## 1. Wildfrost：圆润轮廓、角色插画与卡面分区

官方依据：[官网素材包](https://www.wildfrostgame.com/presskit/)、[开发者 Steam 页面](https://store.steampowered.com/app/1811990/Wildfrost/)。官方提供游戏截图和角色卡牌资料。

![Wildfrost 官方商店截图](https://shared.steamstatic.com/store_item_assets/steam/apps/1811990/ss_d9f7f1d4fc074ac1db54295677f415010d12bbed.1920x1080.jpg?t=1730826839)

助手的设计解读：大块角色插画、圆润边界、独立标题和说明区，让卡牌有性格，也能承载规则。适合借鉴柔和轮廓与图文比例；Worket 可用既有桌宠和原创工作类别图案形成主视觉，减少小字对成就感的挤压。冷蓝战场、高饱和战斗数值不作为本轮取样重点。

## 2. Everdell：温暖童话与有秩序的规则排版

官方依据：[Dire Wolf Digital 产品页](https://www.direwolfdigital.com/everdell/)。该游戏结合动物角色、建筑卡与策略卡牌玩法，官方页面提供数字版截图。

![Everdell 官方截图](https://d19y2ttatozxjp.cloudfront.net/assets/everdell/LEAF_Screenshots_1920x1080px_17.jpg)

助手的设计解读：自然色、插画、细边框、标题区与规则区可以同时带来亲切感和可信的规则感。Worket 可保留奶油白底与鼠尾草绿，用少量暖金细节强调确认状态；标题、版本与条款排版承担正式感。复杂森林场景与繁密资源图标不必迁入工作界面。

## 3. Potionomics：给抽象方法赋予可识别的画面

官方依据：[发行商页面](https://marvelous-usa.com/games/potionomics/)、[Nintendo 官方截图](https://www.nintendo.com/us/store/products/potionomics-masterwork-edition-switch/)。发行商明确将销售策略表达为谈判使用的卡牌。

![Potionomics 官方商店截图](https://assets.nintendo.com/image/upload/ar_16%3A9%2Cb_auto%3Aborder%2Cc_lpad/b_white/f_auto/q_auto/dpr_1.5/store/software/switch/70010000073837/3e13f2160a2143eb834d983e32567b5339bb8b36c4300f4184a2d86c45f7ca5b)

助手的设计解读：卡面插画帮助区分不同方法，而标题和说明保留实际作用。Worket 可用独立的小场景表达“网页制作”“研究报告”“视频制作”等契约类型，并保持统一排版，使工作契约具有识别度。此建议尚未形成分类模型或自动插画功能。

## 建议用于下一版的组合

以 Wildfrost 的圆润形状与插画占比为形态参考，用 Everdell 的自然配色和有秩序的文字结构保持正式感，借 Potionomics 的方式让每类工作有可识别的主视觉。具体颜色、桌宠形象与基础控件仍来自 Worket。

成就展示可先突出契约名称、图案、版本和一个主要动作；输入、交付、验收的完整内容通过详情展开。布局比例、材质强度、动效与展示位置留待下一版原型验证。本轮不生成新定稿，不修改应用。外部素材仅记录来源和设计参考，未纳入产品资源。
