# 面板精简与返回导航验收（2026-09-23）

用户确认本批修改完成后更新并重启本机 Worket。

## 已安装行为

- 点击沉淀直接开始后台处理，沿用已保存的改进偏好；生成后仍审阅候选。
- 最近活动移除常驻长说明，历史聊天使用 history 图标。
- 工作详情移除“交接时自动准备工作状态”，次级操作使用三个点，执行者与返回列表同一行右对齐。
- 全局应用菜单使用三道横线。“改进数据 → Worket 服务 → 原工作面板”通过左上角箭头逐级返回，Esc 使用相同路径。

## 验证

`npm run build` 通过。`scripts/qa-interface.mjs` 通过 34 个合成界面状态，覆盖返回按钮、Esc、焦点恢复、窄窗口与既有操作；新导航未影响其他弹层关闭行为。

对打包应用运行 `qa-electron.mjs` 与 `qa-distillation.mjs`，均通过。后者以临时工作库和合成服务验证设置逐级返回、持久偏好、点击直接沉淀、运行中快照复用、候选审阅保存、复用及进程恢复；不是实际模型质量或外部执行者验收。

原生已安装应用中实际打开三线菜单、Worket 服务和改进数据，再连续点击返回箭头，确认回到原面板。实际工作详情确认执行者右对齐、工作菜单保持三点、后台准备占位说明消失。界面截图保存在本地忽略目录 `output/playwright/menu-navigation-live/`。

## 安装与数据

从提交 `b2bcba74294305fbde56ad52fba601f9d73f1d83` 的 Git archive 独立构建，未纳入工作区未跟踪文件。222 个编译输出逐一比对打包资源一致，临时签名严格校验通过。

已替换 `/Applications/Worket.app` 并重启。实际运行路径为 `/Applications/Worket.app/Contents/MacOS/Worket`，核验时 PID 为 46169。安装与打包 ASAR SHA-256 均为：

`a962c0b58a7514797149f57061130fd6a3a1543abdaea569f82495496d646ee5`

更新前后均为 4 项工作、1,573 条来源事件，数据库 `quick_check=ok`。旧应用与 SQLite 一致备份位于 `output/app-backups/menu-navigation-20260923-172957/`。安装元数据见本地 `output/worket-latest-install.json`。

此次仅更新本机应用，未部署生产后台，未触发真实记录的沉淀或交接。
