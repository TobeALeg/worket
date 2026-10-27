# 执行者图标官方来源核对

核对日期：2026-10-27。范围：交接选择器的 10 个品牌图像（QwenWork 桌面和网页共享素材），以及通用网页图形与灰色网页角标。

品牌图像取自官网、官方商店或官方应用包原始资源。用户截图只用于辨认标志；没有从截图取图，也没有 AI 重画、额外补底或外套圆壳。原生圆形优先，其余按用户授权紧裁为圆形满版。

| 图像 | 官方依据 | 当前原图 | 核对结果 |
| --- | --- | --- | --- |
| ChatGPT（第一项，仍交接给 Codex） | [OpenAI 官方 App Store](https://apps.apple.com/us/app/chatgpt/id6448311069)，发布者 OpenAI OpCo, LLC | `chatgpt-official.jpg`，512px | 保留结绳图像，按固定坐标圆形紧裁 |
| WorkBuddy | [官网](https://www.workbuddy.ai/) favicon 直接引用的腾讯 CDN SVG | `workbuddy.svg`，矢量 | 重新下载哈希一致，原生圆形满版 |
| ZCode | [官网](https://zcode.z.ai/en)直接列出的 192px favicon | `zcode-official.png`，192px | 替换缺少直接来源记录的旧图，裁去透明外边及原图细边 |
| Antigravity | [Google 品牌资源页](https://antigravity.google/press)与[官方下载页](https://antigravity.google/download)；官方桌面应用包资源交叉核对 | `antigravity-app-official.png`，512px | 采用完整官方应用图像裁剪；版本 2.16.0、原始 icns 容器哈希和应用身份均登记，未给透明字形另外补底 |
| QwenWork 桌面 / 网页 | [官网](https://qwenwork.ai/)直接引用的阿里 CDN 图像 | `qwenwork.png`，192px | 官方页面引用确认，统一圆形紧裁 |
| Kimi | [官网](https://www.kimi.com/)的 apple-touch-icon | `kimi.png`，192px | 重新下载哈希一致，圆形紧裁 |
| 豆包 | [官网](https://www.doubao.com/chat/)直接引用的字节 CDN 192px 图像 | `doubao.png`，192px | 重新下载哈希一致，圆形满版 |
| DeepSeek | [官方 Google Play 页面](https://play.google.com/store/apps/details?id=com.deepseek.chat) og:image | `deepseek-app-source.png`，512px | 官方页面引用确认、下载哈希一致，圆形紧裁 |
| Gemini | [Google 官方商店页面](https://play.google.com/store/apps/details?id=com.google.android.apps.bard) og:image | `gemini-app-source.png`，512px | 官方页面引用确认、下载哈希一致，圆形紧裁 |
| 扣子 | [官网](https://www.coze.cn/)发布脚本直接引用的高清品牌资源 | `coze-official.png`，822×809px | 用高清原图替换 20px favicon，紧裁为圆形满版 |
| 其他网页 / 网页角标 | [Tabler 官方 world 图形](https://github.com/tabler/tabler-icons/blob/main/icons/outline/world.svg)，MIT | `browser.svg`；派生 `browser-circle.svg`、`web-badge.svg` | 非品牌入口，保留通用地球语义；网页角标灰色 #969c96、线宽 1.25 |

直接素材地址、原图哈希、核对日期及来源链见 [sources.json](../../../src/renderer/executor-logos/sources.json)。每张派生图的原文件、裁剪坐标和输出哈希见 [circle-crops.json](../../../src/renderer/executor-logos/circle-crops.json)。

[scripts/prepare-executor-circles.py](../../../scripts/prepare-executor-circles.py) 可复现圆形图像，检查原图最短边至少 96px、裁剪范围合法、输出无外部透明留边及内侧圆周无透明空隙。输出 PNG 为 256×256，透明仅用于圆周外部和抗锯齿。WorkBuddy 原生圆形 SVG 直接复用，通用地球 SVG 收紧到原生圆形外轮廓。

交接选择器保留圆形满版、Dock 联动、按钮释放和回收、14px 间距、隐藏滚动条、边缘自动滚动及灰色细线网页图标角标。素材核对不改变执行者 ID、交接目标或来源读取权限。
