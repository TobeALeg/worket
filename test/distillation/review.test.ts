import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createWorkCore } from "../../dist/core/index.js";
import { resolveReviewField, reviewFieldValue } from "../../dist/definitions/review.js";
import { resizePanelRight } from "../../dist/desktop/panel-resize.js";
import type { DefinitionContent } from "../../dist/contracts/definition.js";
const basis = { type: "INFERRED", refs: [], rationale: "合成来源" } as const;
function content(): DefinitionContent {
  const item = (key: string) => ({ key, text: key, basis: { ...basis, refs: [] } });
  return { schemaVersion: 1, name: "合成审阅", purpose: item("purpose"), inputs: [{ ...item("a"), valueType: "TEXT", required: true }, { ...item("b"), valueType: "TEXT", required: false }], deliverables: [item("a")], constraints: [], acceptanceCriteria: [item("check")], methods: [], materialRoles: [] };
}
test("review targets reject ambiguous keys and retain index identity after removal", () => {
  const original = content(), changed = structuredClone(original);
  assert.equal(resolveReviewField(original, "a"), null);
  assert.deepEqual(resolveReviewField(original, "content.inputs[1]"), { section: "inputs", key: "b" });
  changed.inputs.shift();
  assert.equal((reviewFieldValue(changed, original, "inputs.1") as any).key, "b");
  assert.equal(reviewFieldValue(changed, original, "inputs.0"), undefined);
});
test("save then adopt edits, revoke a saved resolution, and keep publishing blocked", () => {
  const core = createWorkCore({ databasePath: join(mkdtempSync(join(tmpdir(), "review-")), "core.sqlite") });
  try {
    const c = content(), repo = core.definitions;
    let d = repo.saveDraft({ id: randomUUID(), revision: 1, content: c, originalContent: structuredClone(c), refs: [], issues: [{ id: "scope", field: "inputs.b", type: "UNCERTAIN_GENERALIZATION", blocking: true, message: "输入必填情况" }], resolutions: [] });
    const edited = structuredClone(d.content); edited.inputs[1]!.required = true;
    d = repo.update({ draftId: d.id, expectedRevision: d.revision, content: edited, issueResolutions: [], replaceResolutions: true });
    d = repo.update({ draftId: d.id, expectedRevision: d.revision, content: d.content, issueResolutions: [{ issueId: "scope", action: "REWRITE", explanation: "采用必填输入" }], replaceResolutions: true });
    assert.equal(d.resolutions.length, 1);
    d = repo.update({ draftId: d.id, expectedRevision: d.revision, content: d.content, issueResolutions: [], replaceResolutions: true });
    assert.equal(repo.read<any>("definition_drafts", d.id).resolutions.length, 0);
    assert.throws(() => repo.publish({ draftId: d.id, expectedRevision: d.revision, commandId: randomUUID(), materialBindings: {} }), /UNRESOLVED_ISSUES/u);
  } finally { core.close(); }
});
test("right resize keeps left/top/height and clamps to the monitor", () => {
  const b = { x: 200, y: 60, width: 410, height: 660 }, area = { x: 0, y: 0, width: 900, height: 800 };
  assert.deepEqual(resizePanelRight(b, area, 60), { ...b, width: 470 });
  assert.deepEqual(resizePanelRight(b, area, 9999), { ...b, width: 700 });
  assert.equal(resizePanelRight(b, area, -9999).width, 360);
});
