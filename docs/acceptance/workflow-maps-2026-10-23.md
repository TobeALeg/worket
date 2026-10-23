# 工作流定义与运行地图验收

日期：2026-10-23。用户明确范围为只重做定义地图、运行地图；工作库、编辑器与运行列表不改版。设计来源为 Figma 文件 `DctYxpkI7FMqVfhCJGC8qC` 的 `148:3689` / `148:3899`，线性参考为 `142:2525` / `142:2526`；保持既有业务接口与数据。真实数据按依赖自动布局，不把示例的固定节点和像素坐标写入业务模型。

验收使用真实 Electron、IPC、SQLite 和工作流状态，任务内容及执行者读取回执为合成数据，没有发送真实任务或调用模型服务。

- `npm test`：360 项通过，含类型/构建；新增两项回归覆盖分支汇合、输出身份、提交和验收区别、采用旧轮输入及活动依赖。
- `node scripts/qa-workflow-maps.mjs`：七节点八依赖、定义/运行同坐标、部分输入就绪、十步折返、长标题/输入输出、208/184 几何、端口实际行中心、缩放、410×660 窄窗、详情收起焦点、暂停与减少动态效果。按 Figma 3.2 秒时间轴核对流动前段/中段/静止段。
- `node scripts/qa-workflows.mjs`：流程创建、两次运行、真实文件快照、退回复验、并行汇合、MCP 提交、三步采用新版及重启保留轮次；外部启动及历史读取受控。
- `node scripts/qa-workflow-workspace.mjs`：草稿暂存与冲突、延迟响应隔离、逐运行节点记忆、验收修订冲突、重复提交、集中验收与分页筛选；导航适配新的地图入口。

视觉参考截图随验收保存在本机 `output/workflow-maps/`；页面样图见 [定义地图](../design/worket-ui/previews/workflow-map-definition.png)、[运行地图](../design/worket-ui/previews/workflow-map-runtime.png)。核对卡片、各输入输出底板及本地 Tabler 图标，不使用整页截图作为界面资产。字体沿用系统中文回退，Figma 的 Noto Sans SC 未引入全局字体依赖；真实任意拓扑由布局算法组织，不声称逐像素复制示例坐标。

源码验证：以上三项 Electron 验收均通过，rendererErrors 为空；地图专项在 `output/workflow-maps/2026-10-23T04-40-24-310Z/`，工作流闭环在 `output/workflows/`，工作空间在 `output/workflow-workspace/2026-10-23T04-38-18-285Z/`。安装与 GitHub 交付结果在完成后补充。上述合成验收不代表真实外部执行者完成业务任务，也不代表用户已验收视觉效果。
