import type { SourceReview } from '../definitions/source-review.js';
import { ruleSections, ruleItems, type RulePolicy } from "../contracts/rules.js";
import { validateContent, type DefinitionContent, type DefinedItem, type InputSpec, type Issue, type Resolution, type SourceRef } from "../contracts/definition.js";
import type { Draft, Definition } from "../definitions/repository.js";
import { definitionSections, resolveReviewField, reviewFieldValue, reviewFingerprint, sameAddress, sectionItems, type DefinitionSection, type ItemAddress } from "../definitions/review.js";
import { errorText } from "../distillation/activity.js";

import { definitionLabels as labels, worketBrand } from "./ui.js";

const escape = (value: unknown) => String(value).replace(/[&<>"']/gu, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const idOf = (a: ItemAddress) => `${a.section}.${a.key}`;
const quoteIcon = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3h10v7H7l-3 3v-3H3zM5.5 6h5M5.5 8h3"/></svg>';
type Api = (action: string, input?: unknown) => Promise<any>;
type Item = DefinedItem & Partial<Pick<InputSpec, "valueType" | "required" | "choices" | "defaultValue">> & { obligation?: "REFERENCE" | "REQUIRED"; kind?: "SKILL" };

/** The draft is local until save. Evidence remains tied to original keys, never row indices. */
export function mountDefinitionReview(modal: HTMLDialogElement, initial: Draft, api: Api, onPublished: (definition: Definition) => Promise<void>): () => void {
  let draft = initial, content = structuredClone(initial.content), resolutions = structuredClone(initial.resolutions);
  let bindings: Record<string, string> = {}, editMode = false, busy = false, closed = false;
  let onlyChanges = !!initial.evolution;
  let sources: SourceReview | null = initial.jobId ? null : { hash: '', changes: [] };
  let confirmedSources: string | undefined;
  let undo: { content: DefinitionContent; resolutions: Resolution[]; bindings: Record<string, string> } | null = null;
  let savedState = "", message = "";
  let documentPreview: { address: string; path: string; text: string; hash: string; previousText: string; name: string; previous: { startLine: number; endLine: number } } | null = null;
  const evidenceOpen = new Set<string>(), settingsOpen = new Set<string>();
  const evidenceCache = new Map<string, string>();
  const explanations = new Map<string, string>();
  const abort = new AbortController(), signal = abort.signal;
  const issueTargets = () => new Map(draft.issues.map(issue => [issue.id, resolveReviewField(draft.originalContent, issue.field, draft.content)]));
  let targets = issueTargets();
  const signature = () => JSON.stringify({ content, resolutions, bindings });
  savedState = signature();
  const byAddress = (address: string): { address: ItemAddress; item: Item | undefined } => {
    const [section, key] = address.split(".") as [DefinitionSection, string];
    return { address: { section, key }, item: sectionItems(content, section).find(i => i.key === key) };
  };
  const issuesAt = (section: DefinitionSection, key?: string) => draft.issues.filter(issue => {
    const t = targets.get(issue.id);
    return t?.section === section && t.key === key;
  });
  const getResolution = (id: string) => resolutions.find(r => r.issueId === id);
  const fieldChanged = (issue: Issue) => reviewFingerprint(reviewFieldValue(content, draft.originalContent, issue.field)) !== reviewFingerprint(reviewFieldValue(draft.originalContent, draft.originalContent, issue.field));
  function invalidate(address?: ItemAddress) {
    resolutions = resolutions.filter(r => {
      const target = targets.get(r.issueId);
      return address ? !!target && !sameAddress(target, address) : !!target;
    });
  }
  function mutate(address: ItemAddress | undefined, action: () => void) {
    undo = { content: structuredClone(content), resolutions: structuredClone(resolutions), bindings: { ...bindings } };
    action(); invalidate(address); message = "";
  }
  function resolve(issue: Issue, action: Resolution["action"], explanation: string) {
    resolutions = resolutions.filter(r => r.issueId !== issue.id);
    resolutions.push({ issueId: issue.id, action, explanation });
  }
  function issueHtml(issue: Issue): string {
    const resolution = getResolution(issue.id), target = targets.get(issue.id);
    const item = target?.key ? sectionItems(content, target.section).find(i => i.key === target.key) as Item | undefined : undefined;
    if (resolution) return `<div class="dr-resolved"><span title="${escape(resolution.explanation)}">✓ ${escape(resolution.action === "DELETE" ? "不纳入" : resolution.action === "REWRITE" ? "已采用修改" : "已确认")}</span><button data-review-action="reopen" data-issue="${escape(issue.id)}" aria-label="重新决定：${escape(issue.message)}">修改</button></div>`;
    const isMethod = item && target?.section === "methods";
    const optional = item && target?.section === "deliverables" && issue.type === "UNCERTAIN_GENERALIZATION";
    return `<div class="dr-issue" data-issue="${escape(issue.id)}"><p>${escape(issue.message)}</p><div class="dr-choices">${item ? `<button data-review-action="keep" data-issue="${escape(issue.id)}">${isMethod ? "必须遵循" : "保留此项"}</button>${isMethod ? `<button data-review-action="reference" data-issue="${escape(issue.id)}">仅供参考</button>` : optional ? `<button data-review-action="optional" data-issue="${escape(issue.id)}">按次选择</button>` : ""}${target?.section !== "purpose" ? `<button data-review-action="exclude" data-issue="${escape(issue.id)}">不纳入</button>` : ""}` : ""}<button data-review-action="edit-issue" data-issue="${escape(issue.id)}">${target ? "编辑" + labels[target.section][1] : "编辑内容"}</button>${fieldChanged(issue) ? `<button data-review-action="adopt" data-issue="${escape(issue.id)}">采用修改</button>` : ""}${!issue.blocking ? `<button data-review-action="accept" data-issue="${escape(issue.id)}">知悉提示</button>` : ""}</div>${!target ? `<label class="dr-decision-input">你的决定<input data-explanation="${escape(issue.id)}" value="${escape(explanations.get(issue.id) ?? "")}" autocomplete="off"></label><button data-review-action="choose-unlinked" data-issue="${escape(issue.id)}">确认决定</button>` : !item && !fieldChanged(issue) && issue.blocking ? '<span class="dr-meta">修改相关内容后确认</span>' : ""}</div>`;
  }
  function evidenceHtml(item: DefinedItem, address: ItemAddress): string {
    // Saving edits replaces basis with USER_AUTHORED. Retain original evidence for inspection.
    const original = sectionItems(draft.originalContent, address.section).find(i => i.key === address.key) ?? item;
    const basis = original.basis;
    return `<div class="dr-evidence"><span>${basis.type === "SOURCE" ? { USER_STATED: "用户原话", AGENT_PROPOSED: "AI 提议", SYSTEM_INFERRED: "系统推断", DOCUMENT_STATED: "已采用规范" }[basis.origin] : basis.type === "INFERRED" ? "系统推断" : "用户编写"}</span>${basis.type === "INFERRED" ? `<p>${escape(basis.rationale)}</p>` : ""}${basis.type !== "USER_AUTHORED" ? basis.refs.map((ref, i) => {
      const cacheKey = JSON.stringify(ref);
      return `<div>${ref.role === "CONTEXT" ? '<span class="dr-meta">背景引用（不作为直接依据）</span>' : basis.refs.some(r => r.role === "CONTEXT") ? '<span class="dr-meta">直接依据</span>' : ""}${ref.excerpt ? `<blockquote>${escape(ref.excerpt)}</blockquote>` : ""}${ref.deleted ? '<p>来源已删除</p>' : evidenceCache.has(cacheKey) ? `<pre>${escape(evidenceCache.get(cacheKey))}</pre>` : `<button data-review-action="load-evidence" data-address="${escape(idOf(address))}" data-ref="${i}">查看原文${basis.refs.length > 1 ? ` ${i + 1}` : ""}</button>`}</div>`;
    }).join("") : ""}</div>`;
  }
  function ruleHtml(item: Item, address: ItemAddress): string {
    if (!(ruleSections as readonly string[]).includes(address.section)) return "";
    const r = item.rule ?? { scope: "REUSABLE", status: "ACTIVE" };
    const meta = `${({ REUSABLE: "同类工作", INSTANCE: "仅原实例", UNCERTAIN: "范围待确认" })[r.scope]} · ${({ ACTIVE: "有效", PROPOSED: "未采纳", RETIRED: "历史" })[r.status]}`;
    const source = item.document ? `${item.document.name} L${item.document.startLine}–${item.document.endLine} · ${item.document.hash.slice(0, 10)}` : "";
    if (!editMode) return `<p class="dr-meta">${escape(meta)}${r.condition ? ` · 当 ${escape(r.condition)}` : ""}${r.relation ? ` · ${({ DUPLICATE: "合并到", SUPPLEMENTS: "补充", REPLACES: "替代", CONFLICT: "冲突于" })[r.relation.kind]} ${escape(ruleItems(content).find(row => row.address === r.relation!.target)?.item.text ?? r.relation.target)}` : ""}${source ? ` · ${escape(source)}` : ""}</p>${item.document ? `<button data-review-action="document-version" data-address="${escape(idOf(address))}">检查 / 更新规范版本</button>` : ""}`;
    const id = escape(idOf(address));
    const select = (prop: string, value: string, entries: string[][]) => `<select data-property="${prop}" data-address="${id}">${entries.map(([v,l]) => `<option value="${v}" ${value === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
    return `<div class="dr-settings"><label>适用范围${select("scope",r.scope, [["REUSABLE","同类工作"],["INSTANCE","仅原实例"],["UNCERTAIN","待确认"]])}</label><label>状态${select("status",r.status,[["ACTIVE","有效"],["PROPOSED","未采纳"],["RETIRED","历史"]])}</label><label>适用条件<input data-property="condition" data-address="${id}" value="${escape(r.condition ?? "")}"></label><label>与已有规则的关系${select("relation",r.relation?.kind ?? "", [["","独立"],["DUPLICATE","重复"],["SUPPLEMENTS","补充"],["REPLACES","替代"],["CONFLICT","冲突"]])}</label>${r.relation ? `<label>对应规则<select data-property="target" data-address="${id}"><option value="">选择规则</option>${ruleItems(content).filter(row => row.address !== idOf(address)).map(row => `<option value="${escape(row.address)}" ${row.address === r.relation?.target ? "selected" : ""}>${escape(row.item.text)}</option>`).join("")}</select></label>` : ""}<span>${source ? escape(source) : ""}</span></div>`;
  }
  function settingsHtml(item: Item, address: ItemAddress): string {
    const id = idOf(address);
    if (address.section !== "inputs") return "";
    return `<div class="dr-settings"><label>输入类型<select data-property="valueType" data-address="${escape(id)}">${["TEXT", "NUMBER", "BOOLEAN", "CHOICE", "FILE"].map(t => `<option value="${t}" ${item.valueType === t ? "selected" : ""}>${({ TEXT: "文本", NUMBER: "数字", BOOLEAN: "是或否", CHOICE: "选项", FILE: "文件" })[t as "TEXT"]}</option>`).join("")}</select></label>${item.valueType === "CHOICE" ? `<label>可选值（每行一项）<textarea data-property="choices" data-address="${escape(id)}">${escape(item.choices?.join("\n") ?? "")}</textarea></label>` : ""}${item.valueType !== "FILE" ? `<label>默认值${item.valueType === "BOOLEAN" ? `<select data-property="defaultValue" data-address="${escape(id)}"><option value="" ${item.defaultValue === undefined ? "selected" : ""}>不设默认值</option><option value="true" ${item.defaultValue === true ? "selected" : ""}>是</option><option value="false" ${item.defaultValue === false ? "selected" : ""}>否</option></select>` : `<input data-property="defaultValue" data-address="${escape(id)}" value="${escape(item.defaultValue ?? "")}" ${item.valueType === "NUMBER" ? 'type="number"' : ""}>`}</label>` : ""}<span class="dr-meta">变量：{{${escape(item.key)}}}</span></div>`;
  }
  function rowHtml(item: Item, address: ItemAddress, removed = false): string {
    const id = idOf(address), related = issuesAt(address.section, address.key);
    const input = address.section === "inputs", material = address.section === "materialRoles";
    const pinned = draft.materials?.find(m => m.role === item.key && !!m.bundle === (item.kind === "SKILL"));
    const selectedPath = bindings[item.key] ?? pinned?.originalPath;
    const required = input || material ? `${item.required ? "必" : "选"}${input ? "填" : "需"}` : "";
    const meta = required || (address.section === "methods" ? item.obligation === "REQUIRED" ? "必须" : "参考" : "");
    return `<div class="dr-item ${removed ? "dr-removed" : ""}" data-section="${address.section}" data-key="${escape(item.key)}"><div class="dr-row">${editMode && !removed ? `<textarea class="dr-text" rows="1" data-text data-address="${escape(id)}" aria-label="${escape(labels[address.section][1])}条目">${escape(item.text)}</textarea>` : `<span class="dr-text-read">${escape(item.text)}</span>`}${meta ? editMode && !removed ? `<button data-review-action="toggle-property" data-address="${escape(id)}" class="dr-meta-toggle">${meta} ⇅</button>` : `<span class="dr-meta">${meta}</span>` : ""}<button class="dr-source" data-review-action="evidence" data-address="${escape(id)}" aria-label="查看依据：${escape(item.text)}" aria-expanded="${evidenceOpen.has(id)}">${quoteIcon}</button>${editMode && !removed ? `${input ? `<button class="dr-mini" data-review-action="settings" data-address="${escape(id)}" aria-label="输入设置：${escape(item.text)}">⋯</button>` : ""}${address.section !== "purpose" ? `<button class="dr-mini" data-review-action="delete" data-address="${escape(id)}" aria-label="删除：${escape(item.text)}">×</button>` : ""}` : ""}</div>${!removed ? ruleHtml(item, address) : ""}${evidenceOpen.has(id) ? evidenceHtml(item, address) : ""}${editMode && settingsOpen.has(id) && !removed ? settingsHtml(item, address) : ""}${material && !removed ? `<div class="dr-material">${editMode ? `<button data-review-action="material-kind" data-address="${escape(id)}">${item.kind === "SKILL" ? "技能目录" : "资料文件"} ⇅</button>` : item.kind === "SKILL" ? `<span class="dr-meta">技能目录 · 含配套文件</span>` : ""}<button data-review-action="material" data-address="${escape(id)}">${selectedPath ? "更换资料" : item.kind === "SKILL" ? "选择技能目录" : "选择资料"}</button>${selectedPath ? `<span title="${escape(selectedPath)}">${escape(selectedPath.split(/[\\/]/u).at(-1))}${!bindings[item.key] && pinned ? " · 已固定" : " · 待暂存"}</span>` : ""}</div>` : ""}<div data-issues-for="${escape(id)}">${related.map(issueHtml).join("")}</div></div>`;
  }
  function visibleItems(section: DefinitionSection): DefinedItem[] {
    const items = sectionItems(content, section);
    if (!onlyChanges || editMode) return items;
    const changes = new Set(draft.evolution?.changes.map(change => change.address));
    return items.filter(item => changes.has(`${section}.${item.key}`) || issuesAt(section, item.key).length > 0);
  }
  function evolutionEvidenceHtml(): string {
    if (!draft.evolution) return '';
    const entries = [...draft.evolution.evidence.map(entry => ({ ...entry, label: `重复于：${entry.baselineText}` })),
      ...draft.evolution.ignored.map(entry => ({ ...entry, label: entry.reason === 'RETIRED' ? '已撤销，不修改约定' : '仅本次，不修改约定' }))];
    if (!entries.length) return '';
    return `<details class="dr-evidence" id="evolution-provenance"><summary>查看重复与未纳入要求 · ${entries.length}</summary>${entries.map((entry, index) => `<p>${escape(entry.label)}</p>${entry.refs.map((ref, refIndex) => `${ref.role === 'CONTEXT' ? '<span class="dr-meta">背景引用</span>' : ''}${ref.excerpt ? `<blockquote>${escape(ref.excerpt)}</blockquote>` : ''}${ref.deleted ? '<p>来源已删除</p>' : `<button data-review-action="evolution-evidence" data-entry="${index}" data-ref="${refIndex}">查看原文</button>`}`).join('')}`).join('')}</details>`;
  }
  async function checkSources(): Promise<void> {
    const next: SourceReview = await api('sourceReview', { draftId: draft.id });
    if (next.hash !== sources?.hash) confirmedSources = undefined;
    sources = next;
  }
  function sourceNoticeHtml(): string {
    if (!draft.jobId) return '';
    if (!sources) return '<p class="dr-meta">正在核对聊天来源…</p>';
    if (!sources.changes.length) return '<p class="dr-meta">采用提交时的原文 · 与已同步记录一致</p>';
    const statuses = { REVISED: '已修订', PENDING: '暂未找到，待复核', ABSENT: '已不在当前来源', UNAVAILABLE: '当前记录不可用' };
    return `<section id="source-review-notice" class="dr-source-notice"><p>${sources.changes.length} 条聊天来源已变化，候选仍基于提交时的原文。</p><details><summary>查看变化</summary>${sources.changes.map(change => `<div class="dr-evidence"><p>${escape(change.title)} · ${statuses[change.status]}</p><span>提交时</span><pre>${escape(change.before)}</pre>${change.current !== undefined ? `<span>当前已同步内容</span><pre>${escape(change.current)}</pre>` : ''}</div>`).join('')}<p class="dr-meta">仅对照已同步记录。可修改候选，或关闭后重新选择范围提炼。</p></details><label><input id="source-review-confirm" type="checkbox" ${confirmedSources === sources.hash ? 'checked' : ''}>已查看变化，仍采用当前候选</label><button data-review-action="check-sources">重新核对</button></section>`;
  }
  function render(): void {
    if (closed) return;
    const scroll = modal.querySelector(".dr-content")?.scrollTop ?? 0;
    const active = document.activeElement as HTMLInputElement | null;
    const focus = active?.dataset.address, property = active?.dataset.property, text = active?.hasAttribute("data-text");
    const selection = text ? [active?.selectionStart, active?.selectionEnd] : null;
    modal.classList.add("draft-review");
    modal.innerHTML = `<div class="dr-shell"><header class="dr-bar">${worketBrand}<span>审阅</span><button data-review-action="close" aria-label="关闭" class="dr-close">×</button></header><fieldset class="dr-controls" ${busy ? "disabled" : ""}><div class="dr-title"><input id="definition-name" aria-label="工作名称" value="${escape(content.name)}" ${editMode ? "" : "readonly"}><span id="dr-count"></span>${draft.evolution ? `<button data-review-action="show-all">${onlyChanges ? "查看完整约定" : "只看变化"}</button>` : ""}<button id="edit-all" data-review-action="edit-all" aria-pressed="${editMode}" title="编辑名称、条目、必填和要求">${editMode ? "✓ 完成编辑" : "✎ 编辑全部"}</button></div>${editMode ? '<p class="dr-edit-hint">点文字修改 · 必填可切换</p>' : ""}<div id="definition-error" role="alert" hidden></div><main class="dr-content">${sourceNoticeHtml()}${draft.evolution ? `<p class="dr-meta" id="evolution-summary">${draft.evolution.changes.length} 项新增或变更 · ${draft.evolution.evidence.length} 项重复依据 · ${draft.evolution.ignored.length} 项本次/历史要求${draft.evolution.changes.length ? "" : " · 约定内容保持不变"}</p>${evolutionEvidenceHtml()}` : ""}${documentPreview ? `<section class="dr-settings"><h3>${escape(documentPreview.name)} · 采用新版条款</h3><p>当前条款：${escape(documentPreview.previousText)}</p><pre>${escape(documentPreview.text.split("\n").map((line, i) => `${i + 1}  ${line}`).join("\n"))}</pre><label>起始行<input id="doc-start-line" type="number" min="1" value="${documentPreview.previous.startLine}"></label><label>结束行<input id="doc-end-line" type="number" min="1" value="${documentPreview.previous.endLine}"></label><button data-review-action="adopt-document">采用所选行（保存到草稿）</button><button data-review-action="cancel-document">取消</button></section>` : ""}${definitionSections.filter(s => editMode || visibleItems(s).length || draft.issues.some(i => targets.get(i.id)?.section === s)).map(section => {
      const items = visibleItems(section);
      const deleted = sectionItems(draft.originalContent, section).filter(i => !sectionItems(content, section).some(n => n.key === i.key) && issuesAt(section, i.key).length);
      return `<section class="dr-group"><div class="dr-label"><span aria-hidden="true">${labels[section][0]}</span>${labels[section][1]}</div><div class="dr-items">${items.map(item => { const change = draft.evolution?.changes.find(c => c.address === `${section}.${item.key}`); return `${change ? `<p class="dr-meta">${({ ADD: "新增", DUPLICATE: "重复", REPLACES: "替代", SUPPLEMENTS: "补充", CONFLICT: "冲突" })[change.kind]}${change.previousText ? ` · 原要求：${escape(change.previousText)}` : ""}</p>` : ""}${rowHtml(item, { section, key: item.key })}`; }).join("")}${deleted.map(item => rowHtml(item, { section, key: item.key }, true)).join("")}<div data-issues-for="${section}">${issuesAt(section).map(issueHtml).join("")}</div>${editMode && section !== "purpose" ? `<button class="dr-add" data-review-action="add" data-section="${section}">＋ 添加${labels[section][1]}</button>` : ""}</div></section>`;
    }).join("")}${draft.issues.some(i => !targets.get(i.id)) ? `<section class="dr-unlinked"><h3>其他待定</h3><div data-issues-for="unlinked">${draft.issues.filter(i => !targets.get(i.id)).map(issueHtml).join("")}</div></section>` : ""}</main><footer class="dr-footer"><span id="dr-status"></span>${undo ? '<button class="dr-undo" data-review-action="undo">撤销</button>' : ""}<div><button id="save-draft" data-review-action="save">暂存</button><button id="publish-definition" data-review-action="publish" class="primary">${draft.evolution && !draft.evolution.changes.length ? "确认记录依据" : "确认保存"}</button></div></footer></fieldset><div class="dr-resize" role="separator" tabindex="0" aria-label="调整浮窗宽度" aria-orientation="vertical" title="拖动右边缘调宽"></div></div>`;
    modal.querySelector(".dr-content")!.scrollTop = scroll;
    updateStatus();
    modal.querySelectorAll<HTMLTextAreaElement>("textarea").forEach(fitTextarea);
    if (focus) {
      const el = modal.querySelector<HTMLInputElement>(`[data-address="${CSS.escape(focus)}"]${property ? `[data-property="${CSS.escape(property)}"]` : text ? "[data-text]" : ""}`);
      el?.focus({ preventScroll: true });
      if (selection && el instanceof HTMLTextAreaElement) el.setSelectionRange(selection[0] ?? 0, selection[1] ?? 0);
    }
    setupResize();
  }
  function fitTextarea(el: HTMLTextAreaElement) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; }
  function updateStatus(): void {
    const left = draft.issues.filter(i => !getResolution(i.id)).length;
    const button = modal.querySelector<HTMLButtonElement>("#publish-definition");
    if (!button) return;
    button.disabled = busy || editMode || left > 0 || !sources || !!sources.changes.length && confirmedSources !== sources.hash;
    modal.querySelector("#dr-count")!.textContent = left ? `${left} 项待定` : "待确认";
    modal.querySelector("#dr-status")!.textContent = busy ? "保存中…" : message || `${draft.issues.length - left}/${draft.issues.length} 已处理`;
    for (const host of modal.querySelectorAll<HTMLElement>("[data-issues-for]")) {
      // Preserve a free-form decision that has not yet been applied.
      const explanations = [...host.querySelectorAll<HTMLInputElement>("[data-explanation]")].map(el => [el.dataset.explanation!, el.value]);
      const key = host.dataset.issuesFor!;
      const matches = key === "unlinked" ? draft.issues.filter(i => !targets.get(i.id)) : draft.issues.filter(i => { const t = targets.get(i.id); return t && (t.key ? idOf(t as ItemAddress) : t.section) === key; });
      host.innerHTML = matches.map(issueHtml).join("");
      for (const [id, value] of explanations) { const input = host.querySelector<HTMLInputElement>(`[data-explanation="${CSS.escape(id!)}"]`); if (input) input.value = value!; }
    }
  }
  function error(error: unknown) {
    const el = modal.querySelector<HTMLElement>("#definition-error");
    if (el) { el.hidden = false; el.textContent = errorText(error); }
  }
  function validate(): void {
    if (!content.name.trim()) throw new Error("请填写工作名称");
    for (const section of definitionSections) {
      if (sectionItems(content, section).some(item => !item.text.trim())) throw new Error(`请填写${labels[section][1]}中的空白条目，或删除它`);
    }
    validateContent(content);
  }
  async function save() {
    validate();
    const next: Draft = await api("update", { draftId: draft.id, expectedRevision: draft.revision, content, issueResolutions: resolutions, replaceResolutions: true, materialBindings: bindings });
    draft = next; content = structuredClone(next.content); resolutions = structuredClone(next.resolutions); bindings = {};
    targets = issueTargets();
    undo = null; // Saved bindings now refer to fixed copies; old pending paths cannot be restored.
    savedState = signature(); message = "已暂存";
  }
  function close() {
    if (busy) return;
    if (signature() !== savedState && !window.confirm("修改尚未暂存，关闭将放弃这些修改。")) return;
    modal.close();
  }
  function removeItem(address: ItemAddress) {
    if (address.section === "purpose") return;
    const section = address.section;
    content[section] = content[section].filter(i => i.key !== address.key) as never;
    if (section === "materialRoles") delete bindings[address.key];
    for (const issue of draft.issues) {
      const target = targets.get(issue.id);
      if (target?.key && sameAddress(target, address)) resolve(issue, "DELETE", "不纳入这条要求");
    }
  }
  function decide(issue: Issue, action: string) {
    const t = targets.get(issue.id), item = t?.key ? sectionItems(content, t.section).find(i => i.key === t.key) as Item | undefined : undefined;
    const address = t?.key ? t as ItemAddress : undefined;
    if (action === "edit-issue") { editMode = true; render(); const el = address ? modal.querySelector<HTMLTextAreaElement>(`[data-text][data-address="${CSS.escape(idOf(address))}"]`) : null; el?.focus(); return; }
    undo = { content: structuredClone(content), resolutions: structuredClone(resolutions), bindings: { ...bindings } };
    if (action === "reopen") { resolutions = resolutions.filter(r => r.issueId !== issue.id); render(); return; }
    if (action === "choose-unlinked") {
      const explanation = modal.querySelector<HTMLInputElement>(`[data-explanation="${CSS.escape(issue.id)}"]`)!.value.trim();
      if (!explanation) throw new Error("请写明你的决定");
      resolve(issue, "CHOOSE", explanation); render(); return;
    }
    if (action === "accept") resolve(issue, "ACCEPT", "已阅读并知悉此提示");
    if (action === "adopt") {
      validate(); if (!fieldChanged(issue)) throw new Error("请先修改相关内容");
      resolve(issue, "REWRITE", `采用修改后的内容：${reviewFingerprint(reviewFieldValue(content, draft.originalContent, issue.field))}`);
    }
    if (item && address) {
      if (action === "keep" || action === "reference") {
        if (item.rule && item.rule.relation?.kind !== "CONFLICT") mutate(address, () => { item.rule!.scope = "REUSABLE"; item.rule!.status = "ACTIVE"; });
        if (address.section === "methods") {
          mutate(address, () => { item.obligation = action === "keep" ? "REQUIRED" : "REFERENCE"; });
        }
        resolve(issue, action === "reference" && fieldChanged(issue) ? "REWRITE" : "CHOOSE", `${action === "reference" ? "仅作参考" : "明确保留"}：${item.text}`);
      }
      if (action === "exclude") { mutate(address, () => {}); removeItem(address); }
      if (action === "optional") {
        mutate(address, () => {
          const key = `include_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
          content.inputs.push({ key, text: `是否交付：${item.text}`, valueType: "BOOLEAN", required: true, basis: { type: "INFERRED", refs: [], rationale: "用户在审阅中添加，保存时记录编辑依据" } });
          item.text = `仅当 {{${key}} 为“是”时交付：${item.text}`;
        });
        resolve(issue, "REWRITE", "已增加必填的是或否输入，按本次选择交付");
      }
    }
    render();
  }
  modal.addEventListener("input", event => {
    const el = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (el.dataset.explanation) { explanations.set(el.dataset.explanation, el.value); return; }
    if (el.id === "definition-name") { content.name = el.value; invalidate(); }
    else if (el.hasAttribute("data-text")) {
      const { item, address } = byAddress(el.dataset.address!);
      if (!item) return;
      item.text = el.value; invalidate(address); fitTextarea(el as HTMLTextAreaElement);
    } else return;
    undo = null; message = "未暂存"; updateStatus();
  }, { signal });
  modal.addEventListener("change", event => {
    const el = event.target as HTMLInputElement;
    if (el.id === 'source-review-confirm') { confirmedSources = el.checked ? sources?.hash : undefined; updateStatus(); return; }
    if (!el.dataset.property) return;
    const { item, address } = byAddress(el.dataset.address!); if (!item) return;
    mutate(address, () => {
      if (["scope", "status", "condition", "relation", "target"].includes(el.dataset.property!)) {
        item.rule ??= { scope: "REUSABLE", status: "ACTIVE" };
        if (el.dataset.property === "scope") item.rule.scope = el.value as RulePolicy["scope"];
        if (el.dataset.property === "status") item.rule.status = el.value as RulePolicy["status"];
        if (el.dataset.property === "condition") { if (el.value.trim()) item.rule.condition = el.value.trim(); else delete item.rule.condition; }
        if (el.dataset.property === "relation") { if (el.value) item.rule.relation = { kind: el.value as NonNullable<RulePolicy["relation"]>["kind"], target: item.rule.relation?.target ?? "" }; else delete item.rule.relation; }
        if (el.dataset.property === "target" && item.rule.relation) item.rule.relation.target = el.value.trim();
      }
      switch (el.dataset.property) {
        case "valueType": item.valueType = el.value as InputSpec["valueType"]; delete item.defaultValue; if (item.valueType !== "CHOICE") delete item.choices; else item.choices ??= []; break;
        case "choices": item.choices = el.value.split("\n").map(v => v.trim()).filter(Boolean); break;
        case "defaultValue": if (!el.value) delete item.defaultValue; else item.defaultValue = item.valueType === "BOOLEAN" ? el.value === "true" : item.valueType === "NUMBER" ? Number(el.value) : el.value; break;
      }
    }); render();
  }, { signal });
  modal.addEventListener("click", event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-review-action]");
    if (!button || busy) return;
    const action = button.dataset.reviewAction!, addressId = button.dataset.address;
    void (async () => {
      if (action === 'check-sources') { await checkSources(); render(); return; }
      if (action === "close") return close();
      if (action === "show-all") { onlyChanges = !onlyChanges; render(); return; }
      if (action === 'evolution-evidence' && draft.evolution) {
        const entry = [...draft.evolution.evidence, ...draft.evolution.ignored][Number(button.dataset.entry)];
        const ref = entry?.refs[Number(button.dataset.ref)];
        if (ref) { const text = await api('evidence', ref); const pre = document.createElement('pre'); pre.textContent = text; button.replaceWith(pre); }
        return;
      }
      if (action === "cancel-document") { documentPreview = null; render(); return; }
      if (action === "document-version") {
        await save();
        const path = await window.workpet.chooseDefinitionFile();
        if (!path) return;
        const preview = await api("previewDocumentRevision", { draftId: draft.id, address: button.dataset.address, path });
        if (!preview.changed) { message = "内容未变化，继续引用当前固定版本"; render(); return; }
        documentPreview = { ...preview, address: button.dataset.address!, path }; render(); return;
      }
      if (action === "adopt-document" && documentPreview) {
        const next = await api("adoptDocumentRevision", { draftId: draft.id, expectedRevision: draft.revision, address: documentPreview.address, path: documentPreview.path, expectedHash: documentPreview.hash, startLine: Number(modal.querySelector<HTMLInputElement>("#doc-start-line")!.value), endLine: Number(modal.querySelector<HTMLInputElement>("#doc-end-line")!.value) });
        draft = next; targets = issueTargets(); content = structuredClone(next.content); resolutions = structuredClone(next.resolutions); savedState = signature(); documentPreview = null; undo = null; message = "新版条款已保存到草稿，发布后用于新实例"; render(); return;
      }
      if (action === "edit-all") { if (editMode) validate(); editMode = !editMode; render(); return; }
      if (action === "undo" && undo) { ({ content, resolutions, bindings } = undo); undo = null; render(); return; }
      if (button.dataset.issue) { decide(draft.issues.find(i => i.id === button.dataset.issue)!, action); return; }
      if (action === "add") {
        const section = button.dataset.section as Exclude<DefinitionSection, "purpose">;
        const key = `item_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
        mutate({ section, key }, () => {
          const item: Item = { key, text: "", basis: { type: "INFERRED", refs: [], rationale: "用户新增，保存时记录编辑依据" } };
          if (section === "inputs") { item.valueType = "TEXT"; item.required = true; }
          if (section === "methods") item.obligation = "REFERENCE";
          if (section === "materialRoles") item.required = true;
          content[section].push(item as never);
        }); render(); modal.querySelector<HTMLTextAreaElement>(`[data-section="${section}"]:last-of-type [data-text]`)?.focus(); return;
      }
      if (addressId) {
        const { item, address } = byAddress(addressId);
        if (action === "evidence") { evidenceOpen.has(addressId) ? evidenceOpen.delete(addressId) : evidenceOpen.add(addressId); render(); return; }
        if (action === "load-evidence") {
          const original = sectionItems(draft.originalContent, address.section).find(i => i.key === address.key) ?? item;
          const ref: SourceRef | undefined = original?.basis.type !== "USER_AUTHORED" ? original?.basis.refs[Number(button.dataset.ref)] : undefined;
          if (ref) { button.disabled = true; evidenceCache.set(JSON.stringify(ref), await api("evidence", ref)); if (!closed) render(); } return;
        }
        if (!item) return;
        if (action === "settings") { settingsOpen.has(addressId) ? settingsOpen.delete(addressId) : settingsOpen.add(addressId); render(); return; }
        if (action === "toggle-property") mutate(address, () => { if (address.section === "methods") item.obligation = item.obligation === "REFERENCE" ? "REQUIRED" : "REFERENCE"; else item.required = !item.required; });
        if (action === "delete") { mutate(address, () => {}); removeItem(address); }
        if (action === "material-kind") mutate(address, () => { if (item.kind === "SKILL") delete item.kind; else item.kind = "SKILL"; delete bindings[item.key]; });
        if (action === "material") { const path = await window.workpet.chooseDefinitionFile(item.kind); if (closed) return; if (path) bindings[item.key] = path; }
        render(); return;
      }
      if (action === "save" || action === "publish") {
        if (action === "publish" && draft.issues.some(i => !getResolution(i.id))) throw new Error("请先处理待定事项");
        busy = true; render();
        try {
          await save();
          if (action === "publish") {
            if (draft.issues.some(i => !getResolution(i.id))) message = "修改影响了关联规则，请先处理新增待定事项";
            else {
              await checkSources();
              if (sources!.changes.length && confirmedSources !== sources!.hash) { message = '来源已有变化，请查看对照后确认'; busy = false; render(); return; }
              const definition = await api("publish", { ...(confirmedSources ? { sourceReviewHash: confirmedSources } : {}), draftId: draft.id, expectedRevision: draft.revision, materialBindings: bindings, commandId: crypto.randomUUID() });
              await onPublished(definition); return;
            }
          }
        } finally { busy = false; }
        render();
      }
    })().catch(async err => { busy = false; if (!closed) { if (String(err).includes('SOURCE_REVIEW_REQUIRED')) await checkSources().catch(() => {}); render(); error(err); } });
  }, { signal });
  modal.addEventListener("cancel", event => { event.preventDefault(); close(); }, { signal });
  let resizing = false, lastX = 0;
  function setupResize() {
    const handle = modal.querySelector<HTMLElement>(".dr-resize")!;
    handle.onpointerdown = event => { if (event.button !== 0) return; event.preventDefault(); resizing = true; lastX = event.screenX; handle.setPointerCapture(event.pointerId); window.workpet.resizePanelRight("start", lastX); };
    handle.onpointermove = event => { if (resizing) { lastX = event.screenX; window.workpet.resizePanelRight("move", lastX); } };
    const end = () => { if (resizing) window.workpet.resizePanelRight("end", lastX); resizing = false; };
    handle.onpointerup = end; handle.onpointercancel = end; handle.onlostpointercapture = end;
    handle.onkeydown = event => { if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return; event.preventDefault(); window.workpet.resizePanelRight("start", 0); window.workpet.resizePanelRight("move", event.key === "ArrowRight" ? 20 : -20); window.workpet.resizePanelRight("end", 0); };
  }
  function dispose() { if (closed) return; closed = true; abort.abort(); if (resizing) window.workpet.resizePanelRight("end", lastX); modal.classList.remove("draft-review"); }
  modal.addEventListener("close", dispose, { signal });
  render();
  if (draft.jobId) void checkSources().then(() => render()).catch(err => { if (!closed) error(err); });
  return dispose;
}
