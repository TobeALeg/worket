# 当前来源缺失与恢复

2026-09-23。消息删除、分支回退或来源切换后的不可见性，不等于用户撤销已确认约定。

## 观察与生效

适配器只有证明读取完整历史，才提供 history.complete 和 observedExternalIds。第一次完整读取发现已记录消息缺失，追加 source.check；旧内容保留可查，暂停该记录的交接、工作包读取和新提炼，持续比较不占用尝试次数。第二次独立完整读取的可见 ID 集合、缺失集合和绑定一致，再追加 source.absent，从当前状态和后续提炼中排除。失败、不完整读取、重启或绑定变化均清空内存中的连续确认；持久化待复核状态不会被重启静默绕过。

这两次读取是保守确认，不是上游原子快照的保证。当前来源持续变化时宁可保持待复核。流式内容尚未正式入档也计入可见 ID，不因过滤半句误判删除。原文恢复时追加新观察，恢复当前视图；A→缺失→A 不被旧 ID 去重吞掉。

原始记录、旧交接包、已确认 WorkDefinition 及其新旧实例均不自动改写。人工修改的 WorkState 保留。明确撤销通用规则仍走语义提炼与用户确认，来源缺失本身不生成删除约定的决定。

## 范围与适配器

从消息新建的记录保存 scopeStartExternalId。起点消失后不自动扩大到之前未选历史；显示范围提示，用户可通过“从消息新建”显式选择当前起点，创建另一实例并保留旧档案。

Codex 完整现代分页提供证明；旧接口仅全部回合明确 full 且非空时提供。WorkBuddy 新扩展要求 historyReady=true 且 hasOlder=false；旧事件别名先映射到稳定 ID，无法证明映射完整时撤去完整性证明。ZCode、Antigravity 和不明完整性的旧接口维持正常记录，但不会推断缺失。本轮没有替换用户已安装的 WorkBuddy 扩展，相关能力随新版集成安装生效。

## 数据流

适配器完整来源 → SourcePresence 连续观察 → sourceDelta 追加检查/缺失/恢复 → currentSourceEvents / currentSourceState → 界面与当前工作包、提炼。档案仍提供完整历史和 currentEventIds。来源检查是实例层的当前性，不是 contract 版本状态。

远端参与改进样本的 MESSAGE 协议尚未表达这些关系，另行演进；本轮不宣称已解决该边界。

验收入口：npm run qa:source-presence；[结果](../acceptance/source-presence.md)。
