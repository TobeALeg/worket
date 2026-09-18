# Worket jp-server 运维记录

日期：2026-09-18。目标主机：`jp-server`（Ubuntu 24.04 x86_64）。公网入口：`https://worket.dandi.site`。

## 当前状态

- Worket 服务代码来自提交 `78d09d4809371798b66221c4181387b27bd392f8`，版本目录为 `/opt/worket/releases/<commit>`，`/opt/worket/current` 指向当前版本。
- Docker 容器名为 `worket`，运行官方 `node:24-bookworm-slim`，设置 `restart=unless-stopped`、只读根文件系统、无额外 Linux capabilities、`no-new-privileges`。
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

- 使用明确授权的真实工作完成模型候选、用户确认、发布定义和复用闭环。
- 使用真实第二台设备执行恢复码恢复；自动化测试已覆盖相同协议。
- `/opt/worket/data` 的异机加密备份和恢复演练。
