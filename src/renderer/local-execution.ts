import type { LocalDefaults, LocalExecutionRecord, LocalStatus } from '../execution/types.js';
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const api = (action: string, input: unknown) => window.workpet.localExecution(action, input);
export const localStatusLabel = (status: LocalStatus): string => ({ STARTING: '正在发起', RUNNING: '正在执行', WAITING_APPROVAL: '等待权限批准', TURN_ENDED: '本轮结束 · 待修改或验收', FAILED: '本轮失败', INTERRUPTED: '已停止本轮', UNKNOWN: '执行状态待核对' })[status];

export function localExecutionFields(defaults: LocalDefaults): string {
  return `<section class="state-section"><label class="field">执行方式<select id="local-mode"><option value="local">Codex · 本地自动开始</option><option value="manual">选择其他执行者</option></select></label><div id="local-project-fields"><p class="consent">项目文件夹：<span id="local-directory">${esc(defaults.directory)}</span></p><details><summary>随本次工作固定的项目资料</summary><p class="consent">自动保留项目根目录的 AGENTS.md；其他需要固定的文件可在此添加。</p><div id="local-files"></div><button id="add-local-file">添加文件</button></details></div></section>`;
}
export function bindLocalFields(modal: HTMLDialogElement, defaults: LocalDefaults): () => { files: string[] } | null {
  const files = [...defaults.files];
  const draw = () => {
    modal.querySelector('#local-files')!.innerHTML = files.map((path, i) => `<p>${esc(path)} <button data-remove-local-file="${i}">移除</button></p>`).join('');
    modal.querySelectorAll<HTMLButtonElement>('[data-remove-local-file]').forEach(b => b.onclick = () => { files.splice(Number(b.dataset.removeLocalFile), 1); draw(); });
  };
  draw();
  modal.querySelector<HTMLButtonElement>('#add-local-file')!.onclick = async () => { const path = await window.workpet.chooseDefinitionFile(); if (path && !files.includes(path)) { files.push(path); draw(); } };
  const mode = modal.querySelector<HTMLSelectElement>('#local-mode')!;
  mode.onchange = () => {
    modal.querySelector<HTMLElement>('#local-project-fields')!.hidden = mode.value !== 'local';
    modal.querySelector('#create-defined-work')!.textContent = mode.value === 'local' ? '开始工作' : '创建并选择执行者';
  };
  return () => {
    if (mode.value !== 'local') return null;
    return { files: [...files] };
  };
}
export function executionEvidenceHtml(record: LocalExecutionRecord): string {
  const m = record.manifest;
  return `<div id="local-status"></div><p id="local-error" class="notice" role="alert" hidden></p><section class="state-section"><h3>发起时的执行清单</h3><p>${esc(m.project.directory)}</p><p>${esc(m.createdAt)} · ${esc(m.host.name)}</p><p>${esc(m.workPackage.definition?.content.name)} · v${esc(m.workPackage.definition?.version)}</p><p class="consent">以下副本与说明固定在发起时。后续修改通过原聊天追加，验收仍由你确认。</p>${m.projectMaterials.map(file => `<p>${esc(file.originalPath)} <button data-open-execution-file="${esc(file.path)}">查看固定副本</button></p>`).join('')}<details><summary>本次完整执行说明</summary><pre class="execution-text">${esc(m.prompt)}</pre></details><details><summary>版本、权限与清单校验</summary><pre class="execution-text">${esc(JSON.stringify({ worket: m.worketBuild, project: m.projectVersion, requestedPermissions: m.permissionRequest, manifestHash: record.manifestHash, manifest: m }, null, 2))}</pre></details></section><section class="state-section"><h3>继续这项工作</h3><label class="field">修改意见或下一步<textarea id="execution-followup" rows="4"></textarea></label><button id="continue-execution" class="primary">在原聊天继续</button><div id="local-history"></div></section>`;
}
export function mountExecutionEvidence(modal: HTMLDialogElement, initial: LocalExecutionRecord, changed: () => void): () => void {
  const workId = initial.manifest.workId;
  let disposed = false, busy = false, timer: ReturnType<typeof setTimeout>;
  const error = (e: unknown) => { const target = modal.querySelector<HTMLElement>('#local-error'); if (target) { target.textContent = String(e); target.hidden = false; } };
  const run = async (action: string, extra = {}) => {
    if (busy) return;
    busy = true;
    try { await api(action, { workId, ...extra }); await refresh(); changed(); } catch (e) { error(e); } finally { busy = false; }
  };
  const render = (r: LocalExecutionRecord) => {
    if (disposed) return;
    modal.querySelector('#local-status')!.innerHTML = `<p class="notice">${esc(localStatusLabel(r.status))}</p>${r.error ? `<p>${esc(r.error)}</p>` : ''}<details><summary>实际执行环境 · ${esc(r.model ?? '等待回执')}</summary><p class="consent">${esc(r.runtime ?? '执行者版本等待回执')}<br>${r.threadId ? `聊天 ${esc(r.threadId)}` : ''}</p></details>${r.approvals.map(a => `<section class="state-section"><h3>${esc(a.title)}</h3><pre class="execution-text">${esc(a.detail)}</pre><button data-approve="${esc(a.id)}">批准这次操作</button><button data-decline="${esc(a.id)}">拒绝</button></section>`).join('')}${['RUNNING', 'WAITING_APPROVAL'].includes(r.status) ? '<button id="stop-execution">停止本轮</button>' : ''}${r.status === 'UNKNOWN' ? '<button id="check-execution">核对原聊天状态</button>' : ''}${r.lastMessage ? `<details open><summary>本轮回复</summary><pre class="execution-text">${esc(r.lastMessage)}</pre></details>` : ''}`;
    modal.querySelector<HTMLButtonElement>('#continue-execution')!.disabled = !['TURN_ENDED', 'FAILED', 'INTERRUPTED'].includes(r.status);
    const history = modal.querySelector('#local-history')!;
    const wasOpen = history.querySelector('details')?.open ?? false;
    history.innerHTML = `<details ${wasOpen ? 'open' : ''}><summary>执行记录 · ${r.events.length}</summary><pre class="execution-text">${esc(JSON.stringify({ actualSessionPolicy: r.sessionPolicy, events: r.events }, null, 2))}</pre></details>`;
    modal.querySelectorAll<HTMLButtonElement>('[data-approve], [data-decline]').forEach(b => b.onclick = () => { void run('approve', { requestId: b.dataset.approve ?? b.dataset.decline, accept: !!b.dataset.approve }); });
    const stop = modal.querySelector<HTMLButtonElement>('#stop-execution'); if (stop) stop.onclick = () => { void run('interrupt'); };
    const check = modal.querySelector<HTMLButtonElement>('#check-execution'); if (check) check.onclick = () => { void run('reconcile'); };
  };
  const refresh = async () => { const r = await api('get', { workId }); if (r) render(r); };
  render(initial);
  modal.querySelectorAll<HTMLButtonElement>('[data-open-execution-file]').forEach(b => b.onclick = () => { void run('open-material', { path: b.dataset.openExecutionFile }); });
  modal.querySelector<HTMLButtonElement>('#continue-execution')!.onclick = async () => {
    const field = modal.querySelector<HTMLTextAreaElement>('#execution-followup')!;
    if (!field.value.trim() || busy) return;
    const text = field.value; await run('continue', { text, commandId: crypto.randomUUID() });
    const latest = await api('get', { workId });
    if (latest.events.some((e: any) => e.kind === 'follow-up' && e.data.text === text)) field.value = '';
  };
  const poll = async () => { if (disposed || !modal.open) return; try { if (!busy) await refresh(); } catch (e) { error(e); } if (!disposed) timer = setTimeout(() => void poll(), 2000); };
  timer = setTimeout(() => void poll(), 2000);
  return () => { disposed = true; clearTimeout(timer); };
}
