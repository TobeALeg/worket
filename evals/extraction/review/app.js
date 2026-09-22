const ACTION_STATUS = {
  UNREVIEWED: "PENDING",
  KEEP: "CONFIRMED",
  MODIFY: "MODIFIED",
  DELETE: "DELETED",
  REPLACED: "REPLACED",
  ADDED: "ADDED",
};
const ACTION_LABELS = {
  UNREVIEWED: "还没确认",
  KEEP: "内容正确，保留",
  MODIFY: "需要修改",
  DELETE: "不应收录",
  REPLACED: "已被新规则替代",
  ADDED: "这是补录项",
};
const SCOPE_LABELS = {
  INSTANCE: "只适用于本次工作",
  WORK_FAMILY: "适用于以后同类工作",
  GLOBAL: "适用于所有工作",
  HISTORICAL: "已经是历史",
  NO_STRUCTURED_VIEW: "不应成为要求",
};
const DESTINATION_LABELS = {
  S_ACTIVE: "本次工作",
  D_REUSABLE_CANDIDATE: "以后同类工作",
  D_CLARIFICATION: "还要问我",
  HISTORY: "只保留历史",
  NO_STRUCTURED_VIEW: "不要收录",
};
const SOURCE_LABELS = {
  USER_STATED: "用户明确说过",
  USER_ACCEPTED_ASSISTANT: "用户接受了助手建议",
  ASSISTANT_PROPOSAL: "助手建议（未确认）",
  INFERRED: "推断",
  TOOL_METADATA: "工具/附件元数据",
  UNKNOWN: "未判断",
};
const ADOPTION_LABELS = {
  EXPLICIT_REQUIREMENT: "用户明确要求",
  APPROVED_PROPOSAL: "用户接受了建议",
  OPEN_QUESTION: "仍需用户确认",
  EXPLICIT_REPLACEMENT: "用户明确替代旧规则",
  SUPERSEDED_REQUIREMENT: "已经被新规则替代",
};
const VALIDITY_LABELS = {
  ACTIVE_AT_CUTOFF: "当前有效",
  SUPERSEDED_AT_CUTOFF: "当前已失效",
  UNRESOLVED_AT_CUTOFF: "当前还没确定",
};
const REVIEW_STATUS_LABELS = {
  PENDING: "未确认",
  CONFIRMED: "已保留",
  MODIFIED: "已修改",
  DELETED: "不收录",
  REPLACED: "已被替代",
  ADDED: "补录",
};
const CASE_STATUS_LABELS = {
  PENDING: "未审完",
  REVIEWED: "已审完",
  NO_REQUIREMENTS: "没有需要识别的要求",
};
const SOURCE_TYPE_LABELS = {
  AUTHORIZED_REAL: "已授权真实对话",
  SYNTHETIC: "合成测试材料",
};

let state = null;
let currentCaseIndex = 0;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");
const lines = (value) => String(value ?? "").split(/\r?\n/u).map((item) => item.trim()).filter(Boolean);
const option = (value, label, selected) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
const labeledOptions = (labels, selected) => {
  const entries = Object.entries(labels);
  if (selected && !Object.hasOwn(labels, selected)) entries.push([selected, `其他状态：${selected}`]);
  return entries.map(([value, label]) => option(value, label, selected)).join("");
};

function showNotice(message, kind = "") {
  const notice = $("#notice");
  notice.textContent = message;
  notice.className = `notice ${kind}`;
  if (message) window.setTimeout(() => { if (notice.textContent === message) notice.textContent = ""; }, 5000);
}

function unitClass(unit) {
  if (unit.review_action === "DELETE") return "unit-card deleted";
  return unit.review_action === "UNREVIEWED" ? "unit-card" : "unit-card reviewed";
}

function renderCaseList() {
  const list = $("#case-list");
  $("#case-count").textContent = `（${state.cases.length}）`;
  list.innerHTML = state.cases.map((reviewCase, index) => {
    const done = reviewCase.review_status === "REVIEWED" || reviewCase.review_status === "NO_REQUIREMENTS";
    const partial = reviewCase.units.some((unit) => unit.review_action !== "UNREVIEWED");
    return `<button class="case-item${index === currentCaseIndex ? " active" : ""}" data-case-index="${index}">
      <span class="case-id"><span class="status-dot ${done ? "done" : partial ? "partial" : ""}"></span>${escapeHtml(reviewCase.display_name || reviewCase.case_id)}</span>
      <span class="case-meta">${escapeHtml(reviewCase.case_id)} · ${reviewCase.units.length} 条待确认内容 · ${escapeHtml(CASE_STATUS_LABELS[reviewCase.review_status] || reviewCase.review_status)}</span>
    </button>`;
  }).join("");
  $$("[data-case-index]").forEach((button) => button.addEventListener("click", () => {
    collectVisibleFields();
    currentCaseIndex = Number(button.dataset.caseIndex);
    render();
  }));
}

function renderMessages(reviewCase) {
  const messages = reviewCase.source?.messages ?? [];
  if (!messages.length) return `<div class="empty">此案例没有可见的用户/助手消息。</div>`;
  return messages.map((message) => `<article class="message ${message.kind === "user.prompt" ? "user" : "assistant"}">
    <div class="message-meta">${escapeHtml(message.kind === "user.prompt" ? "用户" : "助手")} · ${escapeHtml(message.event_id)} · 序号 ${escapeHtml(message.sequence)}${message.occurred_at ? ` · ${escapeHtml(message.occurred_at)}` : ""}</div>
    <div class="message-body">${escapeHtml(message.content)}</div>
    <button class="quote" data-quote-event="${escapeHtml(message.event_id)}" type="button">引用此消息</button>
  </article>`).join("");
}

function renderEvidence(unit, index) {
  const refs = unit.evidence_refs ?? [];
  const body = refs.length ? refs.map((reference, refIndex) => `<div class="evidence-row">
    <input data-unit="${index}" data-evidence-index="${refIndex}" data-evidence-field="event_id" value="${escapeHtml(reference.event_id)}" placeholder="event ID">
    <input data-unit="${index}" data-evidence-index="${refIndex}" data-evidence-field="excerpt" value="${escapeHtml(reference.excerpt)}" placeholder="支持该单位的原文摘录">
    <button type="button" class="danger remove-evidence" data-unit="${index}" data-evidence-index="${refIndex}">删除</button>
  </div>`).join("") : `<p class="help">尚未绑定原文证据。请在上方消息中点击“引用此消息”。</p>`;
  return `<div class="field full"><span>证据引用（event ID + 原文摘录）</span><div class="evidence-list">${body}</div>
    <button type="button" class="secondary add-evidence" data-unit="${index}">新增证据行</button></div>`;
}

function renderUnit(unit, index) {
  const destinations = Array.isArray(unit.destinations) ? unit.destinations : [];
  return `<article class="${unitClass(unit)}" data-unit-card="${index}">
    <div class="unit-head"><h3>待确认内容 <span class="unit-id">${escapeHtml(unit.gold_id)}</span></h3>
      <div class="unit-actions"><span>${escapeHtml(REVIEW_STATUS_LABELS[unit.review_status] || unit.review_status)}</span>
        <select data-unit="${index}" data-field="review_action" aria-label="怎么处理这条内容">${labeledOptions(ACTION_LABELS, unit.review_action)}</select>
        ${unit.review_action === "ADDED" ? `<button type="button" class="danger remove-unit" data-unit="${index}">放弃补录</button>` : ""}
      </div>
    </div>
    <div class="field-grid">
      <label class="field full semantic"><span>这条要求是什么？（写成一条可以检查真假的要求，不写宽泛总结）</span><textarea data-unit="${index}" data-field="semantic_content" placeholder="例如：本次字幕使用英文">${escapeHtml(unit.semantic_content)}</textarea></label>
      <label class="field"><span>这条内容依据什么？</span><select data-unit="${index}" data-field="source_origin">${labeledOptions(SOURCE_LABELS, unit.source_origin)}</select></label>
      <label class="field"><span>用户是否已经确认？</span><select data-unit="${index}" data-field="adoption_status">${labeledOptions(ADOPTION_LABELS, unit.adoption_status)}</select></label>
      <label class="field"><span>这条要求现在有效吗？</span><select data-unit="${index}" data-field="validity">${labeledOptions(VALIDITY_LABELS, unit.validity)}</select></label>
      <label class="field"><span>适用于哪些工作？</span><select data-unit="${index}" data-field="scope">${labeledOptions(SCOPE_LABELS, unit.scope)}</select></label>
      <label class="field"><span>模型漏掉它会怎样？</span><select data-unit="${index}" data-field="criticality">${option("CRITICAL", "会导致返工或错误", unit.criticality)}${option("NORMAL", "影响较小", unit.criticality)}</select></label>
      <label class="field"><span>本轮要求模型识别吗？</span><span class="chip"><input type="checkbox" data-unit="${index}" data-field="required"${unit.required !== false ? " checked" : ""}>计入本轮评分</span><small class="field-note">当前有效要求通常勾选；历史、误提取或已被替代的内容不勾选。</small></label>
      <label class="field full"><span>识别后应该保存到哪里？（可多选）</span><div class="chips">${Object.entries(DESTINATION_LABELS).map(([value, label]) => `<label class="chip"><input type="checkbox" data-unit="${index}" data-destination="${escapeHtml(value)}"${destinations.includes(value) ? " checked" : ""}>${escapeHtml(label)}</label>`).join("")}</div><small class="field-note">“本次工作”用于当前交付；“以后同类工作”表示可能成为长期规则；“还要问我”不能直接当规则。</small></label>
      <label class="field full"><span>为什么要保留这条？</span><textarea data-unit="${index}" data-field="utility_reason" placeholder="它会影响什么决策、交付或后续复用？">${escapeHtml(unit.utility_reason)}</textarea></label>
      <label class="field full"><span>哪些说法也算同一要求？（每行一条，可留空）</span><textarea data-unit="${index}" data-field="acceptable_variants">${escapeHtml((unit.acceptable_variants ?? []).join("\n"))}</textarea></label>
      <label class="field full"><span>不能从这条要求推出什么？（每行一条，可留空）</span><textarea data-unit="${index}" data-field="forbidden_inferences" placeholder="例如：不能因此推断所有后续视频都使用英文字幕">${escapeHtml((unit.forbidden_inferences ?? []).join("\n"))}</textarea></label>
      ${renderEvidence(unit, index)}
      <label class="field full"><span>它替代了哪一条？（仅选择“已被新规则替代”时填写内部 ID）</span><input class="small-input" data-unit="${index}" data-field="replacement_for" value="${escapeHtml(unit.replacement_for)}" placeholder="旧 ID，可留空"></label>
    </div>
  </article>`;
}

function renderDetail() {
  const reviewCase = state.cases[currentCaseIndex];
  if (!reviewCase) { $("#detail").innerHTML = `<div class="empty">没有可评审案例。</div>`; return; }
  const source = reviewCase.source;
  $("#detail").innerHTML = `<div class="case-head">
    <div><h2>${escapeHtml(reviewCase.display_name || reviewCase.case_id)}</h2><div class="metadata">case_id：${escapeHtml(reviewCase.case_id)}<br>work_id：${escapeHtml(reviewCase.work_id)}<br>cutoff_event_id：${escapeHtml(reviewCase.cutoff_event_id)}<br>来源：${escapeHtml(SOURCE_TYPE_LABELS[reviewCase.source_origin || source?.source_type] || reviewCase.source_origin || source?.source_type)} ${reviewCase.task_family ? ` · 类型：${escapeHtml(reviewCase.task_family)}` : ""}</div></div>
    <div class="case-actions"><button type="button" class="secondary mark-reviewed" data-case-status="REVIEWED">本案已审完</button><button type="button" class="secondary mark-reviewed" data-case-status="NO_REQUIREMENTS">本案没有需要识别的要求</button></div>
  </div>
  <details class="source-card"><summary>原始可见消息（${reviewCase.source?.messages?.length ?? 0} 条）<span>仅用户/助手正文；展开后可引用补录</span></summary><div class="source-messages">${renderMessages(reviewCase)}</div></details>
  <section><h3>逐条确认</h3><div class="review-guide"><strong>先确认内容对不对。</strong>然后决定它是否应被模型识别、漏掉后的影响，以及识别后保存到本次工作、以后同类工作、待确认或历史。</div>${reviewCase.units.map(renderUnit).join("") || `<div class="empty">还没有单位。可以从原文消息引用创建，或直接新增补遗漏项。</div>`}
    <button type="button" class="add-unit secondary" data-add-unit="ADDED">＋补录遗漏的真实要求</button>
    <div class="case-note"><label class="field"><span>案例备注</span><textarea data-case-field="review_note" placeholder="记录争议、范围判断或待二次确认事项">${escapeHtml(reviewCase.review_note)}</textarea></label></div>
  </section>`;
}

function render() {
  renderCaseList();
  renderDetail();
  $("#reviewer-id").value = state.reviewer_id || "";
  $("#path-note").textContent = state.paths ? `source：${state.paths.source}\ndraft：${state.paths.draft}\noutput：${state.paths.output}` : "";
  bindDetailEvents();
}

function collectVisibleFields() {
  if (!state?.cases?.[currentCaseIndex]) return;
  const reviewCase = state.cases[currentCaseIndex];
  $$("[data-unit-card]").forEach((card) => {
    const index = Number(card.dataset.unitCard);
    const unit = reviewCase.units[index];
    if (!unit) return;
    $$(`[data-unit="${index}"][data-field]`, card).forEach((element) => {
      const field = element.dataset.field;
      if (field === "required") unit[field] = element.checked;
      else if (field === "acceptable_variants" || field === "forbidden_inferences") unit[field] = lines(element.value);
      else unit[field] = element.value;
    });
    unit.destinations = $$(`[data-unit="${index}"][data-destination]`, card).filter((element) => element.checked).map((element) => element.dataset.destination);
    unit.evidence_refs = $$("[data-evidence-index]", card).reduce((result, element) => {
      const refIndex = Number(element.dataset.evidenceIndex);
      const field = element.dataset.evidenceField;
      result[refIndex] ??= { event_id: "", excerpt: "" };
      result[refIndex][field] = element.value.trim();
      return result;
    }, []).filter((reference) => reference.event_id);
    unit.review_status = ACTION_STATUS[unit.review_action] || "PENDING";
  });
  const note = $('[data-case-field="review_note"]');
  if (note) reviewCase.review_note = note.value;
  state.reviewer_id = $("#reviewer-id")?.value.trim() || state.reviewer_id || "";
}

function addUnit(action = "ADDED", evidence = null) {
  collectVisibleFields();
  const reviewCase = state.cases[currentCaseIndex];
  const id = `${reviewCase.case_id}-unit-${String(reviewCase.units.length + 1).padStart(3, "0")}`;
  reviewCase.units.push({
    gold_id: id,
    semantic_content: "",
    evidence_refs: evidence ? [{ event_id: evidence.event_id, excerpt: evidence.content.slice(0, 220) }] : [],
    source_origin: evidence?.kind === "user.prompt" ? "USER_STATED" : "UNKNOWN",
    adoption_status: "EXPLICIT_REQUIREMENT",
    validity: "ACTIVE_AT_CUTOFF",
    scope: "INSTANCE",
    destinations: ["S_ACTIVE"],
    criticality: "NORMAL",
    required: true,
    utility_reason: "",
    acceptable_variants: [],
    forbidden_inferences: [],
    review_action: action,
    review_status: ACTION_STATUS[action],
  });
  render();
  const last = $$("[data-unit-card]").at(-1);
  last?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function bindDetailEvents() {
  $$('[data-field="review_action"]').forEach((select) => select.addEventListener("change", () => {
    collectVisibleFields();
    const unit = state.cases[currentCaseIndex].units[Number(select.dataset.unit)];
    unit.review_action = select.value;
    unit.review_status = ACTION_STATUS[select.value];
    if (select.value === "DELETE") {
      unit.required = false;
      unit.destinations = ["NO_STRUCTURED_VIEW"];
    } else if (select.value === "REPLACED") {
      unit.required = false;
      unit.destinations = ["HISTORY"];
    }
    render();
  }));
  $$(".remove-unit").forEach((button) => button.addEventListener("click", () => {
    collectVisibleFields();
    state.cases[currentCaseIndex].units.splice(Number(button.dataset.unit), 1);
    render();
  }));
  $$(".add-unit").forEach((button) => button.addEventListener("click", () => addUnit(button.dataset.addUnit)));
  $$(".mark-reviewed").forEach((button) => button.addEventListener("click", () => {
    collectVisibleFields();
    state.cases[currentCaseIndex].review_status = button.dataset.caseStatus;
    render();
    showNotice(button.dataset.caseStatus === "NO_REQUIREMENTS" ? "已标记为本案没有需要模型识别的要求。" : "已标记本案审阅完成。", "ok");
  }));
  $$(".quote").forEach((button) => button.addEventListener("click", () => {
    collectVisibleFields();
    const eventId = button.dataset.quoteEvent;
    const message = state.cases[currentCaseIndex].source.messages.find((item) => item.event_id === eventId);
    if (!message) return;
    addUnit("ADDED", message);
    showNotice(`已创建补录单位并引用 ${eventId}，请填写其真实语义。`, "ok");
  }));
  $$(".add-evidence").forEach((button) => button.addEventListener("click", () => {
    collectVisibleFields();
    state.cases[currentCaseIndex].units[Number(button.dataset.unit)].evidence_refs.push({ event_id: "", excerpt: "" });
    render();
  }));
  $$(".remove-evidence").forEach((button) => button.addEventListener("click", () => {
    collectVisibleFields();
    state.cases[currentCaseIndex].units[Number(button.dataset.unit)].evidence_refs.splice(Number(button.dataset.evidenceIndex), 1);
    render();
  }));
}

function documentFor(mode) {
  collectVisibleFields();
  const reviewerId = $("#reviewer-id")?.value.trim() || "";
  state.reviewer_id = reviewerId;
  const final = mode === "final";
  return {
    schema_version: 1,
    status: final ? "HUMAN_APPROVED" : "DRAFT",
    reviewer_id: reviewerId,
    updated_at: new Date().toISOString(),
    cases: state.cases.map(({ source, ...reviewCase }) => reviewCase),
    human_approval: final ? { reviewer_id: reviewerId, approved_at: new Date().toISOString(), method: "LOCAL_REVIEW_HTML" } : null,
  };
}

async function save(mode) {
  const document = documentFor(mode);
  if (mode === "final" && !document.reviewer_id) {
    showNotice("最终确认前请填写评审人标识。", "error");
    return;
  }
  const response = await fetch("/api/save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, document }) });
  const body = await response.json();
  if (!response.ok) {
    const errors = body.errors || [body.message];
    const visible = errors.slice(0, 4).join("；");
    const remainder = errors.length > 4 ? `；另有 ${errors.length - 4} 项，请继续完成所有待确认单位` : "";
    showNotice(`保存失败：${visible}${remainder}`, "error");
    return;
  }
  state = body.document;
  currentCaseIndex = Math.min(currentCaseIndex, Math.max(0, state.cases.length - 1));
  render();
  showNotice(mode === "final" ? "最终确认已原子写入 output JSON。" : "草稿已原子写入 review draft JSON。", "ok");
}

async function load() {
  const response = await fetch("/api/state", { cache: "no-store" });
  if (!response.ok) throw new Error(`读取状态失败：HTTP ${response.status}`);
  state = await response.json();
  render();
}

$("#save-draft").addEventListener("click", () => save("draft").catch((error) => showNotice(error.message, "error")));
$("#save-final").addEventListener("click", () => save("final").catch((error) => showNotice(error.message, "error")));
load().catch((error) => showNotice(error.message, "error"));
