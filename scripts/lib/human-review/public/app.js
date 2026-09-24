const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const labels = { OBJECTIVE:'工作目标', INPUT:'输入资料', DELIVERABLE:'交付成果', CONSTRAINT:'约束条件', ACCEPTANCE:'验收标准', METHOD:'参考方法', ACTIVE:'当前有效', SUPERSEDED:'已被替换', REJECTED:'已被否定', UNRESOLVED:'尚未确认', INSTANCE:'本次工作', REUSABLE:'可复用候选', UNCERTAIN:'适用范围待确认', USER_STATED:'用户明确提出', USER_CONFIRMED:'用户确认过', AGENT_PROPOSED:'助手的建议', DOCUMENT_STATED:'规范资料中的条款', INFERRED:'模型的推断', BLOCKING:'必须先问清', OPTIONAL:'可以后续确认', ACCEPT:'接受', MODIFY:'已修改', REJECT:'拒绝', UNSURE:'暂放', MISSED:'当时说过，提炼遗漏', UNSTATED:'当时有此意图，但未说出', NEW_DECISION:'今天新增的决定' };
const speaker = message => ({ user:'你', assistant:'助手', tool:'工具记录', document:'资料正文', work:'工作记录' })[message.role] ?? '来源记录';
const glyph = { ACCEPT:'✓', MODIFY:'↗', REJECT:'−', UNSURE:'·' };
let cases = [], detail = null, currentKey = null, view = 'home', editing = false, adding = false;
let busy = false, queue = Promise.resolve(), failedOperation = null, toastTimer, bufferTimer;
let lastActivity = performance.now(), engagedMs = 0, sourceItem = null, sourceAll = false;
let token = $('meta[name="review-token"]').content;
const items = () => [...detail.sample.draft.requirements.map(item => ({ ...item, key:`requirement:${item.id}`, type:'requirement' })), ...detail.sample.draft.questions.map(item => ({ ...item, key:`question:${item.id}`, type:'question' }))];
const current = () => items().find(item => item.key === currentKey);
const settled = item => ['ACCEPT','MODIFY','REJECT'].includes(detail.review.decisions[item.key]?.verdict);
function trackActivity() { const now = performance.now(); if (!document.hidden && detail && view === 'review' && now-lastActivity < 60000) engagedMs += now-lastActivity; lastActivity = now; }
for (const event of ['pointerdown','keydown','scroll']) document.addEventListener(event, trackActivity, { passive:true });
document.addEventListener('visibilitychange', () => { lastActivity = performance.now(); });
function toast(message, undo = false) {
  clearTimeout(toastTimer); $('#toast').innerHTML = `<span>${escape(message)}</span>${undo ? '<button data-action="undo">撤销</button>' : ''}`;
  $('#toast').classList.add('visible'); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4500);
}
function showError(message, conflict = false) {
  $('#error').hidden = false; document.querySelectorAll('form input,form textarea,form select').forEach(field => field.disabled = true);
  $('#error').innerHTML = `${escape(message)} <button data-action="${conflict ? 'reload' : 'retry'}">${conflict ? '重新载入' : '重试保存'}</button>`;
}
async function api(path, options = {}, refreshed = false) {
  let response;
  try { response = await fetch(path, { ...options, signal:AbortSignal.timeout(8000), headers:{ 'Content-Type':'application/json', 'X-Review-Token':token, ...options.headers } }); }
  catch { throw new Error('本机服务暂时无法连接，当前操作尚未保存。'); }
  const result = await response.json();
  if (response.status === 403 && result.error === '请重新打开审阅页面' && !refreshed) {
    const html = await (await fetch('/',{signal:AbortSignal.timeout(8000)})).text();
    const match = html.match(/name="review-token" content="([a-f0-9]+)"/);
    if (match) { token = match[1]; return api(path,options,true); }
  }
  if (!response.ok) throw Object.assign(new Error(result.error), { status:response.status });
  return result;
}
function updateCase() {
  const entry = cases.find(entry => entry.id === detail.sample.id);
  if (entry) { entry.summary = detail.summary; entry.updatedAt = detail.review.updatedAt; }
}
function saveState(message) { if ($('#save-state')) $('#save-state').textContent = message; }
function mutate(command) {
  const id = detail.sample.id;
  const operation = queue.then(async () => {
    if (failedOperation) throw new Error('请先重试未保存的操作');
    const payload = { ...command, operationId:crypto.randomUUID(), revision:detail.review.revision };
    saveState('正在保存…');
    try {
      detail = await api(`/api/cases/${id}`, { method:'POST', body:JSON.stringify(payload) });
      updateCase(); saveState('已保存到本机'); $('#error').hidden = true;
      return detail;
    } catch (error) { failedOperation = { id, payload }; showError(error.message, error.status === 409); saveState('尚未保存'); throw error; }
  });
  queue = operation.catch(() => {});
  return operation;
}
function nav() {
  return `<aside class="sidebar"><button class="brand" data-action="home" aria-label="Worket 审阅首页"><span class="brand-mark">w</span>Worket</button><div class="sidebar-label">你的工作 · HUMAN REVIEW</div><nav class="work-nav" aria-label="工作列表">${cases.map((entry,index) => `<button class="nav-item ${detail?.sample.id === entry.id ? 'selected' : ''}" data-action="case" data-id="${entry.id}"><span class="nav-number">${String(index+1).padStart(2,'0')}</span><span class="nav-copy"><span class="nav-title">${escape(entry.title)}</span><span class="nav-sub">${entry.summary.status === 'SUBMITTED' ? '已提交审阅 ✓' : `${entry.summary.reviewed} / ${entry.summary.total} 已审阅`}</span></span></button>`).join('')}</nav><div class="sidebar-bottom"><span class="local-dot"></span>仅保存在这台 Mac<br>原始记录与候选保持不变</div></aside>`;
}
function frame(content) {
  const savedScroll = window.scrollY;
  $('#app').innerHTML = `<div class="shell">${nav()}<div class="workspace"><header class="topbar"><div class="breadcrumb">审阅空间 <span> / </span> <b>${detail ? escape(detail.sample.group) : '工作审阅'}</b></div><span class="save-state" id="save-state">${failedOperation ? '尚未保存' : '本机保存'}</span></header><main class="main">${content}</main></div></div>`;
  window.scrollTo(0,savedScroll);
  syncBusy();
}
function renderHome() {
  const reviewed = cases.filter(entry => entry.summary.status === 'SUBMITTED').length;
  frame(`<div class="hero"><div><div class="eyebrow">工作审阅 / 01</div><h1>这些要求，是你的意思吗？</h1><p>从你做过的工作开始，看看我们理解得是否准确。</p></div><div class="hero-count"><strong>${reviewed}</strong> / ${cases.length} 份已完成</div></div><div class="grid">${cases.map((entry,index) => `<button class="work-card" data-action="case" data-id="${entry.id}"><span class="tag">${String(index+1).padStart(2,'0')} / ${escape(entry.group)}</span><h2>${escape(entry.title)}</h2><p>${entry.summary.requirementTotal} 条要求${entry.summary.questionTotal ? ` · ${entry.summary.questionTotal} 个待澄清问题` : ''}</p><div class="card-foot"><span>${entry.summary.status === 'SUBMITTED' ? '查看审阅结果' : entry.summary.reviewed ? `继续审阅 · 已完成 ${entry.summary.reviewed} 条` : '开始审阅'}</span><span class="card-arrow">↗</span></div><div class="line-progress"><span class="progress-${Math.round(entry.summary.reviewed / entry.summary.total * 10)}"></span></div></button>`).join('')}</div><p class="overview-note">按原对话发生时的意思判断。接受仅记录你的评价，不会发布工作定义或执行工作。</p>`);
}
function options(values, selected) { return values.map(value => `<option value="${value}" ${value === selected ? 'selected' : ''}>${escape(labels[value] ?? value)}</option>`).join(''); }
function evidence(item) {
  return `<section class="evidence-area"><div class="evidence-heading"><span>原文依据 · ${item.evidence.length} 处</span><button class="text-button" data-action="source">展开对话 ↗</button></div>${item.evidence.slice(0,3).map(ref => {
    const message = detail.sample.record.messages.find(message => message.id === ref.messageId);
    return `<button class="quote" data-action="source" data-id="${escape(ref.messageId)}"><span class="speaker">${speaker(message)} · ${escape(ref.messageId)}</span><span class="quote-text">${escape(ref.quote)}</span></button>`;
  }).join('')}${item.evidence.length > 3 ? `<button class="text-button" data-action="source">查看全部 ${item.evidence.length} 处依据</button>` : ''}</section>`;
}
function renderEditor(item) {
  const decision = detail.review.decisions[item.key];
  const draft = detail.review.buffers[item.key] ?? { ...item, ...decision?.corrected, basis:decision?.basis ?? 'HISTORICAL', note:decision?.note ?? '' };
  return `<form id="edit-form" class="editor"><label class="field">${item.type === 'question' ? '调整后的问题' : '按你的意思修改'}<textarea name="text" aria-label="修改后的内容" required maxlength="12000">${escape(draft.text)}</textarea></label><label class="field">这次修改属于<select name="basis"><option value="HISTORICAL" ${draft.basis === 'HISTORICAL' ? 'selected' : ''}>修正对原对话的理解</option><option value="NEW_DECISION" ${draft.basis === 'NEW_DECISION' ? 'selected' : ''}>今天新增或改变的决定</option></select></label><details class="edit-details"><summary>调整${item.type === 'question' ? '问题重要性' : '有效状态与适用范围'}</summary>${item.type === 'requirement' ? `<div class="field-row"><label class="field">当时的有效状态<select name="status">${options(['ACTIVE','SUPERSEDED','REJECTED','UNRESOLVED'],draft.status)}</select></label><label class="field">适用范围<select name="scope">${options(['INSTANCE','REUSABLE','UNCERTAIN'],draft.scope)}</select></label></div><label class="field">适用条件<textarea name="applicability" class="short" maxlength="12000">${escape(draft.applicability)}</textarea></label>` : `<label class="field">问题重要性<select name="priority">${options(['BLOCKING','OPTIONAL'],draft.priority)}</select></label>`}<label class="field">备注（选填）<textarea class="short" name="note" maxlength="2000">${escape(draft.note)}</textarea></label></details><div class="edit-controls"><button type="submit" class="primary">保存并继续 ↗</button><button type="button" class="text-button" data-action="cancel-edit">取消修改</button></div><p class="editor-hint">输入会自动暂存。⌘ Enter 保存并继续。</p><details class="edit-details"><summary>对照模型原稿</summary><div class="original">${escape(item.text)}</div></details></form>`;
}
function sideList() {
  return `<aside class="review-side"><div class="side-head"><h2>本次审阅</h2><span>${detail.summary.reviewed} / ${detail.summary.total}</span></div><div class="items-list">${items().map((item,index) => `${item.type === 'question' && items()[index-1]?.type !== 'question' ? '<div class="side-separator">待澄清问题</div>' : ''}<button class="item-link ${currentKey === item.key ? 'current' : ''}" data-action="item" data-id="${item.key}" ${currentKey === item.key ? 'aria-current="step"' : ''}><span class="item-state">${glyph[detail.review.decisions[item.key]?.verdict] ?? String(index+1).padStart(2,'0')}</span><span class="item-text">${escape(detail.review.decisions[item.key]?.corrected?.text ?? item.text)}</span></button>`).join('')}</div></aside>`;
}
function renderReview() {
  const item = current(); if (!item) { view = 'summary'; return renderSummary(); }
  const index = items().findIndex(entry => entry.key === currentKey), decision = detail.review.decisions[item.key];
  const displayed = { ...item, ...decision?.corrected };
  frame(`<div class="review-heading"><div><button class="back" data-action="home">← 全部工作</button><h1>${escape(detail.sample.title)}</h1></div><button class="text-button" data-action="summary">查看进度与遗漏 ↗</button></div><div class="review-layout"><div class="review-column"><article class="focus-card" aria-label="当前审阅条目">${decision ? `<div class="decision-banner"><span>${escape(labels[decision.verdict])}${decision.basis === 'NEW_DECISION' ? ' · 今天的新决定' : ''}</span><button data-action="edit">调整评价</button></div>` : ''}<div class="card-top"><span class="pill ${item.type === 'question' ? 'warn' : ''}">${item.type === 'question' ? '这个问题，当时还需要问吗？' : labels[item.category]}</span><span class="step-count">${String(index+1).padStart(2,'0')} / ${items().length}</span></div>${editing ? renderEditor(item) : `<div class="requirement-body"><h2 id="requirement-title" tabindex="-1">${escape(displayed.text)}</h2>${item.type === 'question' ? `<p class="question-note">${escape(item.reason)}</p><div class="claim-meta"><span>模型判断 · ${labels[displayed.priority]}</span></div>` : `<div class="claim-meta"><span>${labels[displayed.status]}</span><span>${labels[displayed.scope]}</span><span>模型归因 · ${labels[item.origin]}</span></div><p class="applicability">${escape(displayed.applicability)}</p>`}</div>`}${item.issues?.length ? `<div class="pending-note">${item.issues.map(issue => `<p>${escape(issue.message)}</p>`).join('')}</div>` : ''}${evidence(item)}${!editing ? `<div class="actions"><button class="primary" data-action="accept">${decision?.verdict === 'MODIFY' ? '接受原稿' : item.type === 'question' ? '确实需要问' : '接受'}<kbd>A</kbd></button><button class="secondary" data-action="edit">${item.type === 'question' ? '调整问题' : '修改'}<kbd>E</kbd></button><button class="reject" data-action="reject">${item.type === 'question' ? '不必再问' : '拒绝'}<kbd>R</kbd></button><button class="skip" data-action="skip">暂放 →</button></div>` : ''}</article><div class="below-card"><button data-action="undo" ${canUndo() ? '' : 'disabled'}>↶ 撤销上一步</button><span>按当时的意思判断 · ← → 切换</span><button data-action="source-all">查看完整对话</button></div></div>${sideList()}</div>`);
  if (editing) { const field = $('#edit-form textarea'); field.focus({ preventScroll:true }); field.setSelectionRange(field.value.length,field.value.length); }
}
function canUndo() { if (detail.review.status === 'SUBMITTED') return false; const undone = new Set(detail.review.events.filter(event => event.type === 'undo').map(event => event.target)); return detail.review.events.some(event => event.undoable && !undone.has(event.operationId)); }
function row(item) {
  const decision = detail.review.decisions[item.key];
  return `<div class="summary-row"><span class="pill ${!decision || decision.verdict === 'UNSURE' ? 'warn' : 'neutral'}">${decision ? labels[decision.verdict] : '未审阅'}</span><div class="row-text">${escape(decision?.corrected?.text ?? item.text)}${decision?.basis === 'NEW_DECISION' ? '<span class="mini-label">今天的新决定 · 不计为原提炼正确</span>' : ''}${decision?.verdict === 'MODIFY' ? `<details class="mini-label"><summary>原文对照</summary>${escape(item.text)}</details>` : ''}</div><button data-action="item" data-id="${item.key}">${detail.review.status === 'SUBMITTED' ? '查看' : '调整'}</button></div>`;
}
function renderSummary() {
  const s = detail.summary, submitted = detail.review.status === 'SUBMITTED';
  const unresolved = items().filter(item => !settled(item));
  frame(`<div class="summary-heading">${submitted ? '<div class="completion-icon">✓</div>' : '<button class="back" data-action="continue">← 继续逐条审阅</button>'}<div class="eyebrow">${submitted ? 'REVIEW COMPLETE' : '最后，看看有没有遗漏'}</div><h1>${submitted ? '你的判断，已经留下了。' : '核对这份工作的完整要求'}</h1><p>${escape(detail.sample.title)} · ${s.reviewed} / ${s.total} 条已审阅${submitted ? '<br>这是对提炼结果的评价，尚未发布为可复用工作定义。' : ''}</p></div><div class="stats"><div class="stat"><strong>${s.accepted}</strong><span>接受的要求</span></div><div class="stat"><strong>${s.modified}</strong><span>修改的要求</span></div><div class="stat"><strong>${s.rejected}</strong><span>拒绝的要求</span></div><div class="stat"><strong>${s.omissions}</strong><span>补充的要求</span></div></div>${unresolved.length ? `<section class="summary-panel"><h2>还需要你的判断 · ${unresolved.length}</h2>${unresolved.map(row).join('')}</section>` : ''}${Object.keys(detail.review.buffers).length ? '<div class="pending-note">还有暂存的编辑。请回到对应条目保存或取消，再提交审阅。</div>' : ''}<section class="summary-panel"><h2>有没有漏掉的要求？</h2>${detail.review.omissions.length ? detail.review.omissions.map(item => `<div class="summary-row"><span class="pill">补充</span><div class="row-text">${escape(item.text)}<span class="mini-label">${escape(labels[item.basis])}${item.evidenceIds.length ? ` · ${item.evidenceIds.map(escape).join('、')}` : ''}</span></div>${!submitted ? `<button data-action="remove-omission" data-id="${item.id}">移除</button>` : ''}</div>`).join('') : '<p class="empty">目标、限制、你后来纠正的地方，都可以在这里补充。</p>'}${!submitted ? `${adding ? omissionForm() : '<button class="secondary" data-action="add">＋ 补充一条要求</button>'}` : ''}</section><section class="summary-panel summary-all"><details ${submitted ? 'open' : ''}><summary>核对全部条目 · ${s.total}</summary>${items().map(row).join('')}</details></section>${!submitted ? `<label class="check-label"><input id="complete-check" type="checkbox" ${detail.review.completenessChecked ? 'checked' : ''}>我已检查是否有遗漏，需要补充的内容已记录。</label><div class="finish-actions"><p>随时可以离开，已保存的进度会保留。</p><button class="primary" data-action="submit" ${s.pending || s.unsure || !detail.review.completenessChecked || Object.keys(detail.review.buffers).length || detail.review.omissionBuffer?.text?.trim() ? 'disabled' : ''}>提交这份审阅 ✓</button></div>` : `<p class="receipt">${s.historicalAccepted} 条直接接受 / ${s.historicalJudged} 条已判定的历史要求；${s.newDecisions} 条新决定单列。<br>保存于本机 · ${new Date(detail.review.submittedAt).toLocaleString('zh-CN')}<br>原稿、修改和操作记录均已保留。</p><div class="finish-actions"><button class="text-button" data-action="reopen">重新打开审阅</button><div><button class="secondary" data-action="export">导出审阅 JSON</button> <button class="primary" data-action="next-case">${cases.some(entry => entry.summary.status !== 'SUBMITTED') ? '下一份工作 →' : '返回全部工作'}</button></div></div>`}`);
  if (adding) $('#omission-form textarea').focus();
}
function omissionForm() {
  const draft = detail.review.omissionBuffer ?? {text:'',basis:'MISSED',evidenceIds:[]};
  return `<form id="omission-form" class="addition-form"><label class="field">补充的要求<textarea name="text" required maxlength="12000" placeholder="写下没有被整理出来的要求…">${escape(draft.text)}</textarea></label><label class="field">它来自哪里<select name="basis">${options(['MISSED','UNSTATED','NEW_DECISION'],draft.basis)}</select></label><details class="edit-details"><summary>关联原对话（选填）</summary><div class="source-picker">${detail.sample.record.messages.filter(message => message.role === 'user').map(message => `<label><input type="checkbox" name="evidenceIds" value="${escape(message.id)}" ${draft.evidenceIds?.includes(message.id) ? 'checked' : ''}> ${escape(message.id)} · ${escape(message.content.slice(0,110))}</label>`).join('')}</div></details><div class="edit-controls"><button class="primary" type="submit">保存补充</button><button class="text-button" data-action="cancel-add" type="button">取消</button></div></form>`;
}
function render() { if (detail) history.replaceState(null,'',`#${detail.sample.id}${view === 'summary' ? '/summary' : ''}`); if (view === 'home') renderHome(); else if (view === 'summary') renderSummary(); else renderReview(); }
function syncBusy() { document.body.setAttribute('aria-busy', String(busy)); }
async function guarded(action) { if (busy) return; busy = true; syncBusy(); try { await action(); } catch (error) { if (!failedOperation) { toast(error.message); console.error(error); } } finally { busy = false; syncBusy(); } }
function readOmission() { const form = new FormData($('#omission-form')); return {text:form.get('text'),basis:form.get('basis'),evidenceIds:form.getAll('evidenceIds')}; }
function readEdit() { const data = Object.fromEntries(new FormData($('#edit-form'))); return data; }
async function flushBuffer() {
  clearTimeout(bufferTimer);
  if ($('#edit-form')) {
    const buffer = readEdit();
    if (JSON.stringify(buffer) !== JSON.stringify(detail.review.buffers[currentKey])) await mutate({ type:'buffer', key:currentKey, buffer });
  }
  if ($('#omission-form')) { const buffer = readOmission(); if (JSON.stringify(buffer) !== JSON.stringify(detail.review.omissionBuffer)) await mutate({type:'omission-buffer',buffer}); }
  await queue;
  if (failedOperation) throw new Error('请先保存当前内容');
}
async function openCase(id) {
  await flushBuffer();
  detail = await api(`/api/cases/${id}`); currentKey = detail.review.cursor ?? items().find(item => !settled(item))?.key ?? items()[0]?.key;
  editing = !!detail.review.buffers[currentKey]; adding = !!detail.review.omissionBuffer; engagedMs = 0; lastActivity = performance.now();
  view = detail.review.status === 'SUBMITTED' || !items().some(item => !settled(item)) && !editing ? 'summary' : 'review';
  history.replaceState(null,'',`#${id}`); render(); window.scrollTo(0,0);
}
async function goItem(key) {
  await flushBuffer(); if (detail.review.status !== 'SUBMITTED') await mutate({type:'cursor',key}); currentKey = key; editing = !!detail.review.buffers[key]; view = 'review'; render();
  if (detail.review.status === 'SUBMITTED') { $('#app').querySelectorAll('.actions button,.decision-banner button').forEach(button => button.disabled = true); }
}
async function decide(verdict) {
  const item = current(), key = currentKey;
  let corrected, basis = 'HISTORICAL', note = '';
  if (verdict === 'MODIFY') {
    if (!$('#edit-form').reportValidity()) return;
    const form = readEdit(); ({ basis, note = '' } = form);
    corrected = item.type === 'requirement' ? { text:form.text.trim(), status:form.status, scope:form.scope, applicability:form.applicability } : { text:form.text.trim(), priority:form.priority };
  }
  clearTimeout(bufferTimer);
  const all = items(), index = all.findIndex(item => item.key === key);
  const candidates = [...all.slice(index+1),...all.slice(0,index)];
  const next = candidates.find(item => !detail.review.decisions[item.key]);
  trackActivity(); const elapsed = Math.round(engagedMs); engagedMs = 0;
  await mutate({ type:'decision', key, verdict, corrected, basis, note, nextKey:next?.key, engagedMs:elapsed });
  editing = false;
  if (next) { currentKey = next.key; editing = !!detail.review.buffers[currentKey]; }
  else view = 'summary';
  render(); toast(verdict === 'UNSURE' ? '已暂放，最后一起回看' : `${labels[verdict]} · 已保存`, true);
  $('#requirement-title')?.focus({ preventScroll:true });
}
function showSource(all = false, messageId) {
  sourceItem = current(); sourceAll = all; renderSource(messageId); $('#source-dialog').showModal();
}
function renderSource(messageId) {
  const messages = detail.sample.record.messages;
  const selected = new Set(sourceItem.evidence.map(ref => ref.messageId));
  const visible = sourceAll ? messages : messages.filter((message,index) => selected.has(message.id) || selected.has(messages[index-1]?.id) || selected.has(messages[index+1]?.id));
  $('#source-dialog').className = 'source-dialog';
  $('#source-dialog').innerHTML = `<header class="dialog-header"><h2 id="source-title">${sourceAll ? '完整原始对话' : '原文与前后文'}</h2><button data-action="close-source" aria-label="关闭原文">×</button></header><div class="dialog-body"><p class="dialog-caption">只展示当时记录的可见消息 · 高亮为当前条目的引用</p><button class="secondary dialog-mode" data-action="toggle-source">${sourceAll ? '只看引用附近' : `查看完整对话 · ${messages.length} 条消息`}</button>${visible.map(message => {
    let content = '', cursor = 0;
    const refs = sourceItem.evidence.filter(ref => ref.messageId === message.id).sort((a,b) => a.start-b.start);
    for (const ref of refs) { if (ref.start < cursor) continue; content += escape(message.content.slice(cursor,ref.start)) + `<mark>${escape(message.content.slice(ref.start,ref.end))}</mark>`; cursor = ref.end; }
    content += escape(message.content.slice(cursor));
    return `<article class="source-message ${message.role}" id="source-${message.id}"><h3>${speaker(message)} · ${escape(message.id)}</h3><pre>${content}</pre></article>`;
  }).join('')}</div>`;
  if (messageId) setTimeout(() => document.getElementById(`source-${messageId}`)?.scrollIntoView({ block:'center' }), 30);
}
async function exportReview() {
  const data = await api(`/api/cases/${detail.sample.id}/export`);
  const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const link = document.createElement('a'); link.href = url; link.download = `${detail.sample.id}-human-review.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
}
const actions = {
  home:async () => { await flushBuffer(); detail = null; view = 'home'; history.replaceState(null,'','#'); render(); },
  case:async id => openCase(id), item:goItem,
  accept:() => decide('ACCEPT'), reject:() => decide('REJECT'), skip:() => decide('UNSURE'),
  edit:() => { if (detail.review.status === 'SUBMITTED') return; editing = true; render(); },
  'cancel-edit':async () => { clearTimeout(bufferTimer); await mutate({type:'discard-buffer',key:currentKey}); editing = false; render(); },
  summary:async () => { await flushBuffer(); view = 'summary'; adding = !!detail.review.omissionBuffer; render(); },
  continue:async () => goItem(items().find(item => !settled(item))?.key ?? currentKey ?? items()[0].key),
  undo:async () => { clearTimeout(bufferTimer); await mutate({type:'undo'}); currentKey = detail.review.cursor ?? currentKey; editing = !!detail.review.buffers[currentKey]; view = 'review'; render(); toast('已撤销，可以重新判断'); },
  source:id => showSource(false,id), 'source-all':() => showSource(true),
  'close-source':() => $('#source-dialog').close(), 'toggle-source':() => {sourceAll = !sourceAll; renderSource();},
  add:() => { adding = true; render(); }, 'cancel-add':async () => { clearTimeout(bufferTimer); await mutate({type:'omission-buffer',buffer:null}); adding = false; render(); },
  'remove-omission':async id => { await mutate({type:'remove-omission',id}); render(); toast('已移除补充',true); },
  submit:async () => { await mutate({type:'submit'}); render(); window.scrollTo(0,0); toast('审阅已提交'); },
  reopen:async () => { await mutate({type:'reopen'}); view = 'summary'; render(); },
  'next-case':async () => { const next = cases.find(entry => entry.summary.status !== 'SUBMITTED'); if (next) await openCase(next.id); else await actions.home(); },
  export:exportReview,
  reload:() => location.reload(),
  retry:async () => {
    if (!failedOperation) return location.reload();
    const { id,payload } = failedOperation;
    try { detail = await api(`/api/cases/${id}`,{method:'POST',body:JSON.stringify(payload)}); failedOperation = null; $('#error').hidden = true; updateCase(); editing = !!detail.review.buffers[currentKey]; adding = !!detail.review.omissionBuffer; render(); toast('已恢复保存，请继续'); }
    catch(error) { showError(error.message,error.status === 409); }
  },
};
document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]'); if (!button || button.disabled) return; if (failedOperation && !['retry','reload'].includes(button.dataset.action)) return;
  const action = actions[button.dataset.action]; if (action) guarded(() => action(button.dataset.id));
});
document.addEventListener('submit', event => {
  event.preventDefault();
  if (event.target.id === 'edit-form') guarded(() => decide('MODIFY'));
  if (event.target.id === 'omission-form') guarded(async () => { clearTimeout(bufferTimer); const form = new FormData(event.target); await mutate({type:'omission',text:form.get('text'),basis:form.get('basis'),evidenceIds:form.getAll('evidenceIds')}); adding = false; render(); toast('已补充一条要求',true); });
});
document.addEventListener('input', event => {
  if (!event.target.closest('#edit-form,#omission-form') || failedOperation) return;
  saveState('正在暂存…'); clearTimeout(bufferTimer);
  bufferTimer = setTimeout(() => { if ($('#edit-form')) mutate({type:'buffer',key:currentKey,buffer:readEdit()}).catch(() => {}); else if ($('#omission-form')) mutate({type:'omission-buffer',buffer:readOmission()}).catch(() => {}); },400);
});
document.addEventListener('change', event => { if (event.target.id === 'complete-check') guarded(async () => { await flushBuffer(); await mutate({type:'complete-check',value:event.target.checked}); render(); }); });
document.addEventListener('keydown', event => {
  if ($('#source-dialog').open || busy || failedOperation) return;
  const inField = ['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName);
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && $('#edit-form')) { event.preventDefault(); guarded(() => decide('MODIFY')); return; }
  if (inField || event.metaKey || event.ctrlKey || event.altKey || view !== 'review' || editing || detail.review.status === 'SUBMITTED') return;
  const action = { a:'accept',e:'edit',r:'reject',s:'skip',z:'undo' }[event.key.toLowerCase()];
  if (action) { event.preventDefault(); guarded(() => actions[action]()); }
  if (['ArrowLeft','ArrowRight'].includes(event.key)) { event.preventDefault(); const all = items(), index = all.findIndex(item => item.key === currentKey), target = all[index+(event.key === 'ArrowRight' ? 1 : -1)]; if (target) guarded(() => goItem(target.key)); }
});
window.addEventListener('beforeunload', event => {
  const unsavedEdit = $('#edit-form') && JSON.stringify(readEdit()) !== JSON.stringify(detail.review.buffers[currentKey]);
  const unsavedOmission = $('#omission-form') && JSON.stringify(readOmission()) !== JSON.stringify(detail.review.omissionBuffer);
  if (failedOperation || busy || unsavedEdit || unsavedOmission) { event.preventDefault(); event.returnValue = ''; }
});
async function boot() { try { ({cases} = await api('/api/cases')); const [id,route] = location.hash.slice(1).split('/'); if (cases.some(entry => entry.id === id)) { await openCase(id); if (route === 'summary') { view = 'summary'; render(); } } else render(); } catch(error) { $('#app').innerHTML = `<div class="loading">${escape(error.message)}<p><button class="secondary" data-action="reload">重新载入</button></p></div>`; } }
boot();
