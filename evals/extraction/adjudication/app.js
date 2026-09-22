const GOLD_LABELS = { MATCH: "完整命中", PARTIAL: "部分命中", MISS: "完全漏掉", WRONG: "含义错误" };
const OUTPUT_LABELS = { USEFUL: "正确且有用", PARTIAL: "部分正确", REDUNDANT: "重复", IRRELEVANT: "当前无关", UNSUPPORTED: "来源不支持", WRONG: "内容错误" };
const KIND_LABELS = { GOLD_COVERAGE: "Gold 覆盖", OUTPUT_QUALITY: "输出质量" };
let state = null;
let currentCaseIndex = 0;
let editingAssessmentId = null;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

function notice(message, kind = "") {
  const target = $("#notice");
  target.textContent = message;
  target.className = `notice ${kind}`;
}

function verdictLabels(assessment) {
  return assessment.kind === "GOLD_COVERAGE" ? GOLD_LABELS : OUTPUT_LABELS;
}

function reviewCounts(reviewCase) {
  const done = reviewCase.assessments.filter((item) => item.decision.review_status !== "PENDING").length;
  return { done, total: reviewCase.assessments.length };
}

function renderCaseList() {
  $("#case-count").textContent = `（${state.cases.length}）`;
  $("#case-list").innerHTML = state.cases.map((reviewCase, index) => {
    const counts = reviewCounts(reviewCase);
    return `<button class="case-item${index === currentCaseIndex ? " active" : ""}" data-case-index="${index}">
      <strong>${escapeHtml(reviewCase.display_name)}</strong>
      <span>${counts.done}/${counts.total} 项已确认 · ${reviewCase.auto_useful_count} 项自动判为正常</span>
    </button>`;
  }).join("");
  $$('[data-case-index]').forEach((button) => button.addEventListener("click", () => {
    currentCaseIndex = Number(button.dataset.caseIndex);
    editingAssessmentId = null;
    render();
  }));
}

function relatedHtml(assessment) {
  if (!assessment.related.length) return `<div class="related-item">没有关联内容</div>`;
  return assessment.related.map((item) => `<div class="related-item"><strong>${escapeHtml(item.output_id || item.gold_id)}</strong><br>${escapeHtml(item.text || item.semantic_content)}</div>`).join("");
}

function editorHtml(assessment) {
  const labels = verdictLabels(assessment);
  const decision = assessment.decision;
  return `<div class="edit-panel" data-editor="${escapeHtml(assessment.assessment_id)}">
    <div class="explanation"><strong>自动判断依据</strong><p>${escapeHtml(assessment.model_reason)}</p></div>
    <div class="related"><strong>${assessment.kind === "GOLD_COVERAGE" ? "模型输出中与它对应的内容" : "它对应的 Gold"}</strong>${relatedHtml(assessment)}</div>
    <label>正确分类<select data-corrected-verdict>${Object.entries(labels).map(([value, label]) => `<option value="${value}"${decision.final_verdict === value ? " selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label>
    <label>关联 ID（逗号分隔）<input data-corrected-matches value="${escapeHtml(decision.final_matches.join(", "))}"></label>
    <label>为什么要修改？<textarea data-review-note placeholder="简要说明自动判断哪里不对">${escapeHtml(decision.review_note)}</textarea></label>
    <button class="primary save-correction" data-assessment-id="${escapeHtml(assessment.assessment_id)}">保存修改，进入下一条</button>
  </div>`;
}

function assessmentHtml(assessment, index, total) {
  const labels = verdictLabels(assessment);
  const done = assessment.decision.review_status !== "PENDING";
  const editing = editingAssessmentId === assessment.assessment_id;
  const targetText = assessment.kind === "GOLD_COVERAGE" ? assessment.target.semantic_content : assessment.target.text;
  return `<article class="assessment${done ? " done" : ""}" id="assessment-${index}">
    <div class="assessment-head"><strong>第 ${index + 1} / ${total} 项 · ${escapeHtml(KIND_LABELS[assessment.kind])}</strong><span>${done ? `已确认：${escapeHtml(labels[assessment.decision.final_verdict] || assessment.decision.final_verdict)}` : "待确认"}</span></div>
    <div class="step"><div class="step-label"><i>1</i>${assessment.kind === "GOLD_COVERAGE" ? "需要检查模型有没有识别到" : "模型生成的 Working Context 内容"}</div><div class="content-box">${escapeHtml(targetText)}</div></div>
    <div class="step"><div class="step-label"><i>2</i>自动对比结果</div><div class="classification"><span class="verdict">${escapeHtml(labels[assessment.model_verdict] || assessment.model_verdict)}</span></div></div>
    <div class="judgment"><strong><span class="step-label"><i>3</i>这个自动判断正确吗？</span></strong><div class="buttons">
      <button class="primary confirm-assessment" data-assessment-id="${escapeHtml(assessment.assessment_id)}">正确，进入下一条</button>
      <button class="secondary edit-assessment" data-assessment-id="${escapeHtml(assessment.assessment_id)}">不对，修改判断</button>
    </div></div>
    ${editing ? editorHtml(assessment) : ""}
  </article>`;
}

function renderWorkspace() {
  const reviewCase = state.cases[currentCaseIndex];
  if (!reviewCase) { $("#workspace").innerHTML = `<div class="empty">没有可确认的案例。</div>`; return; }
  const counts = reviewCounts(reviewCase);
  $("#workspace").innerHTML = `<div class="case-head"><h2>${escapeHtml(reviewCase.display_name)}</h2><p>${escapeHtml(reviewCase.case_id)} · ${counts.done}/${counts.total} 项已确认 · ${reviewCase.total_output_count} 个模型输出，其中 ${reviewCase.auto_useful_count} 个自动判为正常</p></div>
    <div class="flow-guide"><div><b>1. 检查什么</b>Gold 覆盖，或被标记为异常的模型输出</div><div><b>2. 自动判断</b>先看真实模型给出的分类</div><div><b>3. 你的确认</b>正确就进入下一条；不对才看原因并修改</div></div>
    ${reviewCase.assessments.map((assessment, index) => assessmentHtml(assessment, index, reviewCase.assessments.length)).join("")}`;
}

function render() {
  const total = state.cases.reduce((sum, reviewCase) => sum + reviewCase.assessments.length, 0);
  $("#review-summary").textContent = `真实模型已经完成抽取和自动对比；你只确认系统挑出的 ${total} 项高风险判断。`;
  $("#reviewer-id").value = state.reviewer_id || "";
  $("#run-meta").textContent = `run：${state.run_id}\n模型：${state.model || "未知"}\nproposal：${state.prompt_version}`;
  renderCaseList();
  renderWorkspace();
  bind();
}

function findAssessment(id) {
  for (const reviewCase of state.cases) {
    const assessment = reviewCase.assessments.find((item) => item.assessment_id === id);
    if (assessment) return assessment;
  }
  return null;
}

function nextPending(afterId) {
  const all = state.cases.flatMap((reviewCase, caseIndex) => reviewCase.assessments.map((assessment, assessmentIndex) => ({ caseIndex, assessmentIndex, assessment })));
  const start = Math.max(0, all.findIndex((item) => item.assessment.assessment_id === afterId) + 1);
  return [...all.slice(start), ...all.slice(0, start)].find((item) => item.assessment.decision.review_status === "PENDING") ?? null;
}

function advance(afterId) {
  const next = nextPending(afterId);
  editingAssessmentId = null;
  if (!next) { render(); notice("所有高风险自动判断都已确认，可以填写评审人并完成确认。", ""); return; }
  currentCaseIndex = next.caseIndex;
  render();
  window.requestAnimationFrame(() => document.getElementById(`assessment-${next.assessmentIndex}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
}

function bind() {
  $$(".confirm-assessment").forEach((button) => button.addEventListener("click", () => {
    const assessment = findAssessment(button.dataset.assessmentId);
    assessment.decision = { assessment_id: assessment.assessment_id, review_status: "CONFIRMED", final_verdict: assessment.model_verdict, final_matches: [...assessment.model_matches], review_note: "" };
    advance(assessment.assessment_id);
  }));
  $$(".edit-assessment").forEach((button) => button.addEventListener("click", () => {
    editingAssessmentId = button.dataset.assessmentId;
    render();
    window.requestAnimationFrame(() => $(`[data-editor="${CSS.escape(editingAssessmentId)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }));
  $$(".save-correction").forEach((button) => button.addEventListener("click", () => {
    const assessment = findAssessment(button.dataset.assessmentId);
    const editor = button.closest(".edit-panel");
    assessment.decision = {
      assessment_id: assessment.assessment_id,
      review_status: "CORRECTED",
      final_verdict: $("[data-corrected-verdict]", editor).value,
      final_matches: $("[data-corrected-matches]", editor).value.split(",").map((item) => item.trim()).filter(Boolean),
      review_note: $("[data-review-note]", editor).value.trim(),
    };
    advance(assessment.assessment_id);
  }));
}

function documentFor(mode) {
  const reviewerId = $("#reviewer-id").value.trim();
  state.reviewer_id = reviewerId;
  const final = mode === "final";
  const now = new Date().toISOString();
  return {
    schema_version: 1,
    status: final ? "HUMAN_RISK_REVIEWED" : "DRAFT",
    run_id: state.run_id,
    reviewer_id: reviewerId,
    updated_at: now,
    cases: state.cases.map((reviewCase) => ({ case_id: reviewCase.case_id, decisions: reviewCase.assessments.map((assessment) => assessment.decision) })),
    human_approval: final ? { reviewer_id: reviewerId, approved_at: now, method: "LOCAL_ADJUDICATION_HTML", scope: "GOLD_AND_NON_USEFUL_OUTPUTS" } : null,
  };
}

async function save(mode) {
  const document = documentFor(mode);
  if (mode === "final" && !document.reviewer_id) { notice("完成确认前请填写评审人。", "error"); return; }
  const response = await fetch("/api/save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, document }) });
  const body = await response.json();
  if (!response.ok) { notice(`保存失败：${(body.errors || [body.message]).slice(0, 4).join("；")}`, "error"); return; }
  state = body.document;
  render();
  notice(mode === "final" ? "确认完成，最终裁定 JSON 已写入。" : "草稿已保存。", "");
}

async function load() {
  const response = await fetch("/api/state", { cache: "no-store" });
  if (!response.ok) throw new Error(`读取失败：HTTP ${response.status}`);
  state = await response.json();
  render();
}

$("#save-draft").addEventListener("click", () => save("draft").catch((error) => notice(error.message, "error")));
$("#save-final").addEventListener("click", () => save("final").catch((error) => notice(error.message, "error")));
load().catch((error) => notice(error.message, "error"));
