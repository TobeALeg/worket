# 每次交接的读取回执

用户目标：一份确认的约定可创建新实例，并可靠交给执行者。一次历史读取不能证明后来交接的目标已经取得本次工作包。

## 状态与协议

每次交接创建独立 deliveryId 和活动 Binding。启动指令要求 get_work_context 同时携带 work_id 与 delivery_id；未提供 delivery_id 的读取只查看当前工作包，不确认接手。过期或错误标识返回 DELIVERY_MISMATCH。成功返回前仍生成当前快照并校验资料，不修改历史包。

复用工作同时具有当前会话 Hook 绑定与当前交接读取证据时才显示已接手。两种事件可按任意顺序到达。新的交接即使沿用同一实例，也必须重新取得读取证据。通用工作的记录状态规则不变。

取消或启动失败恢复原实际会话时，可恢复该会话的读取证据。完成的工作不显示等待接手。删除工作级联删除回执。

## 存储与兼容

work_package_receipts 用 binding_id 关联 CaptureBinding，用 delivery_id 关联不可变 HandoffPackage，read_at 仅记该交付的成功读取。Hook 将 pending Binding 更新为真实会话时保留关联。恢复原会话的新 Binding 可查找同工作、同适配器、同实际会话最新的回执；直接关联的未读回执始终优先。

升级时为仍处于 pending 的旧交付恢复关联，不接受 pending_dispatches 的全局 read_at。没有新回执的旧真实会话，只兼容同会话 Binding 的旧成功 MCP 审计；新无标识查看记录明确标为 deliveryMatched:false，不会成为兼容证据。未修改旧表和用户版本号。

标识用于交付关联，并非独立的调用者身份认证。持有本机 MCP 凭据和 deliveryId 的调用方可以确认读取；因此此机制不单独证明是某个外部 Agent 执行，更不证明业务完成。

验收见 [交接回执验收](../acceptance/delivery-receipts.md)。
