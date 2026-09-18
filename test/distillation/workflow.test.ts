import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDefinition } from "../../server/workflow.mjs";
import { result } from "./fixtures.ts";
const request = (kind: string) => ({ schemaVersion: 1, snapshotHash: "fixture", sources: [{ key: "work-1", events: [{ key: "event-1", sequence: 1, kind, content: "每条事实必须标注来源", hash: "fixture" }] }] });
async function run(kind: string, change = (_: any) => {}) {
  const source = request(kind), stages: any[] = [], progress: any[] = [];
  const value = await extractDefinition(source, {
    model: "fixture",
    async call(messages: any) {
      const body = JSON.parse(messages[1].content); stages.push(body);
      if (body.phase === "extract") return { result: { requirements: [], issues: [], eventKeys: ["work-1/event-1"] } };
      const output = result(source); change(output);
      return { result: output };
    },
  }, new AbortController().signal, () => {}, (p: any) => progress.push(p));
  return { value, stages, progress };
}
for (const kind of ["agent.response", "tool.call"]) test(`mislabelled ${kind} becomes reviewable inference instead of rejecting the whole extraction`, async () => {
  const { value } = await run(kind);
  assert.equal(value.content.purpose.basis.type, "INFERRED");
  assert.equal(value.content.purpose.basis.refs[0].eventId, "event-1");
  assert.ok(value.issues.some((i: any) => i.blocking && i.type === "UNSUPPORTED_SOURCE" && i.field === "purpose"));
});
test("valid user evidence stays user-authored evidence and final model sees actual event kinds", async () => {
  const { value, stages, progress } = await run("user.prompt");
  assert.equal(value.content.purpose.basis.origin, "USER_STATED");
  assert.equal(stages[1].evidence[0].kind, "user.prompt");
  assert.deepEqual(progress, [{ phase: "extract", completed: 0, total: 1 }, { phase: "generalize", completed: 1, total: 1 }]);
});
test("unknown references and invented excerpts still fail closed", async () => {
  await assert.rejects(run("user.prompt", r => { r.content.purpose.basis.refs[0].eventId = "missing"; }), { code: "INVALID_SOURCE_REF" });
  await assert.rejects(run("user.prompt", r => { r.content.purpose.basis.refs[0].excerpt = "not in the source"; }), { code: "INVALID_SOURCE_REF" });
});
