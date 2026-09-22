import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { createAdjudicationServer } from "../adjudication-server.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "worket-adjudication-"));
  const goldPath = join(root, "gold.json");
  const runDirectory = join(root, "run");
  const proposalPath = join(runDirectory, "adjudication-proposal.json");
  const draftPath = join(runDirectory, "adjudication-review-draft.json");
  const outputPath = join(runDirectory, "adjudication-final.json");
  mkdirSync(join(runDirectory, "trials"), { recursive: true });

  writeFileSync(goldPath, JSON.stringify({
    schema_version: 1,
    status: "HUMAN_APPROVED",
    cases: [{
      case_id: "VC-A",
      display_name: "视频交付规则",
      units: [{ gold_id: "g1", semantic_content: "成片使用英文字幕。" }],
    }],
  }));
  writeFileSync(join(runDirectory, "trials", "VC-A-01.json"), JSON.stringify({
    case_id: "VC-A",
    track: "S",
    repeat: 1,
    status: "SUCCEEDED",
    product_output: {
      persisted_state: {
        objective: [
          { id: "o1", text: "制作英文字幕成片", origin: "USER_STATED", sourceMessageIds: ["m1"] },
          { id: "o2", text: "制作横版预告", origin: "INFERRED", sourceMessageIds: [] },
        ],
      },
      handoff: {},
    },
  }));
  writeFileSync(proposalPath, JSON.stringify({
    schema_version: 1,
    status: "MODEL_PROPOSED",
    run_id: "run-a",
    prompt_version: "workstate-adjudication-v1",
    usage: { calls: 1 },
    cases: [{
      case_id: "VC-A",
      model: "test-model",
      result: {
        gold_assessments: [{ gold_id: "g1", verdict: "MATCH", matched_output_ids: ["objective:o1"], reason: "语义一致" }],
        output_assessments: [
          { output_id: "objective:o1", verdict: "USEFUL", matched_gold_ids: ["g1"], reason: "命中规则" },
          { output_id: "objective:o2", verdict: "IRRELEVANT", matched_gold_ids: [], reason: "未被要求" },
        ],
        errors: [],
      },
    }],
  }));
  return { root, goldPath, runDirectory, proposalPath, draftPath, outputPath };
}

async function request(address, path, options) {
  const response = await fetch(`${address.url.slice(0, -1)}${path}`, options);
  const body = response.headers.get("content-type")?.includes("json") ? await response.json() : await response.text();
  return { response, body };
}

function reviewDocument(state, { pending = false } = {}) {
  const now = "2026-09-22T00:00:00.000Z";
  return {
    schema_version: 1,
    status: "HUMAN_RISK_REVIEWED",
    run_id: state.run_id,
    reviewer_id: "tester",
    updated_at: now,
    cases: state.cases.map((reviewCase) => ({
      case_id: reviewCase.case_id,
      decisions: reviewCase.assessments.map((assessment, index) => ({
        ...assessment.decision,
        review_status: pending && index === 0 ? "PENDING" : "CONFIRMED",
      })),
    })),
    human_approval: { reviewer_id: "tester", approved_at: now, method: "LOCAL_ADJUDICATION_HTML" },
  };
}

test("only Gold coverage and non-USEFUL outputs enter the human confirmation queue", async (t) => {
  const paths = fixture();
  const instance = createAdjudicationServer({ ...paths, port: 0 });
  const address = await instance.start();
  t.after(() => instance.close());

  const state = await request(address, "/api/state");
  assert.equal(state.response.status, 200);
  assert.equal(state.body.cases.length, 1);
  assert.equal(state.body.cases[0].assessments.length, 2);
  assert.equal(state.body.cases[0].auto_useful_count, 1);
  assert.deepEqual(state.body.cases[0].assessments.map((item) => item.kind), ["GOLD_COVERAGE", "OUTPUT_QUALITY"]);

  const script = await request(address, "/app.js");
  assert.equal(script.response.status, 200);
  assert.match(script.body, /正确，进入下一条/u);
  assert.match(script.body, /不对，修改判断/u);
  assert.ok(script.body.indexOf("需要检查模型有没有识别到") < script.body.indexOf("自动对比结果"));
  assert.ok(script.body.indexOf("自动对比结果") < script.body.indexOf("这个自动判断正确吗"));
});

test("final save requires every high-risk item and preserves model-only USEFUL outputs", async (t) => {
  const paths = fixture();
  const instance = createAdjudicationServer({ ...paths, port: 0 });
  const address = await instance.start();
  t.after(() => instance.close());
  const state = (await request(address, "/api/state")).body;

  const invalid = await request(address, "/api/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "final", document: reviewDocument(state, { pending: true }) }),
  });
  assert.equal(invalid.response.status, 400);
  assert.match(invalid.body.errors.join("\n"), /ASSESSMENT_PENDING:VC-A:gold:g1/u);

  const draft = reviewDocument(state);
  draft.status = "DRAFT";
  draft.human_approval = null;
  const savedDraft = await request(address, "/api/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "draft", document: draft }),
  });
  assert.equal(savedDraft.response.status, 200);
  assert.equal(JSON.parse(readFileSync(paths.draftPath, "utf8")).reviewer_id, "tester");

  const savedFinal = await request(address, "/api/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "final", document: reviewDocument(state) }),
  });
  assert.equal(savedFinal.response.status, 200);
  const final = JSON.parse(readFileSync(paths.outputPath, "utf8"));
  assert.equal(final.status, "HUMAN_RISK_REVIEWED");
  assert.equal(final.cases[0].gold_assessments[0].reviewer_status, "CONFIRMED");
  assert.equal(final.cases[0].output_assessments[0].reviewer_status, "MODEL_ONLY");
  assert.equal(final.cases[0].output_assessments[1].reviewer_status, "CONFIRMED");
  const reloaded = (await request(address, "/api/state")).body;
  assert.ok(reloaded.cases[0].assessments.every((item) => item.decision.review_status === "CONFIRMED"));

  const conflict = await request(address, "/api/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "final", document: reviewDocument(state) }),
  });
  assert.equal(conflict.response.status, 409);
  assert.equal(conflict.body.message, "FINAL_OUTPUT_EXISTS");
});

test("rejects adjudication paths outside the declared root", () => {
  const paths = fixture();
  assert.throws(() => createAdjudicationServer({ ...paths, outputPath: resolve(paths.root, "..", "outside.json") }), /PATH_OUTSIDE_ROOT:output/u);
});
