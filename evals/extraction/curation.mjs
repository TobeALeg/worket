import { readJson, readJsonl } from "./lib.mjs";

const ALLOWED_SPLITS = new Set(["CALIBRATION", "PILOT_HOLDOUT", "EXCLUDED"]);

export function curateCases(sourcePath, planPath) {
  const cases = readJsonl(sourcePath);
  const plan = readJson(planPath);
  if (plan.schema_version !== 1 || !Array.isArray(plan.assignments)) throw new Error("INVALID_CURATION_PLAN");
  const sourceById = new Map(cases.map((item) => [item.case_id, item]));
  const assigned = new Set();
  const groupSplits = new Map();
  const selected = [];
  for (const assignment of plan.assignments) {
    if (!sourceById.has(assignment.case_id)) throw new Error(`UNKNOWN_CASE:${assignment.case_id}`);
    if (assigned.has(assignment.case_id)) throw new Error(`DUPLICATE_ASSIGNMENT:${assignment.case_id}`);
    if (!ALLOWED_SPLITS.has(assignment.split)) throw new Error(`INVALID_SPLIT:${assignment.split}`);
    if (!assignment.group_id) throw new Error(`MISSING_GROUP:${assignment.case_id}`);
    const prior = groupSplits.get(assignment.group_id);
    if (prior && prior !== assignment.split) throw new Error(`GROUP_SPLIT_LEAK:${assignment.group_id}`);
    groupSplits.set(assignment.group_id, assignment.split);
    assigned.add(assignment.case_id);
    if (assignment.split === "EXCLUDED" || assignment.include === false) continue;
    selected.push({
      ...sourceById.get(assignment.case_id),
      split: assignment.split,
      group_id: assignment.group_id,
      holdout_blindness: assignment.holdout_blindness ?? "NOT_APPLICABLE",
      curation_reason: assignment.reason ?? null,
      curation_plan_version: plan.plan_version,
    });
  }
  return selected;
}
