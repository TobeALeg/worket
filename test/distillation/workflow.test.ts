import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDefinition, SYSTEM } from "../../server/workflow.mjs";
import { result } from "./fixtures.ts";
const request = (kind: string) => ({ schemaVersion: 1, snapshotHash: "fixture", sources: [{ key: "work-1", events: [{ key: "event-1", sequence: 1, kind, content: "每条事实必须标注来源", hash: "fixture" }] }] });
async function run(kind: string, change = (_: any) => {}, coordinated = false) {
  const source = request(kind), stages: any[] = [], progress: any[] = [];
  if (coordinated) source.ruleSchemaVersion = 1;
  const prompts: string[] = [];
  const value = await extractDefinition(source, {
    model: "fixture",
    async call(messages: any) {
      prompts.push(messages[0].content);
      const body = JSON.parse(messages[1].content); stages.push(body);
      if (body.phase === "extract") return { result: { requirements: [], issues: [], eventKeys: ["work-1/event-1"] } };
      const output = result(source); change(output);
      return { result: output };
    },
  }, new AbortController().signal, () => {}, (p: any) => progress.push(p));
  return { value, stages, progress, prompts };
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

test("actual provider system contract includes rule relationships and file role boundaries", () => {
  assert.ok(SYSTEM.includes('rule:{scope:'));
  assert.ok(SYSTEM.includes('Only file.content with role NORMATIVE'));
  assert.ok(SYSTEM.includes('startLine:1,endLine:1'));
});

test("new coordination is opt-in; legacy clients keep a compatible effective contract", async () => {
  const old = await run("user.prompt");
  assert.ok(old.prompts.every(p => !p.includes('RULE COORDINATION')));
  assert.equal(old.value.versions.prompt, 'work-definition-v1.4');
  assert.equal(old.value.content.constraints[0].rule, undefined);
  const modern = await run("user.prompt", () => {}, true);
  assert.ok(modern.prompts.every(p => p.includes('RULE COORDINATION')));
  assert.equal(modern.value.versions.prompt, 'work-definition-v2.0');
  assert.equal(modern.value.content.constraints[0].rule.scope, 'UNCERTAIN');
  assert.ok(modern.value.issues.some(i => i.blocking));
});
