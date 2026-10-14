# WorkBuddy 附件任务自动状态整理修复（2026-10-14）

## 根因与修复

沿用附件任务 `e33966ba-5657-454a-a388-b9ee0b213580`。从原数据库只读备份构造真实整理输入，稳定复现 `validateContinuationRequest` 在事件序号检查处抛出 INVALID_INPUT：`conversation.title` 的本地序号为 0，整理服务协议只接受正整数。统一异常回退把它显示为“工作状态暂未更新”，并非这次附件或 WorkBuddy 回流失败。

修复在请求边界将业务事件按顺序从 1 编号。原始事件 ID、正文、顺序、持久化序号及 basis 的 throughSequence 水位不变；模型返回证据仍按原始 ID 校验。服务端协议不变，不部署后台。请求投影版本纳入 attempt_digest，使此前失败的已授权工作在升级后重试一次，有效缓存仍复用。

## 验证

- 全量回归 345/345 通过，含零序号标题经过真实本机 HTTP 服务后 RESOLVED、原始证据 ID 与水位不变，以及旧失败摘要升级重试且轮询/重启不重复调用。
- 安装版和构建产物 ASAR SHA-256 一致：`20d7add2ccf4e9bcae52850ff847334cb1df5d9403b9f993a4acec9b6cc90f55`；ad-hoc 签名检查通过。
- 旧应用备份：`output/app-backups/continuation-sequence-20261014/Worket.app`。原用户数据保留，正常退出并重启 `/Applications/Worket.app`。
- 真实任务重启后自动出现“正在更新工作状态…”，未手动修改生产数据库或伪造状态。于 `2026-10-14T08:21:27.348Z`（北京时间 16:21:27）自动生成 RESOLVED / COMPLETE，missingEvidenceIds 为空。界面显示“工作状态已更新”。
- 当前执行阶段为正式读取 CSV 并生成报告，execution 为 REPORTED_DONE；两个输出成果分别绑定原 ArtifactRef 与正确 sha256 版本，acceptance 均为 UNKNOWN，没有把执行者自述当成用户已验收。原始标题序号仍为 0，既有 16 条记录、3 份资料和读取回执保留。
- 独立只读校验两份结果文件哈希与整理成果版本一致，数据库 quick_check 为 ok；实际运行进程为 `/Applications/Worket.app/Contents/MacOS/Worket`。

本次验证是同一个合成附件任务的真实自动状态整理；不代表所有复杂历史都能无歧义整理。状态证据不包含本次 Codex 独立文件验算，因此保留 REPORTED_DONE / UNKNOWN 是正确边界。
