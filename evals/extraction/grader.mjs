function ratio(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

export function gradeAdjudication(gold, adjudication) {
  const required = gold.units.filter((unit) => unit.required !== false);
  const critical = required.filter((unit) => unit.criticality === "CRITICAL");
  const outputs = adjudication.output_units ?? [];
  const eligible = outputs.filter((unit) => unit.supported && unit.correct && unit.scope_correct && unit.status_correct && unit.complete);
  const matched = new Set();
  for (const unit of eligible) for (const id of unit.matched_gold_ids ?? [])
    if (required.some((goldUnit) => goldUnit.gold_id === id)) matched.add(id);
  const useful = outputs.filter((unit) => unit.supported && unit.correct && unit.scope_correct && unit.status_correct && unit.complete && unit.relevant && !unit.redundant && !unit.vacuous);
  const noise = outputs.filter((unit) => !unit.relevant || unit.redundant || unit.vacuous || unit.wrongly_active || !unit.correct || !unit.scope_correct || !unit.status_correct || !unit.complete);
  const unsupported = outputs.filter((unit) => !unit.supported);
  const severeErrors = (adjudication.errors ?? []).filter((error) => error.severity === "SEVERE").length;
  return {
    required_recall: ratio(matched.size, required.length),
    required_recall_numerator: matched.size,
    required_recall_denominator: required.length,
    critical_recall: ratio(critical.filter((unit) => matched.has(unit.gold_id)).length, critical.length),
    critical_recall_numerator: critical.filter((unit) => matched.has(unit.gold_id)).length,
    critical_recall_denominator: critical.length,
    useful_precision: ratio(useful.length, outputs.length),
    noise_rate: ratio(noise.length, outputs.length),
    unsupported_rate: ratio(unsupported.length, outputs.length),
    severe_errors: severeErrors,
    manual_active_seconds: adjudication.manual_active_seconds ?? null,
    human_review_status: adjudication.human_review_status ?? "PENDING",
  };
}
