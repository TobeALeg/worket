import assert from "node:assert/strict";
import test from "node:test";

import { LocalRuleExtractor } from "../../src/extractor/local-rule-extractor.ts";

test("本地提炼器生成带来源的通用 Work State，不读取原始文件", async () => {
  const extractor = new LocalRuleExtractor();
  const patch = await extractor.extract({
    previousState: null,
    events: [
      source("m1", "user.prompt", "请完成客户提案。必须只使用已确认的数据。"),
      source("a1", "agent.response", "已经完成竞品表，下一步补全引用。"),
      source("f1", "artifact.added", "/tmp/private.pdf", { path: "/tmp/private.pdf" })
    ]
  });

  assert.equal(patch.objective?.[0]?.origin, "USER_STATED");
  assert.deepEqual(patch.objective?.[0]?.sourceMessageIds, ["m1"]);
  assert.match(patch.constraints?.[0]?.text ?? "", /必须只使用/);
  assert.match(patch.completedActions?.[0]?.text ?? "", /已经完成竞品表/);
  assert.match(patch.pendingActions?.[0]?.text ?? "", /补全引用/);
  assert.equal(patch.artifacts?.[0]?.text, "/tmp/private.pdf");
});

test("本地线索忽略确认词但不截断明确要求", async () => {
  const extractor = new LocalRuleExtractor();
  const events = ["好", "确认", "同意", "yes", ...Array.from({ length: 20 }, (_, index) => `必须遵守第 ${index + 1} 条约束。`)]
    .map((content, index) => source(`m${index}`, "user.prompt", content));

  const patch = await extractor.extract({ previousState: null, events });

  assert.equal(patch.constraints?.length, 20);
  assert.ok(patch.constraints?.every((entry) => !/^(好|确认|同意|yes)$/iu.test(entry.text)));
  assert.notEqual(patch.objective?.[0]?.text, "好");
});

test('否定完成声明不进入本地已做线索', async () => {
  const patch = await new LocalRuleExtractor().extract({ previousState: null, events: [
    source('denial', 'agent.response', '不能声称已完成导出。'),
  ] });
  assert.deepEqual(patch.completedActions, []);
});

test("本地提炼器不会把 Codex 附件提示当成工作目标", async () => {
  const extractor = new LocalRuleExtractor();
  const patch = await extractor.extract({
    previousState: null,
    events: [
      source("attachment-only", "user.prompt", "# Files pasted by the user:\n\n## report.pdf: /tmp/report.pdf"),
      source("request", "user.prompt", "请根据报告完成客户提案。")
    ]
  });

  assert.equal(patch.objective?.[0]?.text, "请根据报告完成客户提案");
  assert.deepEqual(patch.objective?.[0]?.sourceMessageIds, ["request"]);
});

test("本地提炼器从 Files mentioned 区块后的 My request 提取目标", async () => {
  const extractor = new LocalRuleExtractor();
  const patch = await extractor.extract({
    previousState: null,
    events: [source(
      "mentioned-request",
      "user.prompt",
      "# Files mentioned by the user:\n\n## note.md: /tmp/note.md\n\n## My request:\n请继续完成真实桌面验收。"
    )]
  });

  assert.equal(patch.objective?.[0]?.text, "请继续完成真实桌面验收");
});

function source(id: string, kind: string, content: string, metadata: Record<string, unknown> = {}) {
  return {
    id,
    externalId: id,
    sequence: 1,
    kind,
    content,
    timestamp: "2026-09-02T00:00:00.000Z",
    executorType: kind === "user.prompt" ? "HUMAN" : "AGENT",
    environmentType: "CODEX_DESKTOP",
    metadata
  };
}
