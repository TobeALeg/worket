# 主线 Windows 适配回迁验收

日期：2026-10-11。基线：`main` 的 `847df15`（v0.1.8）。适配来源：`experiments/pi-bench-calibration-2026-09-13` 的 `621f12c`。仅回迁 Windows 平台层，不整体合并该实验分支，不合并 `codex/problem-reporting` 的功能。版本、领域模型、数据库结构和后台协议保持不变，本次没有发布 Release 或部署服务器。

## 迁移范围

- Win32 前台窗口身份/标题 Helper 与平台工厂；打包应用从外置 resources 运行助手。
- Codex Windows 绝对路径发现与 HOME 补全；保留主线新增的 macOS 现代/旧版 bundle 路径。
- WorkBuddy 客户端/扩展的同用户命名管道、Windows 文件 URL 与 Hook 路径引用。
- Windows 托盘、应用图标、任务栏工作区避让和 Windows 更新附件/手工安装文案。
- 本机平台启动/打包入口与 Windows ZIP + SHA256 发布脚本；仍只本地生成、不上传。
- Windows 测试可移植性：真实 Node stdio 替代 Unix 可执行脚本，目录 junction 替代需要特权的符号链接，外部桌面应用通过合成 source 隔离。冻结 request/response fixtures 使用 `.gitattributes` 禁止换行转换；证据内容与 Git 原始字节不变。

## 本地验证

环境：Windows x64；仓库路径含空格（`E:\AI infra\worket`）；Node 24.19.0、Electron 44.1.1、TypeScript 5.9.3；系统 .NET Framework 的 `csc.exe` 成功编译助手。没有降级依赖。Electron 下载使用镜像，SHA256 与 npm 锁定版本携带的官方 checksums 相符：`c574a22981889b74212c90a9391adcca116cd9d74e32b660ab21d0130ab50cc2`。

| 检查 | 结果与边界 |
| --- | --- |
| `npm test` | 全量 294 项通过，0 失败、0 跳过；包括新版历史分页、定义/资料安全、凭据/授权、Windows 通用窗口标题和本机 IPC |
| `npm run typecheck` | 通过 |
| `npm run package:win` | 生成 `release/Worket-win32-x64/Worket.exe`，图标、资源与 Win32 Helper 存在 |
| `npm run qa:package` | 真实打包应用通过：应用身份、双窗口、第二实例恢复、便利贴入口、面板布局、64 种角色/更新状态、状态轮询不重建角色、通知收束 |
| `node scripts/qa-updates.mjs` | 真实 Windows Electron + 本机合成 HTTP 验证菜单、下载授权、SHA256、复用已下载包和手工替换流程；原生对话框及资源管理器 reveal 被截获，不替换应用 |
| WorkBuddy 本机 IPC | 测试 fork 真实扩展 server，在隔离 home 下经 Windows 命名管道完成 status/list；扩展后面的 WorkBuddy 桌面 API 为合成响应，不等于真实 WorkBuddy 已验收 |
| Codex 实机只读检查 | 成功发现 `~/.codex/plugins/.plugin-appserver/codex.exe`；获取真实会话列表并完整读取一条历史，116 条可见事件、`history.complete=true`；未发送消息或修改执行者配置 |
| Win32 Helper | 实机可返回前台进程身份/标题元数据；不读取屏幕内容，未据此声称真实 Codex 前台会话匹配已完整验收 |
| 安装包隔离 | 检查 asar 清单，研究/实验、测试/评测、输出、本地数据库/密钥、服务端以及仓库根目录实验 ZIP 不在安装包内 |

基础桌面截图保存在本机忽略目录 `output/playwright/01-pet.png` 与 `02-panel-empty.png`。所有桌面 QA 使用临时数据库、`WORKPET_SKIP_INTEGRATIONS=1` 和 `--dev`，不安装用户接入配置、不触发生产更新、不上传真实工作内容。真实 Codex 检查仅在内存读取历史。

## 未验收与不在本轮范围

- 当前 macOS 构建/签名/桌面回归：本机为 Windows，无法运行 Cocoa 编译和 macOS 应用；源码保留 macOS 分支，不能以 Windows 测试代替本轮 macOS 实机验收。
- WorkBuddy Windows 真实扩展权限、Hook/MCP、Deep Link 和双向交接完整闭环；没有向当前账号提交测试任务。
- 混合 DPI、多屏、任务栏不同位置、透明窗口命中、休眠恢复、DPAPI 跨进程重启读取。
- ZCode / Antigravity Windows 安装发现与原生应用启动仍未接入；Windows 调用其启动会明确报错，不能宣称四个执行者功能等价。
- 部分历史专项桌面 QA 仍有 macOS 路径或 Unix 环境变量语法，暂未全部迁移。双平台发布、代码签名、生产升级和跨设备数据库/资料同步需要另行授权与验证。

本次完成的是“当前 main 的 Windows 基础支持”，不是“正式发布 Windows v0.1.8”或“所有执行者跨系统全流程验收”。
