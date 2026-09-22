function ratio(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

function sum(items, key) {
  return items.reduce((total, item) => total + item[key], 0);
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

function gradeRiskReviewedCase(goldCase, adjudicatedCase) {
  if (!goldCase) throw new Error(`GOLD_CASE_NOT_FOUND:${adjudicatedCase.case_id}`);
  const goldById = new Map(goldCase.units.map((unit) => [unit.gold_id, unit]));
  const coverage = adjudicatedCase.gold_assessments ?? [];
  const required = coverage.map((assessment) => {
    const unit = goldById.get(assessment.gold_id);
    if (!unit) throw new Error(`GOLD_UNIT_NOT_FOUND:${adjudicatedCase.case_id}:${assessment.gold_id}`);
    return { unit, assessment };
  });
  const matched = required.filter(({ assessment }) => assessment.final_verdict === "MATCH");
  const critical = required.filter(({ unit }) => unit.criticality === "CRITICAL");
  const criticalMatched = critical.filter(({ assessment }) => assessment.final_verdict === "MATCH");
  const outputs = adjudicatedCase.output_assessments ?? [];
  const modelOnly = outputs.filter((item) => item.reviewer_status === "MODEL_ONLY");
  const humanReviewed = outputs.filter((item) => item.reviewer_status === "CONFIRMED" || item.reviewer_status === "CORRECTED");
  const confirmedNoise = humanReviewed.filter((item) => item.final_verdict !== "USEFUL");
  const useful = outputs.filter((item) => item.final_verdict === "USEFUL");
  const modelOnlyUseful = modelOnly.filter((item) => item.final_verdict === "USEFUL");
  const severeErrors = (adjudicatedCase.errors ?? []).filter((error) => error.severity === "SEVERE").length;
  return {
    case_id: adjudicatedCase.case_id,
    required_recall: ratio(matched.length, required.length),
    required_recall_numerator: matched.length,
    required_recall_denominator: required.length,
    critical_recall: ratio(criticalMatched.length, critical.length),
    critical_recall_numerator: criticalMatched.length,
    critical_recall_denominator: critical.length,
    useful_precision: null,
    noise_rate: null,
    unsupported_rate: null,
    risk_reviewed_useful_precision_estimate: ratio(useful.length, outputs.length),
    confirmed_noise_rate_lower_bound: ratio(confirmedNoise.length, outputs.length),
    output_count: outputs.length,
    useful_count: useful.length,
    confirmed_noise_count: confirmedNoise.length,
    model_only_useful_count: modelOnlyUseful.length,
    human_reviewed_output_count: humanReviewed.length,
    human_reviewed_gold_count: required.length,
    correction_count: [...coverage, ...outputs].filter((item) => item.reviewer_status === "CORRECTED").length,
    severe_errors: severeErrors,
  };
}

export function gradeRiskReviewedAdjudication(gold, adjudication) {
  if (gold?.status !== "HUMAN_APPROVED" || !Array.isArray(gold?.cases)) throw new Error("HUMAN_APPROVED_GOLD_REQUIRED");
  if (adjudication?.status !== "HUMAN_RISK_REVIEWED" || !Array.isArray(adjudication?.cases)) throw new Error("HUMAN_RISK_REVIEWED_ADJUDICATION_REQUIRED");
  const goldByCase = new Map(gold.cases.map((item) => [item.case_id, item]));
  const cases = adjudication.cases.map((item) => gradeRiskReviewedCase(goldByCase.get(item.case_id), item));
  const requiredDenominator = sum(cases, "required_recall_denominator");
  const criticalDenominator = sum(cases, "critical_recall_denominator");
  const outputCount = sum(cases, "output_count");
  const usefulCount = sum(cases, "useful_count");
  const modelOnlyUseful = sum(cases, "model_only_useful_count");
  const confirmedNoise = sum(cases, "confirmed_noise_count");
  return {
    schema_version: 1,
    status: "RISK_REVIEWED_GRADE",
    run_id: adjudication.run_id,
    required_recall: ratio(sum(cases, "required_recall_numerator"), requiredDenominator),
    required_recall_numerator: sum(cases, "required_recall_numerator"),
    required_recall_denominator: requiredDenominator,
    critical_recall: ratio(sum(cases, "critical_recall_numerator"), criticalDenominator),
    critical_recall_numerator: sum(cases, "critical_recall_numerator"),
    critical_recall_denominator: criticalDenominator,
    useful_precision: null,
    noise_rate: null,
    unsupported_rate: null,
    risk_reviewed_useful_precision_estimate: ratio(usefulCount, outputCount),
    confirmed_noise_rate_lower_bound: ratio(confirmedNoise, outputCount),
    output_count: outputCount,
    useful_count: usefulCount,
    confirmed_noise_count: confirmedNoise,
    model_only_useful_count: modelOnlyUseful,
    human_reviewed_output_count: sum(cases, "human_reviewed_output_count"),
    human_reviewed_gold_count: sum(cases, "human_reviewed_gold_count"),
    correction_count: sum(cases, "correction_count"),
    severe_errors: sum(cases, "severe_errors"),
    manual_active_seconds: null,
    human_review_status: "HUMAN_RISK_REVIEWED",
    cases,
    limitation: "必需 Gold 覆盖和所有非 USEFUL 输出已人工确认；USEFUL 输出仅由模型判断，因而正式 useful_precision/noise_rate/unsupported_rate 保持 null。estimate 与 lower_bound 只能用于诊断，不能表述为全量人工精确率。",
  };
}

export function gradeDocument(gold, adjudication) {
  return adjudication?.status === "HUMAN_RISK_REVIEWED"
    ? gradeRiskReviewedAdjudication(gold, adjudication)
    : gradeAdjudication(gold, adjudication);
}
