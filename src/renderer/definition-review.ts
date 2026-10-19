import type { SourceReview } from '../definitions/source-review.js';
import { ruleSections, ruleItems, type RulePolicy } from "../contracts/rules.js";
import { validateContent, type DefinitionContent, type DefinedItem, type InputSpec, type Issue, type Resolution, type SourceRef } from "../contracts/definition.js";
import type { Draft, Definition } from "../definitions/repository.js";
import { definitionSections, resolveReviewField, reviewFieldValue, reviewFingerprint, sameAddress, sectionItems, type DefinitionSection, type ItemAddress } from "../definitions/review.js";
import { errorText } from "../distillation/activity.js";

import { definitionLabels as labels } from "./ui.js";
import { fillReviewConfirmation, reviewMotion, withdrawReviewRow } from "./definition-review-motion.js";
import { showPageHeader } from "./window-header.js";

const escape = (value: unknown) => String(value).replace(/[&<>"']/gu, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const idOf = (a: ItemAddress) => `${a.section}.${a.key}`;
const decisionIcon = (action: "confirm" | "delete") => `<span class="dr-icon dr-${action}" aria-hidden="true"><i class="dr-outline"></i><i class="dr-fill"><i class="dr-disc"></i><i class="dr-solid"></i></i></span>`;
type RemovedItem = { item: Item; index: number; path?: string };
type Api = (action: string, input?: unknown) => Promise<any>;
type Item = DefinedItem & Partial<Pick<InputSpec, "valueType" | "required" | "choices" | "defaultValue">> & { obligation?: "REFERENCE" | "REQUIRED"; kind?: "SKILL" };

/** The draft is local until save. Evidence remains tied to original keys, never row indices. */
export function mountDefinitionReview(modal: HTMLDialogElement, initial: Draft, api: Api, onPublished: (definition: Definition) => Promise<void>, onReturn?: (() => Promise<void>) | undefined): () => void {
  modal.oncancel = null;
  let draft = initial, content = structuredClone(initial.content), resolutions = structuredClone(initial.resolutions);
  let bindings: Record<string, string> = {}, editMode = false, busy = false, closed = false;
  let onlyChanges = !!initial.evolution;
  let sources: SourceReview | null = initial.jobId ? null : { hash: '', changes: [] };
  let confirmedSources: string | undefined;
  let confirmed = new Set<string>();
  let removed = new Map<string, RemovedItem>();
  const rowOpen = new Set<string>(), historyOpen = new Set<string>(), evidenceOpen = new Set<string>();
  const withdrawals = new Map<string, ReturnType<typeof withdrawReviewRow>>();
  let undo: { content: DefinitionContent; resolutions: Resolution[]; bindings: Record<string, string>; confirmed: Set<string>; removed: Map<string, RemovedItem> } | null = null;
  let savedState = "", message = "";
  let documentPreview: { address: string; path: string; text: string; hash: string; previousText: string; name: string; previous: { startLine: number; endLine: number } } | null = null;
  const ruleSettingsOpen = new Set<string>();
  const evidenceCache = new Map<string, string>();
  const abort = new AbortController(), signal = abort.signal;
  const issueTargets = () => new Map(draft.issues.map(issue => [issue.id, resolveReviewField(draft.originalContent, issue.field, draft.content)]));
  let targets = issueTargets();
  const signature = () => JSON.stringify({ content, resolutions, bindings });
  savedState = signature();
  for (const section of definitionSections) {
    if (section === "purpose") continue;
    sectionItems(draft.originalContent, section).forEach((item, index) => {
      if (!sectionItems(content, section).some(next => next.key === item.key)) removed.set(`${section}.${item.key}`, { item: structuredClone(item), index });
    });
  }
  function remember() { undo = { content: structuredClone(content), resolutions: structuredClone(resolutions), bindings: { ...bindings }, confirmed: new Set(confirmed), removed: structuredClone(removed) }; }
  function stopWithdrawals() { withdrawals.forEach(animation => animation.cancel()); withdrawals.clear(); }

  const byAddress = (address: string): { address: ItemAddress; item: Item | undefined } => {
    const [section, key] = address.split(".") as [DefinitionSection, string];
    return { address: { section, key }, item: sectionItems(content, section).find(i => i.key === key) };
  };
  const issuesAt = (section: DefinitionSection, key?: string) => draft.issues.filter(issue => {
    const t = targets.get(issue.id);
    return t?.section === section && t.key === key;
  });
  const isUnplaced = (issue: Issue) => {
    const target = targets.get(issue.id);
    return !target || !!target.key && !sectionItems(content, target.section).some(item => item.key === target.key);
  };
  const getResolution = (id: string) => resolutions.find(r => r.issueId === id);
  const fieldChanged = (issue: Issue) => reviewFingerprint(reviewFieldValue(content, draft.originalContent, issue.field)) !== reviewFingerprint(reviewFieldValue(draft.originalContent, draft.originalContent, issue.field));
  function invalidate(address?: ItemAddress) {
    if (address) confirmed.delete(idOf(address));
    resolutions = resolutions.filter(r => {
      const target = targets.get(r.issueId);
      return address ? !!target && !sameAddress(target, address) : !!target;
    });
  }
  function mutate(address: ItemAddress | undefined, action: () => void) {
    remember();
    action(); invalidate(address); message = "";
  }
  function resolve(issue: Issue, action: Resolution["action"], explanation: string) {
    resolutions = resolutions.filter(r => r.issueId !== issue.id);
    resolutions.push({ issueId: issue.id, action, explanation });
  }
  function issueHtml(issue: Issue): string {
    const resolution = getResolution(issue.id), target = isUnplaced(issue) ? null : targets.get(issue.id);
    const item = target?.key ? sectionItems(content, target.section).find(i => i.key === target.key) as Item | undefined : undefined;
    if (resolution) return `<div class="dr-issue dr-resolved" data-issue="${escape(issue.id)}"><p>${escape(issue.message)}</p><span title="${escape(resolution.explanation)}">✓ ${escape(resolution.action === "DELETE" ? "已删除" : resolution.action === "REWRITE" ? "已采用修改" : resolution.action === "ACCEPT" ? "已记录提示" : "已确认")}</span><button data-review-action="reopen" data-issue="${escape(issue.id)}" aria-label="重新决定：${escape(issue.message)}">修改</button></div>`;
    const isMethod = item && target?.section === "methods";
    return `<div class="dr-issue" data-issue="${escape(issue.id)}"><p>${escape(issue.message)}</p><div class="dr-choices">${item && issue.blocking ? `<button data-review-action="keep" data-issue="${escape(issue.id)}">${isMethod ? "必须遵循" : "保留此项"}</button>${isMethod ? `<button data-review-action="reference" data-issue="${escape(issue.id)}">仅供参考</button>` : ""}${target?.section !== "purpose" ? `<button data-review-action="exclude" data-issue="${escape(issue.id)}">删除</button>` : ""}` : ""}${issue.blocking ? `<button data-review-action="edit-issue" data-issue="${escape(issue.id)}">${target ? "编辑" + labels[target.section][1] : "编辑内容"}</button>` : ""}${issue.blocking && fieldChanged(issue) ? `<button data-review-action="adopt" data-issue="${escape(issue.id)}">采用修改</button>` : ""}${issue.blocking && !target ? `<button data-review-action="choose-unlinked" data-issue="${escape(issue.id)}">按当前条款保留</button>` : ""}</div>${!issue.blocking ? '<span class="dr-meta">提示仅供核对，保存时自动记录</span>' : !target ? '<span class="dr-meta">保留当前条款，不会新增或修改内容</span>' : !item && !fieldChanged(issue) ? '<span class="dr-meta">修改相关内容后确认</span>' : ""}</div>`;
  }
  function evidenceHtml(item: DefinedItem, address: ItemAddress): string {
    // Saving edits replaces basis with USER_AUTHORED. Retain original evidence for inspection.
    const original = sectionItems(draft.originalContent, address.section).find(i => i.key === address.key) ?? item;
    const basis = original.basis;
    return `<div class="dr-evidence"><span>${basis.type === "SOURCE" ? { USER_STATED: "用户原话", AGENT_PROPOSED: "AI 提议", SYSTEM_INFERRED: "系统推断", DOCUMENT_STATED: "已采用规范" }[basis.origin] : basis.type === "INFERRED" ? "系统推断" : "用户编写"}</span>${basis.type !== "USER_AUTHORED" ? basis.refs.map((ref, i) => {
      const cacheKey = JSON.stringify(ref);
      return `<div>${ref.role === "CONTEXT" ? '<span class="dr-meta">背景引用（不作为直接依据）</span>' : basis.refs.some(r => r.role === "CONTEXT") ? '<span class="dr-meta">直接依据</span>' : ""}${ref.excerpt ? `<blockquote>${escape(ref.excerpt)}</blockquote>` : ""}${ref.deleted ? '<p>来源已删除</p>' : evidenceCache.has(cacheKey) ? `<pre>${escape(evidenceCache.get(cacheKey))}</pre>` : `<button data-review-action="load-evidence" data-address="${escape(idOf(address))}" data-ref="${i}">查看原文${basis.refs.length > 1 ? ` ${i + 1}` : ""}</button>`}</div>`;
    }).join("") : ""}</div>`;
  }
  function ruleHtml(item: Item, address: ItemAddress): string {
    if (!(ruleSections as readonly string[]).includes(address.section)) return "";
    const r = item.rule ?? { scope: "REUSABLE", status: "ACTIVE" };
    const meta = `${({ REUSABLE: "同类工作", INSTANCE: "仅原实例", UNCERTAIN: "范围待确认" })[r.scope]} · ${({ ACTIVE: "有效", PROPOSED: "未采纳", RETIRED: "历史" })[r.status]}`;
    const source = item.document ? `${item.document.name} L${item.document.startLine}–${item.document.endLine} · ${item.document.hash.slice(0, 10)}` : "";
    if (!editMode && r.scope === "REUSABLE" && r.status === "ACTIVE" && !r.condition && !r.relation && !item.document) return "";
    if (!editMode) return `<p class="dr-meta">${escape(meta)}${r.condition ? ` · 当 ${escape(r.condition)}` : ""}${r.relation ? ` · ${({ DUPLICATE: "合并到", SUPPLEMENTS: "补充", REPLACES: "替代", CONFLICT: "冲突于" })[r.relation.kind]} ${escape(ruleItems(content).find(row => row.address === r.relation!.target)?.item.text ?? r.relation.target)}` : ""}${source ? ` · ${escape(source)}` : ""}</p>${item.document ? `<button data-review-action="document-version" data-address="${escape(idOf(address))}">检查 / 更新规范版本</button>` : ""}`;
    const id = escape(idOf(address));
    const select = (prop: string, value: string, entries: string[][]) => `<select data-property="${prop}" data-address="${id}">${entries.map(([v,l]) => `<option value="${v}" ${value === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
    return `<details class="dr-rule-settings" data-rule-settings="${id}" ${ruleSettingsOpen.has(idOf(address)) ? 'open' : ''}><summary>适用条件与规则</summary><div class="dr-settings"><label>适用范围${select("scope",r.scope, [["REUSABLE","同类工作"],["INSTANCE","仅原实例"],["UNCERTAIN","待确认"]])}</label><label>状态${select("status",r.status,[["ACTIVE","有效"],["PROPOSED","未采纳"],["RETIRED","历史"]])}</label><label>适用条件<input data-property="condition" data-address="${id}" value="${escape(r.condition ?? "")}"></label><label>与已有规则的关系${select("relation",r.relation?.kind ?? "", [["","独立"],["DUPLICATE","重复"],["SUPPLEMENTS","补充"],["REPLACES","替代"],["CONFLICT","冲突"]])}</label>${r.relation ? `<label>对应规则<select data-property="target" data-address="${id}"><option value="">选择规则</option>${ruleItems(content).filter(row => row.address !== idOf(address)).map(row => `<option value="${escape(row.address)}" ${row.address === r.relation?.target ? "selected" : ""}>${escape(row.item.text)}</option>`).join("")}</select></label>` : ""}<span>${source ? escape(source) : ""}</span></div></details>`;
  }
  function settingsHtml(item: Item, address: ItemAddress): string {
    if (address.section !== "inputs") return "";
    const id = escape(idOf(address));
    const types = ["TEXT", "NUMBER", "BOOLEAN", "CHOICE", "FILE"] as const;
    const typeNames = { TEXT: "文本", NUMBER: "数字", BOOLEAN: "是或否", CHOICE: "选项", FILE: "文件" };
    const typeSelect = `<select data-property="valueType" data-address="${id}">${types.map(type => `<option value="${type}" ${item.valueType === type ? "selected" : ""}>${typeNames[type]}</option>`).join("")}</select>`;
    const defaultField = item.valueType === "FILE" ? "" : `<label>默认值${item.valueType === "BOOLEAN" ? `<select data-property="defaultValue" data-address="${id}"><option value="" ${item.defaultValue === undefined ? "selected" : ""}>不设默认值</option><option value="true" ${item.defaultValue === true ? "selected" : ""}>是</option><option value="false" ${item.defaultValue === false ? "selected" : ""}>否</option></select>` : `<input data-property="defaultValue" data-address="${id}" value="${escape(item.defaultValue ?? "")}" ${item.valueType === "NUMBER" ? 'type="number"' : ""}>`}</label>`;
    const choicesField = item.valueType === "CHOICE" ? `<label class="dr-input-choices">可选值（每行一项）<textarea data-property="choices" data-address="${id}">${escape(item.choices?.join("\n") ?? "")}</textarea></label>` : "";
    return `<div class="dr-settings dr-input-settings${item.valueType === "FILE" ? " dr-input-settings-file" : ""}"><label>输入类型${typeSelect}</label>${defaultField}${choicesField}<div class="dr-input-footer"><span class="dr-meta">变量：{{${escape(item.key)}}}</span><button class="dr-required-toggle" data-review-action="toggle-property" data-address="${id}" role="switch" aria-checked="${!!item.required}"><span class="dr-switch" aria-hidden="true"></span>必填</button></div></div>`;
  }
  function materialPath(item: Item): string | undefined {
    return bindings[item.key] ?? draft.materials?.find(m => m.role === item.key && !!m.bundle === (item.kind === "SKILL"))?.originalPath;
  }
  function isConfirmed(address: ItemAddress): boolean {
    const related = issuesAt(address.section, address.key);
    return related.length ? related.every(issue => !!getResolution(issue.id) && getResolution(issue.id)?.action !== "DELETE") : confirmed.has(idOf(address));
  }
  function rowHtml(item: Item, address: ItemAddress, deleted = false): string {
    const id = idOf(address), related = issuesAt(address.section, address.key);
    const pending = related.some(issue => issue.blocking && !getResolution(issue.id));
    const material = address.section === "materialRoles", input = address.section === "inputs";
    const path = material ? deleted ? removed.get(id)?.path : materialPath(item) : undefined;
    const text = path ? path.split(/[\\/]/u).at(-1)! : item.text;
    const open = rowOpen.has(id) || editMode;
    const status = deleted ? "deleted" : isConfirmed(address) ? "confirmed" : "pending";
    const textField = `<textarea class="dr-text" rows="1" data-text data-address="${escape(id)}" aria-label="${escape(labels[address.section][1])}条目">${escape(item.text)}</textarea>`;
    const rowText = editMode && !deleted ? textField : `<button class="dr-body" data-review-action="details" data-address="${escape(id)}" aria-expanded="${open}" aria-controls="detail-${escape(id)}"><span class="dr-copy"><span class="dr-text-read">${escape(text)}</span><span class="dr-strike" aria-hidden="true">${escape(text)}</span></span></button>`;
    return `<div class="dr-item" data-section="${address.section}" data-key="${escape(item.key)}" data-review-status="${status}"><div class="dr-item-inner"><div class="dr-row">${rowText}<div class="dr-actions">${pending && !deleted ? '<span class="dr-pending-label">待处理</span>' : ""}<button class="dr-decision" data-review-action="confirm" data-address="${escape(id)}" aria-label="${deleted ? "恢复并确认" : "确认"}：${escape(text)}" aria-pressed="${status === "confirmed"}">${decisionIcon("confirm")}</button>${address.section !== "purpose" ? `<button class="dr-decision" data-review-action="delete" data-address="${escape(id)}" aria-label="删除：${escape(text)}" aria-pressed="${deleted}">${decisionIcon("delete")}</button>` : ""}</div></div>${open ? `<div class="dr-detail" id="detail-${escape(id)}">${path ? `<code class="dr-path">${escape(path)}</code>` : ""}${!deleted ? `${material && path && !editMode ? `<p class="dr-meta">${escape(item.text)}</p>` : ""}${editMode ? "" : textField}${!input && (material || address.section === "methods") ? `<button data-review-action="toggle-property" data-address="${escape(id)}" class="dr-meta-toggle">${material ? item.required ? "必需" : "可选" : item.obligation === "REQUIRED" ? "必须遵循" : "仅供参考"}</button>` : ""}${input ? settingsHtml(item, address) : ""}${ruleHtml(item, address)}${material ? `<div class="dr-material">${editMode ? `<button data-review-action="material-kind" data-address="${escape(id)}">${item.kind === "SKILL" ? "技能目录" : "资料文件"}</button>` : ""}<button data-review-action="material" data-address="${escape(id)}">${path ? "更换资料" : item.kind === "SKILL" ? "选择技能目录" : "选择资料"}</button></div>` : ""}<details class="dr-evidence" data-evidence-id="${escape(id)}" ${evidenceOpen.has(id) ? "open" : ""}><summary>来源依据</summary>${evidenceHtml(item, address)}</details><div data-issues-for="${escape(id)}">${related.map(issueHtml).join("")}</div>` : ""}</div>` : ""}</div></div>`;
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
    if (!sources.changes.length) return '';
    const statuses = { REVISED: '已修订', PENDING: '暂未找到，待复核', ABSENT: '已不在当前来源', UNAVAILABLE: '当前记录不可用' };
    return `<section id="source-review-notice" class="dr-source-notice"><p>${sources.changes.length} 条聊天来源已变化，候选仍基于提交时的原文。</p><details><summary>查看变化</summary>${sources.changes.map(change => `<div class="dr-evidence"><p>${escape(change.title)} · ${statuses[change.status]}</p><span>提交时</span><pre>${escape(change.before)}</pre>${change.current !== undefined ? `<span>当前已同步内容</span><pre>${escape(change.current)}</pre>` : ''}</div>`).join('')}<p class="dr-meta">仅对照已同步记录。可修改候选，或关闭后重新选择范围提炼。</p></details><label><input id="source-review-confirm" type="checkbox" ${confirmedSources === sources.hash ? 'checked' : ''}>已查看变化，仍采用当前候选</label><button data-review-action="check-sources">重新核对</button></section>`;
  }
  function reviewGroups(): string {
    const groups: { key: string; english: string; label: string; sections: DefinitionSection[] }[] = [
      { key: "inputs", english: "Input", label: "输入", sections: ["inputs"] },
      { key: "deliverables", english: "Output", label: "输出", sections: ["deliverables"] },
      { key: "materialRoles", english: "Reference Documents", label: "参考文档", sections: ["materialRoles"] },
      { key: "constraints", english: "Constraints", label: "约束", sections: ["constraints", "acceptanceCriteria", "methods"] },
    ];
    if (editMode || [...issuesAt("purpose"), ...issuesAt("purpose", content.purpose.key)].some(issue => !getResolution(issue.id))) groups.push({ key: "purpose", english: "Purpose", label: "工作目的", sections: ["purpose"] });
    const belongs = (section: DefinitionSection, item: Item) => section !== "methods" || editMode || item.obligation === "REQUIRED" || issuesAt(section, item.key).some(issue => !getResolution(issue.id));
    const sectionsHtml = groups.map(group => {
      const deleted = [...removed].filter(([id, entry]) => group.sections.includes(byAddress(id).address.section) && belongs(byAddress(id).address.section, entry.item));
      const body = group.sections.map(section => {
        const items = visibleItems(section).filter(item => belongs(section, item));
        const rows = items.map(item => ({ item, deleted: false, index: sectionItems(draft.originalContent, section).findIndex(original => original.key === item.key) }));
        if (historyOpen.has(group.key)) for (const [id, entry] of deleted.sort((a, b) => a[1].index - b[1].index)) if (byAddress(id).address.section === section) rows.splice(Math.min(entry.index, rows.length), 0, { item: entry.item, deleted: true, index: entry.index });
        return `${rows.map(row => rowHtml(row.item, { section, key: row.item.key }, row.deleted)).join("")}<div data-issues-for="${section}">${issuesAt(section).map(issueHtml).join("")}</div>${editMode && section !== "purpose" ? `<button class="dr-add" data-review-action="add" data-section="${section}">＋ ${section === "acceptanceCriteria" ? "添加完成要求" : section === "methods" ? "添加执行要求" : "添加" + labels[section][1]}</button>` : ""}`;
      }).join("");
      return `<section class="dr-group" data-review-group="${group.key}"><div class="dr-group-title"><h3>${group.english}<span>${group.label}</span></h3>${deleted.length ? `<button class="dr-history" data-review-action="history" data-group="${group.key}" aria-label="${historyOpen.has(group.key) ? "收起" : "查看"}${group.label}中已删除的条目" aria-expanded="${historyOpen.has(group.key)}"><i aria-hidden="true"></i></button>` : ""}</div><div class="dr-items">${body}</div></section>`;
    }).join("");
    const unplaced = draft.issues.filter(isUnplaced);
    return `${sectionsHtml}${unplaced.length ? `<section class="dr-unlinked"><h3>${unplaced.some(issue => issue.blocking && !getResolution(issue.id)) ? "其他待定" : unplaced.every(issue => !issue.blocking) ? "其他提示" : "其他记录"}</h3><div data-issues-for="unlinked">${unplaced.map(issueHtml).join("")}</div></section>` : ""}`;
  }
  function render(): void {
    if (closed) return;
    if (withdrawals.size) { updateStatus(); return; }
    for (const details of modal.querySelectorAll<HTMLDetailsElement>("[data-evidence-id]")) {
      if (details.open) evidenceOpen.add(details.dataset.evidenceId!); else evidenceOpen.delete(details.dataset.evidenceId!);
    }
    modal.style.setProperty("--dr-mark", `${reviewMotion.mark}ms`);
    const scroll = modal.querySelector(".dr-content")?.scrollTop ?? 0;
    const active = document.activeElement as HTMLInputElement | null;
    const focus = active?.dataset.address, property = active?.dataset.property, text = active?.hasAttribute("data-text");
    const selection = text ? [active?.selectionStart, active?.selectionEnd] : null;
    modal.classList.add("draft-review");
    modal.innerHTML = `<div class="dr-shell"><div class="window-header-slot"></div><fieldset class="dr-controls" ${busy ? "disabled" : ""}><div class="dr-title"><input id="definition-name" aria-label="工作名称" value="${escape(content.name)}" ${editMode ? "" : "readonly"}>${draft.evolution ? `<button data-review-action="show-all">${onlyChanges ? "查看完整约定" : "只看变化"}</button>` : ""}<button id="edit-all" data-review-action="edit-all" aria-pressed="${editMode}" title="编辑名称、条目、必填和要求">${editMode ? "✓ 完成编辑" : "✎ 编辑全部"}</button></div><div id="definition-error" role="alert" hidden></div><main class="dr-content">${sourceNoticeHtml()}${draft.evolution ? `<p class="dr-meta" id="evolution-summary">${draft.evolution.changes.length} 项新增或变更 · ${draft.evolution.evidence.length} 项重复依据 · ${draft.evolution.ignored.length} 项本次/历史要求${draft.evolution.changes.length ? "" : " · 约定内容保持不变"}</p>${evolutionEvidenceHtml()}` : ""}${documentPreview ? `<section class="dr-settings"><h3>${escape(documentPreview.name)} · 采用新版条款</h3><p>当前条款：${escape(documentPreview.previousText)}</p><pre>${escape(documentPreview.text.split("\n").map((line, i) => `${i + 1}  ${line}`).join("\n"))}</pre><label>起始行<input id="doc-start-line" type="number" min="1" value="${documentPreview.previous.startLine}"></label><label>结束行<input id="doc-end-line" type="number" min="1" value="${documentPreview.previous.endLine}"></label><button data-review-action="adopt-document">采用所选行（保存到草稿）</button><button data-review-action="cancel-document">取消</button></section>` : ""}${reviewGroups()}</main><footer class="dr-footer"><span id="dr-status"></span><button id="dr-pending" data-review-action="show-pending" hidden></button><button class="dr-undo" data-review-action="undo" ${undo ? "" : "hidden"}>撤销</button><div><button id="save-draft" data-review-action="save">暂存</button><button id="publish-definition" data-review-action="publish" class="primary">${draft.evolution && !draft.evolution.changes.length ? "确认记录依据" : "确认保存"}</button></div></footer></fieldset><div class="dr-resize" role="separator" tabindex="0" aria-label="调整浮窗宽度" aria-orientation="vertical" title="拖动右边缘调宽"></div></div>`;
    showPageHeader({ dialog: modal, label: onReturn ? "返回契约" : "返回工作面板", back: close, beforeNavigate: preserveDraft });
    modal.querySelector(".dr-content")!.scrollTop = scroll;
    updateStatus();
    modal.querySelectorAll<HTMLTextAreaElement>("textarea").forEach(fitTextarea);
    if (focus) {
      const el = modal.querySelector<HTMLInputElement>(`[data-address="${CSS.escape(focus)}"]${property ? `[data-property="${CSS.escape(property)}"]` : text ? "[data-text]" : ""}`);
      el?.focus({ preventScroll: true });
      if (selection && el instanceof HTMLTextAreaElement) el.setSelectionRange(selection[0] ?? 0, selection[1] ?? 0);
    }
    modal.querySelectorAll<HTMLDetailsElement>('[data-rule-settings]').forEach(details => {
      details.addEventListener('toggle', () => {
        if (details.open) ruleSettingsOpen.add(details.dataset.ruleSettings!); else ruleSettingsOpen.delete(details.dataset.ruleSettings!);
      }, { signal });
    });
    setupResize();
  }
  function fitTextarea(el: HTMLTextAreaElement) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; }
  function updateStatus(): void {
    const left = draft.issues.filter(i => i.blocking && !getResolution(i.id)).length;
    const button = modal.querySelector<HTMLButtonElement>("#publish-definition");
    if (!button) return;
    button.disabled = busy || editMode || left > 0 || !sources || !!sources.changes.length && confirmedSources !== sources.hash;
    modal.querySelector("#dr-status")!.textContent = busy ? "保存中…" : message;
    const pendingButton = modal.querySelector<HTMLButtonElement>("#dr-pending")!;
    pendingButton.hidden = left === 0;
    pendingButton.textContent = left ? `查看 ${left} 项待定` : "";
    modal.querySelector<HTMLButtonElement>('[data-review-action="undo"]')!.hidden = !undo;
    for (const row of modal.querySelectorAll<HTMLElement>(".dr-item")) {
      if (row.dataset.reviewStatus === "deleted") continue;
      const address = { section: row.dataset.section as DefinitionSection, key: row.dataset.key! };
      row.dataset.reviewStatus = isConfirmed(address) ? "confirmed" : "pending";
      row.querySelector('[data-review-action="confirm"]')?.setAttribute("aria-pressed", String(isConfirmed(address)));
    }
    for (const host of modal.querySelectorAll<HTMLElement>("[data-issues-for]")) {
      const key = host.dataset.issuesFor!;
      const matches = key === "unlinked" ? draft.issues.filter(isUnplaced) : draft.issues.filter(i => { const t = targets.get(i.id); return !isUnplaced(i) && t && (t.key ? idOf(t as ItemAddress) : t.section) === key; });
      host.innerHTML = matches.map(issueHtml).join("");
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
  async function preserveDraft() {
    if (busy) throw new Error("正在保存，请稍后返回。");
    if (signature() === savedState) return;
    busy = true;
    const controls = modal.querySelector<HTMLFieldSetElement>(".dr-controls")!;
    controls.disabled = true;
    try { await save(); } finally { busy = false; controls.disabled = false; }
  }
  async function close() {
    await preserveDraft();
    if (onReturn) await onReturn(); else modal.close();
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
  function confirmRow(address: ItemAddress) {
    const id = idOf(address), entry = removed.get(id);
    if (withdrawals.has(id)) { withdrawals.get(id)!.cancel(); withdrawals.delete(id); }
    remember();
    if (entry && address.section !== "purpose") {
      const original = sectionItems(draft.originalContent, address.section);
      const nextIndex = content[address.section].findIndex(item => original.findIndex(row => row.key === item.key) > entry.index);
      content[address.section].splice(nextIndex < 0 ? content[address.section].length : nextIndex, 0, structuredClone(entry.item) as never);
      if (address.section === "materialRoles" && entry.path && !draft.materials?.some(m => m.role === address.key)) bindings[address.key] = entry.path;
      removed.delete(id);
    }
    const item = byAddress(id).item;
    if (!item) return;
    invalidate(address);
    if (item.rule && item.rule.relation?.kind !== "CONFLICT") { item.rule.scope = "REUSABLE"; item.rule.status = "ACTIVE"; }
    for (const issue of issuesAt(address.section, address.key)) resolve(issue, fieldChanged(issue) ? "REWRITE" : "CHOOSE", `确认：${item.text}`);
    confirmed.add(id); message = "";
    closeCompletedHistory();
    render();
    const row = modal.querySelector<HTMLElement>(`.dr-item[data-section="${address.section}"][data-key="${CSS.escape(address.key)}"]`);
    if (row && !withdrawals.size) fillReviewConfirmation(row);
  }
  function closeCompletedHistory() {
    if (definitionSections.every(section => sectionItems(content, section).every(item => section === "purpose" || section === "methods" && (item as Item).obligation === "REFERENCE" || isConfirmed({ section, key: item.key })))) historyOpen.clear();
  }
  function showPendingIssue() {
    const issue = draft.issues.find(item => item.blocking && !getResolution(item.id));
    if (!issue) return;
    const target = isUnplaced(issue) ? null : targets.get(issue.id);
    if (target?.key) rowOpen.add(idOf(target as ItemAddress));
    render();
    const issueElement = modal.querySelector<HTMLElement>(`.dr-issue[data-issue="${CSS.escape(issue.id)}"]`);
    issueElement?.scrollIntoView({ block: "center", behavior: "smooth" });
    issueElement?.querySelector<HTMLButtonElement>(".dr-choices button")?.focus({ preventScroll: true });
  }
  function deleteRow(address: ItemAddress) {
    const id = idOf(address), item = byAddress(id).item;
    if (!item || address.section === "purpose") return;
    remember();
    const path = address.section === "materialRoles" ? materialPath(item) : undefined;
    removed.set(id, { item: structuredClone(item), index: Math.max(0, sectionItems(draft.originalContent, address.section).findIndex(row => row.key === item.key)), ...(path ? { path } : {}) });
    invalidate(address); removeItem(address); rowOpen.delete(id); message = "";
    const row = modal.querySelector<HTMLElement>(`.dr-item[data-section="${address.section}"][data-key="${CSS.escape(address.key)}"]`);
    if (!row) { render(); return; }
    row.dataset.reviewStatus = "deleted";
    row.querySelector('[data-review-action="confirm"]')!.setAttribute("aria-pressed", "false");
    row.querySelector('[data-review-action="delete"]')!.setAttribute("aria-pressed", "true");
    if (editMode) { render(); return; }
    const animation = withdrawReviewRow(row); withdrawals.set(id, animation); updateStatus();
    void animation.finished.then(done => {
      if (withdrawals.get(id) !== animation || closed) return;
      withdrawals.delete(id);
      if (done) row.hidden = true;
      closeCompletedHistory();
      render();
    });
  }
  function decide(issue: Issue, action: string) {
    const t = isUnplaced(issue) ? null : targets.get(issue.id), item = t?.key ? sectionItems(content, t.section).find(i => i.key === t.key) as Item | undefined : undefined;
    const address = t?.key ? t as ItemAddress : undefined;
    if (action === "edit-issue") { if (address) rowOpen.add(idOf(address)); editMode = true; render(); const el = address ? modal.querySelector<HTMLTextAreaElement>(`[data-text][data-address="${CSS.escape(idOf(address))}"]`) : null; el?.focus(); return; }
    remember();
    if (action === "reopen") { if (address) confirmed.delete(idOf(address)); resolutions = resolutions.filter(r => r.issueId !== issue.id); render(); return; }
    if (action === "choose-unlinked") {
      resolve(issue, "CHOOSE", "按当前条款保留；未新增或修改内容"); render(); return;
    }
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
      if (action === "exclude") { deleteRow(address); return; }

    }
    render();
  }
  modal.addEventListener("input", event => {
    const el = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (el.id === "definition-name") { content.name = el.value; invalidate(); }
    else if (el.hasAttribute("data-text")) {
      const { item, address } = byAddress(el.dataset.address!);
      if (!item) return;
      item.text = el.value; invalidate(address);
      const row = el.closest(".dr-item")!;
      if (address.section !== "materialRoles" || !materialPath(item)) row.querySelectorAll(".dr-text-read,.dr-strike").forEach(copy => { copy.textContent = item.text; });
      fitTextarea(el as HTMLTextAreaElement);
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
      if (action === "show-pending") { showPendingIssue(); return; }
      if (action === "history") { const group = button.dataset.group!; historyOpen.has(group) ? historyOpen.delete(group) : historyOpen.add(group); render(); return; }
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
      if (action === "edit-all") { stopWithdrawals(); if (editMode) validate(); editMode = !editMode; render(); return; }
      if (action === "undo" && undo) { stopWithdrawals(); ({ content, resolutions, bindings, confirmed, removed } = undo); undo = null; render(); return; }
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
        if (action === "details") { rowOpen.has(addressId) ? rowOpen.delete(addressId) : rowOpen.add(addressId); render(); return; }
        if (action === "confirm") { confirmRow(address); return; }
        if (action === "delete") { deleteRow(address); return; }
        if (action === "load-evidence") {
          const original = sectionItems(draft.originalContent, address.section).find(i => i.key === address.key) ?? item;
          const ref: SourceRef | undefined = original?.basis.type !== "USER_AUTHORED" ? original?.basis.refs[Number(button.dataset.ref)] : undefined;
          if (ref) { button.disabled = true; evidenceCache.set(JSON.stringify(ref), await api("evidence", ref)); if (!closed) render(); } return;
        }
        if (!item) return;
        if (action === "toggle-property") mutate(address, () => { if (address.section === "methods") item.obligation = item.obligation === "REFERENCE" ? "REQUIRED" : "REFERENCE"; else item.required = !item.required; });
        if (action === "material-kind") mutate(address, () => { if (item.kind === "SKILL") delete item.kind; else item.kind = "SKILL"; delete bindings[item.key]; });
        if (action === "material") { const path = await window.workpet.chooseDefinitionFile(item.kind); if (closed) return; if (path) mutate(address, () => { bindings[item.key] = path; }); }
        render(); return;
      }
      if (action === "save" || action === "publish") {
        if (action === "publish" && draft.issues.some(i => i.blocking && !getResolution(i.id))) throw new Error("请先处理待定事项");
        if (action === "publish") for (const issue of draft.issues) if (!issue.blocking && !getResolution(issue.id)) resolve(issue, "ACCEPT", "非阻断提示已自动记录；按已确认的条款保存");
        stopWithdrawals(); historyOpen.clear(); busy = true; render();
        try {
          await save();
          if (action === "publish") {
            const pending = draft.issues.filter(i => !getResolution(i.id));
            if (pending.some(i => i.blocking)) message = "修改影响了关联规则，请先处理新增待定事项";
            else {
              for (const issue of pending) resolve(issue, "ACCEPT", "非阻断提示已自动记录；按已确认的条款保存");
              if (pending.length) await save();
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
  modal.addEventListener("cancel", event => { event.preventDefault(); modal.querySelector<HTMLButtonElement>("#window-back")?.click(); }, { signal });
  let resizing = false, lastX = 0;
  function setupResize() {
    const handle = modal.querySelector<HTMLElement>(".dr-resize")!;
    handle.onpointerdown = event => { if (event.button !== 0) return; event.preventDefault(); resizing = true; lastX = event.screenX; handle.setPointerCapture(event.pointerId); window.workpet.resizePanelRight("start", lastX); };
    handle.onpointermove = event => { if (resizing) { lastX = event.screenX; window.workpet.resizePanelRight("move", lastX); } };
    const end = () => { if (resizing) window.workpet.resizePanelRight("end", lastX); resizing = false; };
    handle.onpointerup = end; handle.onpointercancel = end; handle.onlostpointercapture = end;
    handle.onkeydown = event => { if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return; event.preventDefault(); window.workpet.resizePanelRight("start", 0); window.workpet.resizePanelRight("move", event.key === "ArrowRight" ? 20 : -20); window.workpet.resizePanelRight("end", 0); };
  }
  function dispose() { if (closed) return; closed = true; stopWithdrawals(); abort.abort(); if (resizing) window.workpet.resizePanelRight("end", lastX); modal.classList.remove("draft-review"); }
  modal.addEventListener("close", dispose, { signal });
  render();
  if (draft.jobId) void checkSources().then(() => render()).catch(err => { if (!closed) error(err); });
  return dispose;
}
