import assert from "node:assert/strict";
import test from "node:test";
import { gradeAdjudication, gradeDocument } from "../grader.mjs";

const gold = { units: [
  { gold_id: "g1", criticality: "CRITICAL" },
  { gold_id: "g2", criticality: "NORMAL" },
] };
const good = (id, matches) => ({ id, matched_gold_ids: matches, supported: true, correct: true, scope_correct: true, status_correct: true, complete: true, relevant: true, redundant: false });

test("空输出不能得到召回，精度保持 N/A", () => {
  const score = gradeAdjudication(gold, { output_units: [] });
  assert.equal(score.required_recall, 0);
  assert.equal(score.useful_precision, null);
  assert.equal(score.manual_active_seconds, null);
});

test("重复十次不增加召回且降低有用精确率", () => {
  const output = [good("o1", ["g1"]), ...Array.from({ length: 9 }, (_, index) => ({ ...good(`dup-${index}`, ["g1"]), redundant: true }))];
  const score = gradeAdjudication(gold, { output_units: output });
  assert.equal(score.required_recall, 0.5);
  assert.equal(score.useful_precision, 0.1);
  assert.equal(score.noise_rate, 0.9);
});

test("否定、范围或条件错误不能形成严格命中", () => {
  const output = [{ ...good("wrong", ["g1"]), scope_correct: false }];
  assert.equal(gradeAdjudication(gold, { output_units: output }).critical_recall, 0);
});

test("来源 ID 存在但证据不支持时不命中", () => {
  const output = [{ ...good("unsupported", ["g1"]), supported: false }];
  const score = gradeAdjudication(gold, { output_units: output });
  assert.equal(score.required_recall, 0);
  assert.equal(score.unsupported_rate, 1);
});

test("严重错误独立计数，不能被普通命中抵消", () => {
  const score = gradeAdjudication(gold, { output_units: [good("all", ["g1", "g2"])], errors: [{ severity: "SEVERE", code: "NEGATION_FLIP" }] });
  assert.equal(score.required_recall, 1);
  assert.equal(score.severe_errors, 1);
});

test("原文全量复制若无关且冗余，不能成为高有用性结果", () => {
  const output = [{ ...good("raw-1", []), relevant: false }, { ...good("raw-2", []), redundant: true }];
  const score = gradeAdjudication(gold, { output_units: output });
  assert.equal(score.required_recall, 0);
  assert.equal(score.useful_precision, 0);
  assert.equal(score.noise_rate, 1);
});

test("把清楚要求全部标待确认不形成严格命中或有用输出", () => {
  const output = [{ ...good("pending", ["g1"]), status_correct: false, complete: false }];
  const score = gradeAdjudication(gold, { output_units: output });
  assert.equal(score.critical_recall, 0);
  assert.equal(score.useful_precision, 0);
  assert.equal(score.noise_rate, 1);
});

test("删除前置条件或改成泛泛质量要求不命中", () => {
  const output = [
    { ...good("condition-removed", ["g1"]), complete: false },
    { ...good("vague", ["g2"]), vacuous: true, complete: false },
  ];
  const score = gradeAdjudication(gold, { output_units: output });
  assert.equal(score.required_recall, 0);
  assert.equal(score.noise_rate, 1);
});

test("语义等价的合并输出可覆盖多个独立 gold", () => {
  const score = gradeAdjudication(gold, { output_units: [good("merged", ["g1", "g2"])] });
  assert.equal(score.required_recall, 1);
  assert.equal(score.useful_precision, 1);
});

test("正确空 Definition 在 gold 为空时不伪造 100% 召回", () => {
  const score = gradeAdjudication({ units: [] }, { output_units: [] });
  assert.equal(score.required_recall, null);
  assert.equal(score.useful_precision, null);
});

test("输出自称已通过不能改变外部 grader 结论", () => {
  const score = gradeAdjudication(gold, { output_units: [], model_claim: "PASSED" });
  assert.equal(score.required_recall, 0);
  assert.equal(score.human_review_status, "PENDING");
});

test("风险确认格式只发布人工确认的召回，精确率保持未定", () => {
  const approvedGold = {
    status: "HUMAN_APPROVED",
    cases: [{ case_id: "c1", units: [
      { gold_id: "g1", criticality: "CRITICAL" },
      { gold_id: "g2", criticality: "NORMAL" },
    ] }],
  };
  const adjudication = {
    status: "HUMAN_RISK_REVIEWED",
    run_id: "run-1",
    cases: [{
      case_id: "c1",
      gold_assessments: [
        { gold_id: "g1", final_verdict: "MATCH", reviewer_status: "CONFIRMED" },
        { gold_id: "g2", final_verdict: "MISS", reviewer_status: "CORRECTED" },
      ],
      output_assessments: [
        { output_id: "o1", final_verdict: "USEFUL", reviewer_status: "MODEL_ONLY" },
        { output_id: "o2", final_verdict: "REDUNDANT", reviewer_status: "CONFIRMED" },
      ],
      errors: [],
    }],
  };
  const score = gradeDocument(approvedGold, adjudication);
  assert.equal(score.status, "RISK_REVIEWED_GRADE");
  assert.equal(score.required_recall, 0.5);
  assert.equal(score.critical_recall, 1);
  assert.equal(score.useful_precision, null);
  assert.equal(score.noise_rate, null);
  assert.equal(score.risk_reviewed_useful_precision_estimate, 0.5);
  assert.equal(score.confirmed_noise_rate_lower_bound, 0.5);
  assert.equal(score.model_only_useful_count, 1);
  assert.equal(score.human_reviewed_output_count, 1);
  assert.equal(score.correction_count, 1);
});
