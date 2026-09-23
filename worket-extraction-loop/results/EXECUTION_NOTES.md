# 本次执行边界

2026-09-18，本次通过GitHub连接器读取固定源码及分支元数据。容器完整GitHub仓库拉取未成功，使用按Git blob SHA匹配的三个源码文件做隔离测试；不是完整checkout。

实际执行了契约模块编译和12项反例/控制诊断，随后再次执行复现器验证输出一致。两次均得到3个CONTROL_PASSED、8个GAP_REPRODUCED、1个LIMIT_CONFIRMED，诊断进程退出0；该0只表示诊断完成。

编译入口：`tsc src/contracts/definition.ts --target es2022 --module nodenext --outDir dist/contracts --skipLibCheck`。诊断入口：`node --experimental-transform-types probes/audit-probes.mjs`。Node v22.16.0，TypeScript全局5.8.3；未运行项目完整工具链。

所有输入和provider均为合成。没有真实模型调用，没有Mac桌面，没有真实用户数据，没有修改数据库、源仓库或生产服务。没有统计真实模型错误率、用户时间收益或留存。

初次结果与重跑结果各自保留。优化时的测试必须改为真实工作树上的期望行为回归；不能修改历史快照并把旧反例诊断的退出0当作通过。
