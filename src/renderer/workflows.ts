import type { Definition } from '../definitions/repository.js';
import { acceptanceChecks } from '../contracts/rules.js';
import { currentNode, outputPorts, type RunDetail, type WorkflowDefinition } from '../workflows/types.js';
import { chooseExecutor } from './executor-picker.js';
import { showPageHeader } from './window-header.js';
import { buildWorkflow, type BuilderHost } from './workflow-builder.js';
import { api, esc, cid, graph, control, readValues, bindFiles } from './workflow-ui.js';
import type { DashboardView } from '../ui-contract.js';

const root = document.createElement('dialog'); root.id = 'workflow-dialog'; root.className = 'page-dialog'; root.setAttribute('aria-label', '工作流'); document.body.append(root);
const step = document.createElement('dialog'); step.id = 'workflow-step-dialog'; step.setAttribute('aria-labelledby', 'wf-step-title'); document.body.append(step);
let definitions: WorkflowDefinition[] = [], selectedDefinition: WorkflowDefinition | undefined, active: RunDetail | undefined, selectedNode = '', changing = false;
let changed: (d: DashboardView) => void = () => {};
const runStatus = { RUNNING: '进行中', PAUSED: '已暂停', COMPLETED: '已完成', CANCELLED: '已取消' };
function error(host: HTMLElement, error: unknown): void { const e = host.querySelector<HTMLElement>('[role="alert"]'); if (e) { e.textContent = error instanceof Error ? error.message : String(error); e.hidden = false; } }
function bind(host: HTMLElement, selector: string, action: () => Promise<void>): void {
  host.querySelectorAll<HTMLButtonElement>(selector).forEach(b => b.onclick = () => {
    if (changing) return; changing = true; b.disabled = true;
    void action().catch(e => error(b.isConnected ? host : root, e)).finally(() => { changing = false; b.disabled = false; });
  });
}
function modal(title: string, body: string, actions: string): HTMLDialogElement {
  step.innerHTML = `<div class="dialog-card"><div class="wf-heading"><h2 id="wf-step-title">${esc(title)}</h2><button id="wf-close-step">关闭</button></div><p role="alert" class="notice" hidden></p>${body}<footer class="dialog-actions">${actions}</footer></div>`;
  step.querySelector<HTMLButtonElement>('#wf-close-step')!.onclick = () => step.close(); if (!step.open) step.showModal(); return step;
}
function page(title: string, body: string, actions = ''): void {
  root.innerHTML = `<div class="dialog-shell"><div class="window-header-slot"></div><div class="wf-shell"><aside class="wf-sidebar"><strong>工作流</strong><button id="wf-library">全部流程</button>${definitions.filter((d, i) => definitions.findIndex(x => x.key === d.key) === i).map(d => `<button data-flow="${esc(d.id)}" class="${selectedDefinition?.key === d.key ? 'active' : ''}">${esc(d.name)}</button>`).join('')}</aside><div class="wf-page"><header class="wf-heading"><div><p class="wf-context">${selectedDefinition ? `${esc(selectedDefinition.name)} / 固定流程 v${selectedDefinition.version}` : '工作空间 / 工作流'}</p><h2>${esc(title)}</h2></div><div class="wf-actions">${actions}</div></header><p role="alert" class="notice" hidden></p>${body}</div></div></div>`;
  if (!root.open) root.showModal(); showPageHeader({ dialog: root, label: '返回流程列表', back: async () => { step.close(); root.close(); await renderWorkflows(); } });
  bind(root, '#wf-library', async () => { root.close(); await renderWorkflows(); });
  root.querySelectorAll<HTMLButtonElement>('[data-flow]').forEach(b => b.onclick = () => { void openDefinition(b.dataset.flow!).catch(e => error(root, e)); });
}
const builderHost: BuilderHost = { page, modal, bind, root, closeModal: () => step.close() };
export async function renderWorkflows(): Promise<void> {
  const catalog = await api('catalog'); definitions = catalog.definitions;
  const host = document.querySelector<HTMLElement>('#workflows-panel')!;
  const latest = definitions.filter((d, i) => definitions.findIndex(x => x.key === d.key) === i);
  host.innerHTML = `<div class="wf-heading"><h2>工作流</h2><button id="wf-new" class="primary">新建流程</button></div>${latest.length ? latest.map(d => `<button class="work-row" data-open-flow="${esc(d.id)}"><h3>${esc(d.name)}</h3><span class="row-meta">v${d.version} · ${d.nodes.length} 份 Contract</span><p>${d.nodes.map(n => esc(n.name)).join(' → ')}</p></button>`).join('') : '<p class="empty">暂无已保存流程</p>'}`;
  host.querySelector<HTMLButtonElement>('#wf-new')!.onclick = () => { selectedDefinition = undefined; active = undefined; void buildWorkflow(builderHost, saved).catch(e => error(root, e)); };
  host.querySelectorAll<HTMLButtonElement>('[data-open-flow]').forEach(b => b.onclick = () => { void openDefinition(b.dataset.openFlow!).catch(e => error(host, e)); });
}
async function saved(d: WorkflowDefinition): Promise<void> { definitions = (await api('catalog')).definitions; await openDefinition(d.id); }
async function openDefinition(id: string): Promise<void> {
  selectedDefinition = await api('definition', { id }); active = undefined;
  const d = selectedDefinition!, contracts: Record<string, Definition> = Object.fromEntries(await Promise.all(d.nodes.map(async n => [n.id, await window.workpet.distillation('definition', { id: n.contractId })])));
  page(d.name, `<nav class="wf-tabs"><button class="active">流程结构</button><button id="wf-runs">运行记录</button><label>流程版本<select id="wf-version">${definitions.filter(x => x.key === d.key).map(x => `<option value="${esc(x.id)}" ${x.id === d.id ? 'selected' : ''}>v${x.version}</option>`).join('')}</select></label></nav>${graph(d, contracts)}<section class="wf-final"><div><h3>流程输入</h3><p>${esc(d.inputs.map(p => p.text).join('、') || '无须提供输入')}</p></div><div><h3>最终交付</h3><p>${d.outputs.map(o => esc(`${d.nodes.find(n => n.id === o.nodeId)!.name} / ${contracts[o.nodeId]!.content.deliverables.find(p => p.key === o.outputKey)!.text}`)).join('、')}</p></div></section>`, '<button id="wf-edit">编辑连接</button><button id="wf-new-run" class="primary">开展一次</button>');
  bind(root, '#wf-edit', () => buildWorkflow(builderHost, saved, d)); bind(root, '#wf-new-run', createRun); bind(root, '#wf-runs', runs);
  root.querySelector<HTMLSelectElement>('#wf-version')!.onchange = e => { void openDefinition((e.target as HTMLSelectElement).value); };
  root.querySelectorAll<HTMLButtonElement>('[data-node]').forEach(b => b.onclick = () => { const n = d.nodes.find(n => n.id === b.dataset.node)!; modal(n.name, `<p>${esc(contracts[n.id]!.content.name)} · v${contracts[n.id]!.version}</p><h3>输入来源</h3>${Object.entries(n.bindings).map(([key, source]) => `<p>${esc(key)} ← ${source.type === 'OUTPUT' ? esc(`${d.nodes.find(n => n.id === source.nodeId)!.name} / ${source.key}`) : source.type === 'INPUT' ? esc(d.inputs.find(p => p.key === source.key)?.text ?? source.key) : esc(source.value)}</p>`).join('')}`, ''); });
}
async function runs(): Promise<void> {
  const d = selectedDefinition!, items: RunDetail[] = await api('runs', { workflowId: d.id }); active = undefined;
  page(d.name, `<nav class="wf-tabs"><button id="wf-structure">流程结构</button><button class="active">运行记录</button></nav><div class="wf-table"><div class="wf-run-row wf-table-head"><span>本次工作</span><span>流程版本</span><span>当前进度</span><span></span></div>${items.map(({ run, definition, phases }) => `<div class="wf-run-row"><div><strong>${esc(run.name)}</strong><small>${new Date(run.createdAt).toLocaleDateString('zh-CN')} · ${esc(Object.entries(run.inputs).filter(([key]) => definition.inputs.find(p => p.key === key)?.valueType !== 'FILE').map(([, value]) => String(value)).slice(0, 2).join(' / '))}</small></div><span>v${definition.version}</span><span>${run.status === 'RUNNING' ? esc([...new Set(Object.values(phases))].filter(s => !['已验收', '等待输入'].includes(s)).join(' · ') || '等待输入') : runStatus[run.status]}</span><button data-open-run="${esc(run.id)}">打开运行</button></div>`).join('') || '<p class="empty">尚未开展</p>'}</div>`, '<button id="wf-new-run" class="primary">开展一次</button>');
  bind(root, '#wf-structure', () => openDefinition(d.id)); bind(root, '#wf-new-run', createRun);
  root.querySelectorAll<HTMLButtonElement>('[data-open-run]').forEach(b => b.onclick = () => { void openRun(b.dataset.openRun!).catch(e => error(root, e)); });
}
async function createRun(): Promise<void> {
  const d = selectedDefinition!; const m = modal('开展一次流程', `<p>${esc(d.name)} v${d.version} · ${d.nodes.length} 份固定 Contract</p><label class="field">本次工作名称<input id="wf-run-name" maxlength="160"></label>${d.inputs.map(p => control(p, p.defaultValue ?? '')).join('')}`, '<button id="wf-create-run" class="primary">创建并开展</button>'); bindFiles(m);
  bind(m, '#wf-create-run', async () => { const detail: RunDetail = await api('create', { workflowId: d.id, name: m.querySelector<HTMLInputElement>('#wf-run-name')!.value.trim(), inputs: readValues(m, d.inputs), commandId: cid() }); step.close(); selectedNode = ''; await openRun(detail.run.id); });
}
function command(detail: RunDetail, nodeId = selectedNode) { return { runId: detail.run.id, nodeId, generation: currentNode(detail.run, nodeId).generation, expectedRevision: detail.run.revision, commandId: cid() }; }
export async function openWorkflowRun(id: string): Promise<void> {
  definitions = (await api('catalog')).definitions; await openRun(id);
}
async function openRun(id: string): Promise<void> {
  active = await api('detail', { runId: id }); selectedDefinition = active!.definition;
  if (!active!.run.nodes[selectedNode]) selectedNode = active!.definition.nodes[0]!.id; drawRun(active!);
}
function outputs(detail: RunDetail, nodeId: string, generation: number): string {
  const node = detail.run.nodes[nodeId]!.find(n => n.generation === generation)!;
  return node.outputs.map(o => `<div class="wf-output"><strong>${esc(detail.contracts[nodeId]!.content.deliverables.find(p => p.key === o.key)?.text ?? o.key)}</strong>${o.material ? `<button data-open-output="${esc(o.key)}" data-output-node="${esc(nodeId)}" data-output-generation="${generation}">${esc(o.material.originalPath.split(/[/\\]/).at(-1))}</button><small>sha256 ${esc(o.material.hash.slice(0, 12))}</small>` : `<pre>${esc(o.value)}</pre>`}</div>`).join('');
}
function wireOutputs(host: HTMLElement, detail: RunDetail): void {
  host.querySelectorAll<HTMLButtonElement>('[data-open-output]').forEach(b => b.onclick = () => { void api('openOutput', { runId: detail.run.id, nodeId: b.dataset.outputNode, generation: Number(b.dataset.outputGeneration), key: b.dataset.openOutput }).catch(e => error(host, e)); });
}
function drawRun(d: RunDetail): void {
  const n = currentNode(d.run, selectedNode), node = d.definition.nodes.find(n => n.id === selectedNode)!, c = d.contracts[selectedNode]!, enabled = d.run.status === 'RUNNING';
  page(d.run.name, `<nav class="wf-tabs"><button id="wf-structure">流程结构</button><button id="wf-all-runs">所有运行</button><strong>${runStatus[d.run.status]}</strong></nav><div class="wf-run-layout">${graph(d.definition, d.contracts, d.phases, selectedNode, true)}<section class="wf-inspector"><h3>${esc(node.name)}</h3><span class="wf-phase ${n.phase === 'SUBMITTED' ? 'review' : ''}">${esc(d.phases[selectedNode])} · 第 ${n.generation} 轮</span><small>采用的工作约定</small><p>${esc(c.content.name)} · v${c.version}</p>${n.note ? `<h4>本轮要求</h4><p>${esc(n.note)}</p>` : ''}<h4>本次交付</h4>${outputs(d, selectedNode, n.generation)}<div class="wf-actions">${enabled && ['READY', 'PREPARED'].includes(n.phase) && ['可开展', '交付失败'].includes(d.phases[selectedNode]!) ? '<button id="wf-start" class="primary">开展工作</button>' : ''}${enabled && n.workId && n.phase === 'PREPARED' ? '<button id="wf-submit">关联并提交成果</button>' : ''}${enabled && n.phase === 'SUBMITTED' ? '<button id="wf-review" class="primary">验收交付</button>' : ''}${n.workId ? '<button id="wf-work">查看工作记录</button><button id="wf-copy">复制工作包</button>' : ''}${n.workId && ['RUNNING', 'COMPLETED'].includes(d.run.status) ? '<button id="wf-rework">重做这一步</button>' : ''}</div><details><summary>实际采用的输入</summary>${n.adopted.map(a => `<p>${esc(a.inputKey)} ← ${esc(d.definition.nodes.find(n => n.id === a.nodeId)!.name)} / 第 ${a.generation} 轮 / ${esc(a.outputKey)}</p>`).join('')}${n.workId ? Object.entries(d.run.inputs).map(([key, value]) => `<p>${esc(d.definition.inputs.find(p => p.key === key)?.text ?? key)}：${esc(value)}</p>`).join('') : ''}</details>${d.run.nodes[selectedNode]!.length > 1 ? `<details><summary>历史交付与验收 · ${d.run.nodes[selectedNode]!.length - 1} 轮</summary>${d.run.nodes[selectedNode]!.slice(0, -1).map(v => `<section class="wf-history"><strong>第 ${v.generation} 轮${v.acceptedAt ? ' · 已验收' : ' · 已被重做'}</strong>${v.note ? `<p>${esc(v.note)}</p>` : ''}${outputs(d, selectedNode, v.generation)}${v.criteria ? `<small>${Object.entries(v.criteria).map(([key, result]) => `${esc(key)}：${result === 'PASS' ? '通过' : '需修改'}`).join('；')}</small>` : ''}</section>`).join('')}</details>` : ''}</section></div>${Object.keys(d.updates).length ? `<section class="wf-update"><h3>有已验收新版可用</h3>${Object.keys(d.updates).map(id => `<button data-adopt-source="${esc(id)}">${esc(d.definition.nodes.find(n => n.id === id)!.name)} · 查看采用新版的影响</button>`).join('')}<p>已开展的后续工作继续使用实际采用的版本。</p></section>` : ''}<section class="wf-final"><h3>${d.run.status === 'COMPLETED' ? '最终交付' : '本次运行记录'}</h3>${d.run.status === 'COMPLETED' ? d.definition.outputs.map(o => outputs(d, o.nodeId, currentNode(d.run, o.nodeId).generation)).join('') : ''}<ol>${d.run.events.slice(-10).reverse().map(e => `<li><time>${new Date(e.at).toLocaleTimeString('zh-CN')}</time> ${esc(e.detail)}</li>`).join('')}</ol></section>`, `${enabled ? '<button id="wf-pause">暂停本次流程</button>' : d.run.status === 'PAUSED' ? '<button id="wf-resume" class="primary">恢复流程</button>' : ''}<button id="wf-refresh">刷新</button>`);
  root.querySelectorAll<HTMLButtonElement>('[data-node]').forEach(b => b.onclick = () => { selectedNode = b.dataset.node!; drawRun(d); }); wireOutputs(root, d);
  bind(root, '#wf-structure', () => openDefinition(d.definition.id)); bind(root, '#wf-all-runs', runs); bind(root, '#wf-refresh', () => openRun(d.run.id));
  bind(root, '#wf-start', async () => { const id = await chooseExecutor(); if (id) { await api('dispatch', { ...command(d), executorId: id }); await openRun(d.run.id); } });
  bind(root, '#wf-work', async () => { const dashboard = await window.workpet.getDashboard(n.workId!); root.close(); changed(dashboard); });
  bind(root, '#wf-copy', () => window.workpet.copyWorkPackage(n.workId!));
  bind(root, '#wf-submit', () => submission(d)); bind(root, '#wf-review', () => review(d)); bind(root, '#wf-rework', async () => rework(d));
  bind(root, '#wf-pause', async () => { await api('status', { ...command(d), status: 'PAUSED' }); await openRun(d.run.id); });
  bind(root, '#wf-resume', async () => { await api('status', { ...command(d), status: 'RUNNING' }); await openRun(d.run.id); });
  root.querySelectorAll<HTMLButtonElement>('[data-adopt-source]').forEach(b => b.onclick = () => { void adopt(d, b.dataset.adoptSource!).catch(e => error(root, e)); });
}
async function submission(d: RunDetail): Promise<void> {
  const n = currentNode(d.run, selectedNode), ports = outputPorts(d.contracts[selectedNode]!);
  const artifacts = await window.workpet.distillation('artifacts', { workId: n.workId });
  const m = modal('提交本轮成果', `<p>${esc(d.run.name)} / 第 ${n.generation} 轮。提交后仍需用户验收。</p>${ports.map(p => control(p, n.outputs.find(o => o.key === p.key)?.value ?? '')).join('')}${artifacts.length ? `<details><summary>本次工作已登记的文件</summary>${artifacts.map((a: { filename: string; path: string }) => `<p>${esc(a.filename)}<small>${esc(a.path)}</small></p>`).join('')}</details>` : ''}`, '<button id="wf-submit-outputs" class="primary">提交验收</button>'); bindFiles(m);
  bind(m, '#wf-submit-outputs', async () => { await api('submit', { ...command(d), outputs: readValues(m, ports) }); step.close(); await openRun(d.run.id); });
}
async function review(d: RunDetail): Promise<void> {
  const n = currentNode(d.run, selectedNode), checks = acceptanceChecks(d.contracts[selectedNode]!.content);
  const previews = await Promise.all(n.outputs.filter(o => o.material).map(async o => { const preview = await api('previewOutput', { runId: d.run.id, nodeId: selectedNode, generation: n.generation, key: o.key }); return preview.text === null ? '' : `<div class="wf-output"><strong>${esc(d.contracts[selectedNode]!.content.deliverables.find(p => p.key === o.key)?.text ?? o.key)}</strong><pre>${esc(preview.text)}</pre></div>`; }));
  const m = modal('验收交付', `<p>${esc(d.run.name)} / ${esc(d.definition.nodes.find(n => n.id === selectedNode)!.name)} / 第 ${n.generation} 轮</p><div class="wf-review-layout"><section class="wf-preview">${previews.join('')}${outputs(d, selectedNode, n.generation)}</section><section><h3>按工作约定核对</h3>${checks.map(c => `<label class="wf-check"><input type="checkbox" data-criterion="${esc(c.key)}">${esc(c.text)}</label>`).join('')}<label class="field">修改意见<textarea id="wf-review-note"></textarea></label></section></div>`, '<button id="wf-reject">退回修改</button><button id="wf-approve" class="primary">通过并继续</button>'); wireOutputs(m, d);
  const save = async (decision: 'PASS' | 'REVISE') => { const criteria = Object.fromEntries([...m.querySelectorAll<HTMLInputElement>('[data-criterion]')].map(e => [e.dataset.criterion!, e.checked ? 'PASS' : 'NEEDS_REVISION'])); await api('review', { ...command(d), decision, criteria, note: m.querySelector<HTMLTextAreaElement>('#wf-review-note')!.value.trim() }); step.close(); await openRun(d.run.id); };
  bind(m, '#wf-reject', () => save('REVISE')); bind(m, '#wf-approve', () => save('PASS'));
}
function rework(d: RunDetail): void {
  const m = modal('重做这一步', '<p>创建新一轮独立工作，保留旧成果、验收与采用记录。后续已开展工作继续使用原版本。</p><label class="field">本轮修改要求<textarea id="wf-rework-note"></textarea></label>', '<button id="wf-confirm-rework" class="primary">创建新一轮</button>');
  bind(m, '#wf-confirm-rework', async () => { await api('rework', { ...command(d), note: m.querySelector<HTMLTextAreaElement>('#wf-rework-note')!.value.trim() }); step.close(); await openRun(d.run.id); });
}
async function adopt(d: RunDetail, source: string): Promise<void> {
  const affected: string[] = await api('impact', { runId: d.run.id, nodeId: source });
  const m = modal('确认重做后续工作', `<p>采用 ${esc(d.definition.nodes.find(n => n.id === source)!.name)} 第 ${currentNode(d.run, source).generation} 轮已验收成果。</p><ul>${affected.map(id => `<li>${esc(d.definition.nodes.find(n => n.id === id)!.name)}</li>`).join('')}</ul><p>保留旧交付、历史验收及其他独立运行。外部旧工作仍可能继续，其迟到成果归入旧代次。</p>`, `<button id="wf-confirm-adopt" class="primary">确认重做这 ${affected.length} 步</button>`);
  bind(m, '#wf-confirm-adopt', async () => { await api('adopt', command(d, source)); step.close(); await openRun(d.run.id); });
}
export function setupWorkflows(onChanged: typeof changed): void {
  changed = onChanged;
  setInterval(() => {
    if (!root.open || !active || changing || step.open || document.querySelector('dialog[open]:not(#workflow-dialog), .secondary-menu[open]') || document.activeElement?.matches('input,textarea,select')) return;
    const id = active.run.id; void api('detail', { runId: id }).then((next: RunDetail) => { if (active?.run.id === id && JSON.stringify(next) !== JSON.stringify(active)) { active = next; drawRun(next); } }).catch(e => error(root, e));
  }, 2500);
}
