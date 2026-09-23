# 点击即开始沉淀（2026-09-23）

用户要求去掉“确认沉淀范围”页面，点击沉淀直接开始；随后明确整批修改确认结束后再统一更新重启。

## 实现

详情“沉淀”、列表“沉淀所选”和不兼容来源的重新选择统一进入 `startDistillation`：固定当前来源快照，读取已保存的参与改进偏好，沿用已有提交命令，直接显示后台进度。同一次启动合并并发点击；相同内容的任务仍在运行时复用，不再次提交。

默认仅处理所选工作记录及附件信息。附件正文仍须单独选择，通过详情“更多 → 含附件沉淀”进入可选文件范围和用途编辑；此入口不再重复要求云端确认或改进勾选。模型处理说明放在服务设置，改进偏好保留在改进数据设置。已有约定的增量比较入口保持原有范围确认。

来源哈希与最新性校验、服务身份、后端授权和额度、命令幂等、完成后的候选审阅及发布边界保持。

## 验证

最终构建的 265 项测试全部通过。调整了 SOURCE_CHANGED 的旧文案断言，使其指向重新开始而非已经移除的范围提醒页。

实际 Electron 测试使用独立临时数据库和合成 HTTP 服务，分别验证参与改进关闭与开启两条路径：点击直接进入后台、无确认页、同内容重复/并发点击只保留一个任务、设置偏好正确应用、生成后审阅/修改/保存、复用和恢复、缺失附件不阻断默认沉淀、失败与重试。

- [关闭参与改进](direct-distillation/desktop-opt-out.json)
- [开启参与改进](direct-distillation/desktop-opt-in.json)
- [可选附件回放](direct-distillation/attachment-replay.json)：从真实“更多”入口选择正文与 NORMATIVE 用途，既有冻结候选经本机 HTTP 返回；审阅、发布、复用、文件版本与缺失校验通过。

普通桌面脚本原有文件标签、候选规则采纳与异步样本发送断言已适配当前实现，未放宽产品校验。本轮没有新增真实模型调用，没有替用户确认真实工作候选。

```sh
npm test
node --experimental-strip-types scripts/qa-distillation.mjs --unpackaged
node --experimental-strip-types scripts/qa-distillation.mjs --unpackaged --improvement
WORKET_E2E_REPLAY=test/fixtures/contracts/video node scripts/qa-contract-e2e.mjs
```

## 初次交付边界

仅源码、文档与测试完成；没有打包、替换或重启已安装 Worket。报告中的 restart 指隔离测试实例的恢复验证，不是用户应用重启。

只读核验 `/Applications/Worket.app` ASAR SHA-256 仍为 `9e93e3946d06f9709856b707afd85e40c706f41c6771d145c79a017edfdcb535`，运行 PID 仍为 27193。等待用户确认本批修改结束后再统一更新重启；本轮不涉及生产部署。

后续用户已确认更新重启。本变更随面板导航批次完成打包回归、安装替换及重启，见 [本机安装验收](panel-navigation.md)。
