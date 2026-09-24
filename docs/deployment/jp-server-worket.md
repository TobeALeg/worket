# Worket jp-server 运维记录

日期：2026-09-18。目标主机：`jp-server`（Ubuntu 24.04 x86_64）。公网入口：`https://worket.dandi.site`。

## 当前状态

- v0.1.6 客户端已于 2026-09-24 正式发布并更新本机，配套后台已同步。沉淀过滤能力 `analysisSchemaVersions:[1]` 与自动准备能力 `continuationSchemaVersions:[1]` 均启用；详见 [发布验收](../releases/v0.1.6-verification.md)。
- Worket 服务代码来自提交 `71a4f94`（2026-09-24 更新），版本目录为 `/opt/worket/releases/71a4f94`，`/opt/worket/current` 指向当前版本。
- Docker 容器名为 `worket`，以 `1000:1000` 用户运行（与数据目录属主一致），运行官方 `node:24-bookworm-slim`，设置 `restart=unless-stopped`、只读根文件系统、无额外 Linux capabilities、`no-new-privileges`。
- 服务使用 host network，但 `server/start.mjs` 只监听 `127.0.0.1:18788`；公网不能直接访问该端口。
- `/opt/worket/current` 只读挂载到容器 `/app`；持久数据保存在 `/opt/worket/data`，挂载到 `/data`。
- Nginx 站点配置位于 `/etc/nginx/sites-available/worket.dandi.site`；仅代理 `/health` 与 `/v1/`，其余路径返回 404。`/v1/` 覆盖 `X-Worket-Client-IP` 为真实来源地址，服务只信任本机反向代理。
- Let's Encrypt 证书位于 `/etc/letsencrypt/live/worket.dandi.site/`，到期日为 2026-12-17，使用系统 certbot timer 自动续期。
- 自动用户接入已开启。正式版生成匿名用户恢复码与独立设备秘密，服务器只保存哈希；令牌以设备认证，以用户归属额度、请求和明确授权的上传。

当前公网 `/health` 返回 `{"ok":true,"configured":true}`。模型供应商已经由管理员配置；供应商 Key 仍只保存在加密服务器配置中。

## 已验证

- `https://worket.dandi.site/health` 返回 HTTP 200。
- `https://worket.dandi.site/v1/capabilities` 未带令牌返回 HTTP 401。
- `https://worket.dandi.site/admin/` 返回 HTTP 404；管理页没有通过公网代理暴露。
- TLS 证书 CN/SAN 为 `worket.dandi.site`。
- 容器重启后恢复健康，加密主密钥哈希保持不变，证明 `/opt/worket/data` 持久化生效。
- v0.1.4 启动时把后台设置迁移到 schema v2；正式桌面自动创建 1 个匿名用户与 1 台设备，桌面连接检查通过。
- 升级前备份 `/opt/worket/backups/data-pre-v014-20260918.tgz` 权限为 `0600 root:root`；恢复演练尚未执行。
- 现有 `llmwiki.dandi.site` 容器和 Nginx 路由保持运行，本次未修改其应用容器。

## 管理入口

在本机建立 SSH 隧道：

```sh
ssh -N -L 8789:127.0.0.1:18788 jp-server
```

然后打开 `http://127.0.0.1:8789/admin/`。模型供应商、额度和对外地址由这里维护；“Worket 接入”用于查看和撤销自动接入设备，仍可按需签发手工凭据。供应商 Key、管理员密码、桌面令牌和用户恢复码不得写入 Git 或本文。

## 常用检查

```sh
ssh jp-server 'sudo docker ps --filter name=^/worket$'
ssh jp-server 'sudo docker logs --tail 100 worket'
ssh jp-server 'curl -fsS http://127.0.0.1:18788/health'
ssh jp-server 'sudo nginx -t'
```

更新时先把新代码放入新的提交目录，完成本机检查后再原子更新 `/opt/worket/current` 并重建容器。不要覆盖 `/opt/worket/data`。回滚时把 `current` 指回上一个完整版本并重建容器；数据库结构若已迁移，需先确认兼容性和备份，不能只回退代码。

## 未完成验收

- 真实工作模型候选已于本轮验证；用户确认、发布定义和复用闭环仍待用户执行。
- 使用真实第二台设备执行恢复码恢复；自动化测试已覆盖相同协议。
- `/opt/worket/data` 的异机加密备份和恢复演练。

## 2026-09-18 后台沉淀修复部署

服务已切换到 `50cd337`，提示词版本为 `work-definition-v1.4`，包括默认中文、汇总阶段的原始事件类型、来源误标降级并要求确认、真实批次进度。公网 HTTPS 健康检查通过。本地 release 应用和 `/Applications/Worket.app` 已更新为同一源码构建；不是 GitHub 新版本发布。

旧版本目录 `78d09d4809371798b66221c4181387b27bd392f8` 与停止的 `worket-before-50cd337` 容器保留。部署中曾因未保留容器用户而触发 `/data` chmod EPERM，健康检查自动回滚；最终保留 `1000:1000` 后成功，未改变数据权限。重建时须保留 User、挂载、环境和安全设置，不能只复制镜像和启动命令。此轮不含数据库迁移。

真实客户端验证：重试此前失败的同一已授权快照，4 批提取加 1 次汇总，228 秒进入 `AWAITING_REVIEW`。本地保存 33 条候选（33 条文本均含中文），提示词版本 v1.4；4 个非阻塞待确认提示，0 个阻塞问题。候选留给用户审阅，未自动发布。本地包已通过打包态流程验证，正常启动时保留未读完成提醒。

## 2026-09-22 规则协调部署

`813a758` 新客户端以 `ruleSchemaVersion:1` 启用 `work-definition-v2.0`。旧请求保持 v1.4 提示；能力接口增加 `ruleSchemaVersions:[1]`。新客户端连接旧后台会在提交前拒绝，不静默把不支持的协议当作成功。

从已提交源码构建精简后台包，SHA256 为 `e74664bd85f0f6b57a05a2405b87f4293b277c94b9e8fb5eff1858226294532e`。部署前确认过去 10 分钟无 RUNNING/SUCCEEDED 待处理请求，并先用无网络临时容器校验新模块可加载。停机后备份数据到 `/opt/worket/backups/data-pre-813a758-20260922-150144.tgz`，权限由 root 的 0077 umask 限制；保留旧容器 `worket-before-813a758-20260922-150144` 与 `/opt/worket/releases/50cd337`。

新容器复制并复核原 User、Env、WorkingDir、Cmd、Entrypoint、Binds、只读根文件系统、capabilities、SecurityOpt、NetworkMode 与 RestartPolicy。健康检查失败时脚本会恢复旧 symlink 与旧容器；本次健康成功，没有执行回滚。不修改 Nginx、模型配置或密钥。

验证：本机 Node fetch 与服务器访问 `https://worket.dandi.site/health` 均为 200；服务器内使用现有主体的一分钟临时签名认证，公网 capabilities 为 200 并返回 `[1]`，无认证为 401，`/admin/` 为 404。令牌和私钥始终留在服务器，没有写日志或改账号。没有另行消耗模型调用重跑生产请求；模型/桌面链路在相同实现的隔离服务中验证，见 [系统验收](../acceptance/working-contract-v2.md)。

本地试用包为 `release/Worket-contract-v2-813a758.zip`，打包态完整流程已回放通过；未发布新 GitHub Release，用户已安装应用保持原样。

## 2026-09-23 首批持续优化部署

`858c677` 更新规则解析：替代重复组的任一别名作用于整组，竞争替代阻断，旧重复证据不转归新义务。后台协议与提示词版本保持，客户端另含关联规则再审。包 SHA-256 为 `252dc6988c715197fc96836f33c60988c25f72487c61918ed24be7009b419012`。

部署前检查无活跃/待领取请求，离线容器模块导入成功；保留所有原容器配置并备份数据。前版 `/opt/worket/releases/813a758`，回滚容器 `worket-before-858c677-20260922-172802`，数据备份 `/opt/worket/backups/data-pre-858c677-20260922-172802.tgz`。没有数据库迁移。

公网 HTTPS health 200 且 configured=true，未授权 capabilities 401，admin 404。实际运行 rules.js 的 SHA-256 `fbdb121592f4471323923c736615f82db725b9ae2a383a6cc41b85bf8c095934` 与已提交源码 server 构建一致。未额外运行真实模型任务；功能与打包态端到端证据见 [优化检查点](../acceptance/worket-improvement-loop.md)。

## 2026-09-23 增量比较部署

`5e1800e` 增加 `evolutionSchemaVersions:[1]`，使用 `work-definition-evolution-v1.0` 处理基准约定与后续交互的明确差异。旧请求保持原流程。后台包 SHA-256 `9219b466f86ac3072167b0d73db4a128722f9845555a4c76866cd39b630ec9e6`。

部署前无活跃/待领取请求，离线模块加载通过。前版 `/opt/worket/releases/858c677`；回滚容器 `worket-before-5e1800e-20260922-181226`；数据备份 `/opt/worket/backups/data-pre-5e1800e-20260922-181226.tgz`。保留全部容器配置，无数据库迁移或模型密钥变更。

公网 HTTPS health 200，未授权 capabilities 401，admin 404；服务器内生成一分钟临时只读检查令牌，认证能力接口 200，rule/evolution schema 均为 1。未输出令牌或密钥、未修改账户数据。四次真实模型调用发生在隔离 HTTP/桌面验收链路；部署后只做健康/能力检查，没有重复执行供应商调用。客户端 ZIP 解压态回放亦通过，见 [检查点](../acceptance/worket-improvement-loop.md)。

## 2026-09-23 来源角色与覆盖提示部署

`46b2c1a` 增加 `evidenceSchemaVersions:[1]`；声明新能力的请求区分直接依据与 CONTEXT 背景引用。协调提示 v2.2、增量提示 v1.2；旧请求保持兼容。后台包 SHA-256 `f55c02d41d251540a700a4880d0037e8af23f98e755e2e6cc9ce1d6a4c44c11f`。

部署前无活跃/待领取请求，离线模块导入通过。前版 `/opt/worket/releases/5e1800e`，回滚容器 `worket-before-46b2c1a-20260922-192542`，数据备份 `/opt/worket/backups/data-pre-46b2c1a-20260922-192542.tgz`。原容器配置逐项复核不变，无数据库迁移或凭据变更。

公网 health 200 且 configured=true，匿名 capabilities 401，admin 404；服务器内一分钟签名检查返回认证 200，rule/evolution/evidence schema 均为 1。凭据未离开服务器或写入日志；部署后没有重复模型调用。解压客户端三类完整语义回放通过，见 [语义验收](../acceptance/contract-semantic-trials.md)。

## 2026-09-23 技能协议与输入角色部署

源码 `58be614` 增加 skillSchemaVersions:[1]。新协调/增量技能请求使用 v2.6/v1.6；明确通用输入角色不承载旧值、提炼元指令不混入执行约束。仅规则请求 v2.4，规则加背景引用 v2.5；对应增量 v1.4/v1.5，旧无规则请求保持原提示。后台包包含新引用的 skill-materials.js，SHA-256 `86f18606aff40228ae47b5f501950f20c53c6e31e96996611b54dec8816d001c`。

无活跃/待领取请求后完成离线模块校验、备份、切换并复核原容器配置。前版 `/opt/worket/releases/46b2c1a`，回滚容器 `worket-before-58be614-20260922-200115`，备份 `/opt/worket/backups/data-pre-58be614-20260922-200115.tgz`。没有数据库迁移或模型/密钥配置变更。

公网 health 200，未认证 capabilities 401，admin 404；服务器内一分钟临时认证检查 200，rule/evolution/evidence/skill schema 均为 1。凭据未输出或离开服务器，未写账户数据。模型调用发生于隔离语义试验，部署后没有重复调用。详情见 [技能验收](../acceptance/skill-dependencies.md)。

## 2026-09-23 记录样本有效视图部署

源码 `5eecf20`，记录上传 v2 / RECORDING_VIEW，能力 improvement.recordingViewSchemaVersions:[1]；兼容旧 v1 数据，缺少来源视图时明确有效性未知。独立 server 构建包含 recording-view.js，后台包 SHA-256 `9ae04ea7207f1297a777e9514c8ee9ff7c415c24c1aa78f225fc06e407c7ed79`。

部署前无活跃/待领取请求，模块离线导入通过。前版 `/opt/worket/releases/58be614`，回滚容器 `worket-before-5eecf20-20260922-215249`，数据备份 `/opt/worket/backups/data-pre-5eecf20-20260922-215249.tgz`。配置逐项复核不变，无数据库迁移或密钥更新。初次普通 SSH 用户直接访问 Docker 被权限拒绝，改用既有 sudo 运维权限完成。

公网 health 200 且 configured=true，匿名 capabilities 401、admin 404；服务器内短期令牌只读认证能力 200，新能力 schema 1，令牌没有输出或离开服务器。recording-view.js、improvement.mjs、admin.js 运行 hash 与干净构建一致。没有生产样本写入或新增模型调用。详见 [样本视图验收](../acceptance/recording-sample-view.md)。

## 2026-09-23 长记录增量视图与字节预算部署

源码 `44dd3ba`，上传 schema v3 / recordingViewSchemaVersions:[1,2]，兼容旧 v1/v2。后台包 SHA-256 `d0f9bb2ea647c91ba0fcb6783bd37115956befedf99d0bc1853f02bb8bb36884`。增加可重算 sample_usage 字节计数，旧样本新写时惰性初始化，未重写旧事件；记录样本 10,000 事件和 20 MiB 双预算，其他范围保持旧限额。

前版 `/opt/worket/releases/5eecf20`；回滚容器 `worket-before-44dd3ba-20260922-220937`；数据备份 `/opt/worket/backups/data-pre-44dd3ba-20260922-220937.tgz`。部署前无活跃/待领取请求，离线导入与健康检查通过，原容器配置逐项一致，无密钥变更。

公网 health 200，匿名 capabilities 401、admin 404；服务器内部临时令牌核验新能力 2，凭据未输出/出机。recording-view.js、contracts/improvement.js、server/improvement.mjs、admin.js hash 与干净构建一致。无生产样本写入或新模型调用。解压客户端 550 次真实来源刷新验收见 [长记录结果](../acceptance/recording-sample-scale.md)。

## 2026-09-23 义务变化与通用覆盖提示部署

源码 `b4702a0`，演进提示 v1.7，旧能力路径 v1.5.1/v1.4.1；区分通用覆盖与真正条件，范围一致性校验不放宽。后台包 SHA-256 `63a93a661090c6bbdea6d48e42eb4e0b620a0c0c565358d30661c8f1848924ec`。客户端沿用 db8dfa2，本轮没有桌面运行时变更。

前版 `/opt/worket/releases/44dd3ba`；回滚容器 `worket-before-b4702a0-20260922-232351`；数据备份 `/opt/worket/backups/data-pre-b4702a0-20260922-232351.tgz`。部署前无活跃/待领取请求，离线导入和健康检查通过；原容器配置逐项保持，无数据库迁移或凭据变更。

公网 health 200 且 configured=true，匿名 capabilities 401、admin 404；服务器内短期令牌检查认证能力 200，rule/evolution/evidence/skill 均为 [1]、recordingView 为 [1,2]。evolution-prompt.mjs、workflow.mjs、contracts/evolution.js 运行 hash 与干净构建一致。令牌未输出或离开服务器；部署检查没有新模型调用、生产样本或账户写入。真实语义与解压客户端回放证据见 [验收](../acceptance/obligation-evolution.md)。

## 2026-09-23 模型完全一致关系归一化部署

源码 `8d39223`，新增模型结果入口 normalize-evolution.mjs，折叠完全一致的重复关系，规范领域校验与提示版本保持。后台包 SHA-256 `53bec1db6874216dbf620f362d9cde165e8620ea6cb52910dec2856948b6a18a`。客户端沿用已通过两条回放的 657c2a6。

前版 `/opt/worket/releases/b4702a0`；回滚容器 `worket-before-8d39223-20260922-235509`；数据备份 `/opt/worket/backups/data-pre-8d39223-20260922-235509.tgz`。部署前无活跃/待领取请求，模块离线导入与健康检查通过；原容器配置逐项保持，无数据库迁移或凭据变更。

公网 health 200 且 configured=true，匿名 capabilities 401、admin 404；服务器内短期令牌检查认证能力 200，rule/evolution/evidence/skill 均为 [1]，recordingView 为 [1,2]。normalize-evolution.mjs、workflow.mjs、contracts/evolution.js 运行 hash 与干净构建一致。凭据未输出/离开服务器，无生产样本或账号写入，部署检查没有模型调用。试验与失败边界见 [验收](../acceptance/repetition-evolution.md)。

## 2026-09-23 v0.1.5 自动工作状态准备部署

用户明确“同步生产”后，将后台从 `8d39223` 更新到 v0.1.5 发布提交 `8ffa545`，增加 `continuationSchemaVersions:[1]`。后台包 SHA-256 为 `74146ffdddd456389917b4e7140e1388ca00541034ae9ffc53d32124aa513fa0`。

部署前无活跃或待领取请求，离线模块加载通过。备份 `/opt/worket/backups/data-pre-v015-20260923-175910.tgz` 权限为 0600，旧容器 `worket-before-v015-20260923-175910` 和前版目录保留。新容器沿用原镜像、运行与安全配置；新增 `requests.operation` 列默认 `definition`，20 条原请求保留。设置与加密、签名密钥逐字节一致，两份 SQLite 数据库完整性检查均为 ok。

公网 health 200 且 configured=true，匿名 capabilities 401、admin 404；服务器内一分钟令牌核验认证能力 200，自动准备协议为 [1]，原有能力保持。五个关键运行模块哈希与发布构建一致。检查没有模型调用，未修改账号；凭据未输出或离开服务器。完整证据见 [生产验证记录](../releases/v0.1.5-production.json)，客户端发布与升级验收见 [v0.1.5 验收](../releases/v0.1.5-verification.md)。

## 2026-09-24 v0.1.6 长记录沉淀过滤部署

用户明确要求更新并打包推送发布新版本。后台由 `8ffa545` 切换到 `71a4f94`，启用 `analysisSchemaVersions:[1]`；过滤后的固定输入、超长原文分片、必要引用汇总及未确认规则独立待审路径均在包内。后台包 SHA-256 为 `3cbb347348acdc1673c5d053f6f1f0a5cdf8d03d03e93b7a5489ef30ebf56c5f`，关键运行文件摘要与干净构建一致。

部署前无活跃或待领取请求，完成离线导入、持久数据备份、原子切换及配置复核。20 条请求记录保留；运行身份、环境和安全配置保持，settings 与密钥逐字节一致，metadata/improvement 数据库 quick_check=ok，无迁移。备份为 `/opt/worket/backups/data-pre-v016-20260924-185319.tgz`，旧容器 `worket-before-v016-20260924-185319` 保留供回滚。

公网 health 200/configured、匿名 capabilities 401、admin 404；服务器内短期令牌核验分析、自动准备、规则、演进、证据、技能能力均为 [1]。凭据没有输出或离开服务器。本轮部署检查没有新模型调用；真实模型证据沿用发布前固定请求的验证，见 [生产记录](../releases/v0.1.6-production.json) 与 [发布验收](../releases/v0.1.6-verification.md)。
