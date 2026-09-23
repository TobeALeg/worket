# 本次隔离诊断复现

这些诊断对固定SHA的三个原始模块执行，不是完整仓库测试。文件内容经Git blob哈希匹配。provider为合成响应；不会访问模型服务、读取本地聊天或修改产品数据库。

环境：本轮Node v22.16.0、tsc5.8.3。只编译了definition契约；未按仓库lockfile安装全部依赖。不是通过项目全量typecheck。

在已有匹配工具的环境中，从本包目录运行：

```sh
(cd audit-snapshot && tsc src/contracts/definition.ts --target es2022 --module nodenext --outDir dist/contracts --skipLibCheck)
node --experimental-transform-types probes/audit-probes.mjs
```

未安装工具时应按当前环境授权规则处理，不要求关闭sandbox或下载最新版本。Node实验参数以本机help为准。

第一次实际结果固定在 `results/module-probes.json`、`probe-console.log`、`probe-stderr.log`。重新执行默认写入唯一的 `results/replays/<timestamp>-<random>/module-probes.json`，不覆盖原记录。

`CONTROL_PASSED` = 正常/拒绝控制符合预期；`GAP_REPRODUCED` = 不想要的行为在旧模块中成功复现；`LIMIT_CONFIRMED` = 明确边界被复现。退出0只表示诊断完成且源哈希匹配，**8个缺口存在时也会退出0**。

优化时，A2必须把这些观察改写成实际工作树上的“期望行为”回归。不要修改audit-snapshot，也不要把本工具的退出0当作质量通过。

G04语义相反、G05漏提等需要语义/来源/人评的组合，不要求单纯JSON validator凭空理解所有自然语言。G08仍保留否定文本与AGENT_PROPOSED，未触发真实实例完成。
