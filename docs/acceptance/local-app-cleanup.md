# 本机 Worket 版本清理验收

2026-10-08：用户要求清理早期和多余 Worket，只保留一个开发版和一个正式版。

## 保留入口

| 用途 | 路径 | 核实结果 |
| --- | --- | --- |
| 正式版 | `/Applications/Worket.app` | v0.1.8，已普通启动，实际进程来自该路径 |
| 开发版 | `/Users/dandi/YanGuan/release/Worket-darwin-arm64/Worket.app` | v0.1.8，通过项目 `scripts/run-latest.command` 或 `npm run dev` 重建并以 `--dev` 启动 |

两个应用均通过 `codesign --verify --deep --strict`。保留时 ASAR 的 SHA-256 均为 `6e478989affb26c394a6640fa2a6bac3978d6dc952c83a198186a096a4b77a5f`；当前源码的 `src/` 与 `package.json` 对 v0.1.8 标签无差异，本次不重新构建或发布。

## 清理范围与恢复

移走 17 个旧应用副本、41 个重复 ZIP 安装包及 16 个校验文件，共 74 项，约 10 GiB。包含早期 WorkPet、v0.1.0 beta 至 v0.1.7、临时迭代包、验收解压副本和安装备份；重复的 v0.1.8 ZIP 也移走。旧打包目录的许可证等附件一并整理，空的早期验收目录移除。

全部移至 `/Users/dandi/.Trash/Worket-旧版本-20261008/`，没有清空废纸篓，因此尚未释放这些项目占用的磁盘空间。该目录保留原路径层级及 `原路径清单.json`，需要恢复时可移回原位置。源码、Git 工作树、研究实验包、历史验收报告和 SQLite 备份保留。

移走应用前撤销其 macOS Launch Services 登记；随后额外撤销 47 条指向已不存在路径的过期登记，包括临时解压应用和旧 Helper。最终 Worket 应用登记只剩正式版与项目开发版两个路径。扫描系统/用户 Applications、桌面、下载、文稿、项目及临时目录，没有发现额外可用应用；用户目录额外扫描也未发现其他安装副本。

## 运行和数据验证

清理前运行的是 `output/app-backups/codex-update-20260930/Worket.app`，实际版本为 v0.1.7。退出该进程后启动 `/Applications/Worket.app`；进程和已打开数据库文件证明正式版沿用原 `~/Library/Application Support/WorkPet/workpet.sqlite`。

清理前后 SQLite `quick_check=ok`；所有业务表按 `rowid` 排序的完整行摘要均一致，其中 6 项工作、6 条工作记录、1,714 条来源事件、1 份工作定义均保留。没有修改设置、凭据或原工作库，也没有后台变更。

本次验收针对本地文件清理、应用签名、运行路径、系统登记和数据完整性，不运行与该操作无关的代码回归。
