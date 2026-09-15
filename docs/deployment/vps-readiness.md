# Worket VPS 历史基础条件检查

2026-09-15：用户确认原 VPS 已删除。本文仅保留 2026-09-10 22:23–22:26（Asia/Shanghai）的只读检查证据；旧地址、登录步骤与部署指引已移除。当前状态见 [退役记录](vps-operation.md)。

当时的资源余量、运行时与出站网络符合小规模 Node.js 单实例后台试用条件；这不是并发压测或正式上线验收。

| 项目 | 本次实测 |
| --- | --- |
| 登录 | `ubuntu`，SSH 22，当时使用本机密钥；免密 sudo 可用 |
| 系统 | Ubuntu 24.04.4 LTS，Linux x86_64 |
| CPU | 4 个 vCPU，AMD EPYC 7K62 虚拟机 |
| 内存 | 系统报告总计 3.6 GiB，已用约 641 MiB，可用约 3.0 GiB |
| Swap | 1.9 GiB，未使用 |
| 根磁盘 | ext4，总计 40 GiB，已用约 6.2 GiB，剩余约 32 GiB |
| 负载 | 1/5/15 分钟约 0.00 / 0.01 / 0.00；短时 vmstat 显示资源空闲 |
| Node.js | `/home/ubuntu/.local/node/bin/node`，v24.19.0 |
| npm | 同目录，11.17.0；非交互 SSH 的默认 PATH 不含该目录 |
| SQLite | Node.js `node:sqlite` 内存数据库读取成功，SQLite 3.53.3 |
| 时间 | NTP 已同步 |
| 出站 HTTPS | nodejs.org 返回 307，npm registry 返回 200，DeepSeek API 返回 401；TLS 校验均成功 |

DeepSeek 的 401 来自不带凭据的请求，当时只证明网络与 TLS 可达，不证明模型额度或调用成功。该检查未安装软件、部署 Worket 或改动服务器配置。
