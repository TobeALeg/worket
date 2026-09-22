import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { createReviewServer } from "../review-server.mjs";
import { normalizeReviewDocument, validateReviewDocument } from "../review/schema.mjs";

function fixture({ withDraft = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "worket-review-"));
  const source = join(root, "cases.jsonl");
  const draft = join(root, "review-draft.json");
  const output = join(root, "gold.json");
  const cases = [
    {
      schema_version: 1,
      case_id: "VC-A",
      display_name: "科普动画模板与导出规范",
      work_id: "video-a",
      cutoff_event_id: "a-2",
      cutoff_id: "final-a-2",
      source_type: "AUTHORIZED_REAL",
      task_family: "video-production",
      source_snapshot_sha256: "snapshot-a",
      events: [
        { id: "a-1", sequence: 1, kind: "user.prompt", content: "字幕用英文" },
        { id: "a-2", sequence: 2, kind: "agent.response", content: "收到" },
      ],
      source_files: [{ relative_path: "session-a.jsonl", sha256: "abc", size_bytes: 10 }],
    },
    {
      schema_version: 1,
      case_id: "VC-B",
      display_name: "HIFU Clinical Journey 视频修订与交付文案规则",
      work_id: "video-b",
      cutoff_event_id: "b-1",
      source_type: "AUTHORIZED_REAL",
      events: [{ id: "b-1", sequence: 1, kind: "user.prompt", content: "只记录，不进入结构化视图" }],
    },
  ];
  writeFileSync(source, `${cases.map((item) => JSON.stringify(item)).join("\n")}\n`);
  if (withDraft) {
    writeFileSync(draft, JSON.stringify({
      schema_version: 1,
      status: "DRAFT",
      reviewer_id: "tester",
      cases: [{
        case_id: "VC-A",
        units: [{
          gold_id: "a-g1",
          semantic_content: "本次字幕使用英文。",
          evidence_refs: [{ event_id: "a-1", excerpt: "字幕用英文" }],
          source_origin: "USER_STATED",
          adoption_status: "EXPLICIT_REQUIREMENT",
          validity: "ACTIVE_AT_CUTOFF",
          scope: "INSTANCE",
          destinations: ["S_ACTIVE"],
          criticality: "CRITICAL",
          utility_reason: "影响本次交付语言。",
          acceptable_variants: [],
          forbidden_inferences: [],
        }],
      }],
    }));
  }
  return { root, source, draft, output };
}

function serverOptions(paths, extra = {}) {
  return { root: paths.root, sourcePath: paths.source, draftPath: paths.draft, outputPath: paths.output, ...extra };
}

async function request(address, path, options) {
  const response = await fetch(`${address.url.slice(0, -1)}${path}`, options);
  const body = response.headers.get("content-type")?.includes("json") ? await response.json() : await response.text();
  return { response, body };
}

test("server auto-loads source/draft and serves original visible messages", async (t) => {
  const paths = fixture();
  const instance = createReviewServer(serverOptions(paths, { port: 0 }));
  const address = await instance.start();
  t.after(() => instance.close());

  const state = await request(address, "/api/state");
  assert.equal(state.response.status, 200);
  assert.equal(state.body.cases.length, 2);
  assert.equal(state.body.cases[0].source.messages[0].event_id, "a-1");
  assert.equal(state.body.cases[0].display_name, "科普动画模板与导出规范");
  assert.equal(state.body.cases[0].units[0].required, true);
  assert.equal(state.body.cases[0].units[0].review_action, "UNREVIEWED");

  const html = await request(address, "/");
  assert.equal(html.response.status, 200);
  assert.match(html.body, /H1 人工确认/u);

  const script = await request(address, "/app.js");
  assert.equal(script.response.status, 200);
  assert.match(script.body, /引用此消息/u);
  assert.match(script.body, /识别后应该保存到哪里/u);
  assert.match(script.body, /本轮要求模型识别吗/u);
  assert.match(script.body, /模型漏掉它会怎样/u);
  assert.doesNotMatch(script.body, />目标（可多选）</u);
});

test("draft saves atomically and final save rejects unreviewed cases", async (t) => {
  const paths = fixture({ withDraft: false });
  const instance = createReviewServer(serverOptions(paths, { port: 0 }));
  const address = await instance.start();
  t.after(() => instance.close());

  const invalidFinal = {
    schema_version: 1,
    status: "HUMAN_APPROVED",
    cases: [{ case_id: "VC-A", work_id: "video-a", cutoff_event_id: "a-2", review_status: "PENDING", units: [] }],
    human_approval: { reviewer_id: "tester" },
  };
  const invalid = await request(address, "/api/save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "final", document: invalidFinal }) });
  assert.equal(invalid.response.status, 400);
  assert.match(invalid.body.errors.join("\n"), /UNREVIEWED_CASE:VC-A/u);

  const draft = {
    schema_version: 1,
    status: "DRAFT",
    reviewer_id: "tester",
    cases: [{
      case_id: "VC-A", work_id: "video-a", cutoff_event_id: "a-2", review_status: "REVIEWED", units: [{
        gold_id: "a-g1", semantic_content: "本次字幕使用英文。", evidence_refs: [{ event_id: "a-1", excerpt: "字幕用英文" }],
        source_origin: "USER_STATED", adoption_status: "EXPLICIT_REQUIREMENT", validity: "ACTIVE_AT_CUTOFF", scope: "INSTANCE",
        destinations: ["S_ACTIVE"], criticality: "CRITICAL", utility_reason: "影响交付", acceptable_variants: [], forbidden_inferences: [],
        review_action: "KEEP", review_status: "CONFIRMED", required: true,
      }],
    }, { case_id: "VC-B", work_id: "video-b", cutoff_event_id: "b-1", review_status: "NO_REQUIREMENTS", units: [] }],
    human_approval: null,
  };
  const savedDraft = await request(address, "/api/save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "draft", document: draft }) });
  assert.equal(savedDraft.response.status, 200);
  assert.equal(JSON.parse(readFileSync(paths.draft, "utf8")).cases.length, 2);

  const final = { ...draft, status: "HUMAN_APPROVED", human_approval: { reviewer_id: "tester", approved_at: "2026-09-22T00:00:00.000Z", method: "LOCAL_REVIEW_HTML" } };
  const savedFinal = await request(address, "/api/save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "final", document: final }) });
  assert.equal(savedFinal.response.status, 200);
  const written = JSON.parse(readFileSync(paths.output, "utf8"));
  assert.equal(written.status, "HUMAN_APPROVED");
  assert.equal(written.cases[0].units[0].required, true);

  const conflict = await request(address, "/api/save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "final", document: final }) });
  assert.equal(conflict.response.status, 409);
  assert.equal(conflict.body.message, "FINAL_OUTPUT_EXISTS");
  assert.deepEqual(JSON.parse(readFileSync(paths.output, "utf8")), written);
});

test("final save checks evidence belongs to its case and excerpt is an exact substring", async (t) => {
  const paths = fixture({ withDraft: false });
  const instance = createReviewServer(serverOptions(paths, { port: 0 }));
  const address = await instance.start();
  t.after(() => instance.close());
  const final = {
    schema_version: 1,
    status: "HUMAN_APPROVED",
    cases: [{
      case_id: "VC-A", work_id: "video-a", cutoff_event_id: "a-2", review_status: "REVIEWED", units: [{
        gold_id: "a-g1", semantic_content: "字幕用英文", evidence_refs: [{ event_id: "b-1", excerpt: "只记录" }],
        source_origin: "USER_STATED", adoption_status: "EXPLICIT_REQUIREMENT", validity: "ACTIVE_AT_CUTOFF", scope: "INSTANCE",
        destinations: ["S_ACTIVE"], criticality: "CRITICAL", utility_reason: "影响交付", acceptable_variants: [], forbidden_inferences: [],
        review_action: "KEEP", review_status: "CONFIRMED",
      }],
    }, { case_id: "VC-B", work_id: "video-b", cutoff_event_id: "b-1", review_status: "NO_REQUIREMENTS", units: [] }],
    human_approval: { reviewer_id: "tester" },
  };
  const crossCase = await request(address, "/api/save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "final", document: final }) });
  assert.equal(crossCase.response.status, 400);
  assert.match(crossCase.body.errors.join("\n"), /EVIDENCE_EVENT_NOT_IN_CASE:VC-A:a-g1:b-1/u);

  final.cases[0].units[0].evidence_refs = [{ event_id: "a-1", excerpt: "不是原文" }];
  const fakeExcerpt = await request(address, "/api/save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "final", document: final }) });
  assert.equal(fakeExcerpt.response.status, 400);
  assert.match(fakeExcerpt.body.errors.join("\n"), /EVIDENCE_EXCERPT_NOT_FOUND:VC-A:a-g1:a-1/u);
});

test("rejects source, draft, or output paths outside the declared root", () => {
  const paths = fixture();
  assert.throws(() => createReviewServer(serverOptions(paths, { outputPath: resolve(paths.root, "..", "outside.json") })), /PATH_OUTSIDE_ROOT:output/u);
  symlinkSync(tmpdir(), join(paths.root, "linked-output"), "dir");
  assert.throws(() => createReviewServer(serverOptions(paths, { outputPath: join(paths.root, "linked-output", "gold.json") })), /PATH_OUTSIDE_ROOT:output/u);
});

test("missing draft starts as blank cases and allows future cases", async (t) => {
  const paths = fixture({ withDraft: false });
  const instance = createReviewServer(serverOptions(paths, { port: 0 }));
  const address = await instance.start();
  t.after(() => instance.close());
  const state = await request(address, "/api/state");
  assert.equal(state.body.cases.length, 2);
  assert.deepEqual(state.body.cases.map((item) => item.units.length), [0, 0]);
  assert.equal(state.body.cases[1].source.messages[0].event_id, "b-1");
});

test("final validation protects reviewer identity, evidence, enums, and the scoring denominator", () => {
  const paths = fixture({ withDraft: false });
  const sourceCases = readFileSync(paths.source, "utf8").trim().split("\n").map(JSON.parse);
  const document = {
    schema_version: 1,
    status: "HUMAN_APPROVED",
    reviewer_id: "reviewer-a",
    cases: [{
      case_id: "VC-A",
      review_status: "REVIEWED",
      units: [{
        gold_id: "a-g1",
        semantic_content: "本次字幕使用英文。",
        evidence_refs: [],
        source_origin: "USER_STATED",
        scope: "INSTANCE",
        destinations: ["NOT_A_DESTINATION"],
        criticality: "CRITICAL",
        review_action: "KEEP",
        review_status: "CONFIRMED",
        required: true,
      }, {
        gold_id: "a-g1",
        semantic_content: "历史要求。",
        evidence_refs: [{ event_id: "a-1", excerpt: "字幕用英文" }],
        source_origin: "USER_STATED",
        scope: "HISTORICAL",
        destinations: ["HISTORY"],
        criticality: "NORMAL",
        review_action: "REPLACED",
        review_status: "REPLACED",
        required: true,
      }],
    }],
    human_approval: { reviewer_id: "reviewer-b" },
  };

  const normalized = normalizeReviewDocument(document);
  assert.equal(normalized.cases[0].units[1].required, false);
  const result = validateReviewDocument(document, { final: true, sourceCases });
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /DUPLICATE_UNIT:VC-A:a-g1/u);
  assert.match(result.errors.join("\n"), /EVIDENCE_REQUIRED:VC-A:a-g1/u);
  assert.match(result.errors.join("\n"), /INVALID_DESTINATION:VC-A:a-g1:NOT_A_DESTINATION/u);
  assert.match(result.errors.join("\n"), /INACTIVE_UNIT_CANNOT_BE_REQUIRED:VC-A:a-g1/u);
  assert.match(result.errors.join("\n"), /REVIEWER_ID_MISMATCH/u);
  assert.match(result.errors.join("\n"), /APPROVED_AT_REQUIRED/u);
  assert.match(result.errors.join("\n"), /APPROVAL_METHOD_REQUIRED/u);
});
