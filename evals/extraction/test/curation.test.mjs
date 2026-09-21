import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { curateCases } from "../curation.mjs";

function fixture(assignments) {
  const directory = mkdtempSync(join(tmpdir(), "worket-curation-"));
  const source = join(directory, "source.jsonl");
  const plan = join(directory, "plan.json");
  writeFileSync(source, ["A", "B"].map((caseId) => JSON.stringify({ case_id: caseId, split: "UNASSIGNED" })).join("\n") + "\n");
  writeFileSync(plan, JSON.stringify({ schema_version: 1, plan_version: "v1", assignments }));
  return { source, plan };
}

test("分组计划写入 split 且排除项不进入结果", () => {
  const paths = fixture([
    { case_id: "A", split: "CALIBRATION", group_id: "g1" },
    { case_id: "B", split: "EXCLUDED", group_id: "g2" },
  ]);
  assert.deepEqual(curateCases(paths.source, paths.plan).map(({ case_id, split, group_id }) => ({ case_id, split, group_id })), [
    { case_id: "A", split: "CALIBRATION", group_id: "g1" },
  ]);
});

test("同组跨 split 会被阻断", () => {
  const paths = fixture([
    { case_id: "A", split: "CALIBRATION", group_id: "shared" },
    { case_id: "B", split: "PILOT_HOLDOUT", group_id: "shared" },
  ]);
  assert.throws(() => curateCases(paths.source, paths.plan), /GROUP_SPLIT_LEAK:shared/u);
});
