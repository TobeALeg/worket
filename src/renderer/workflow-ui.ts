import type { Port, Binding, WorkflowDefinition, WorkflowNode } from '../workflows/types.js';
import { dependencies, outputPorts } from '../workflows/types.js';
import type { Definition, Inputs } from '../definitions/repository.js';

export const esc = (v: unknown): string => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const api = (action: string, input: unknown = {}): Promise<any> => window.workpet.workflow(action, input);
export const cid = (): string => crypto.randomUUID();
export function control(p: Pick<Port, 'key' | 'text' | 'valueType' | 'choices' | 'required'>, value: unknown = '', prefix = 'value'): string {
  const attrs = `data-${prefix}="${esc(p.key)}" aria-label="${esc(p.text)}"`;
  const input = p.valueType === 'FILE' ? `<div class="wf-file"><input ${attrs} value="${esc(value)}" readonly><button type="button" data-file="${esc(p.key)}">选择文件</button></div>`
    : p.valueType === 'BOOLEAN' ? `<select ${attrs}><option value="">请选择</option><option value="true" ${value === true ? 'selected' : ''}>是</option><option value="false" ${value === false ? 'selected' : ''}>否</option></select>`
    : p.valueType === 'CHOICE' ? `<select ${attrs}><option value="">请选择</option>${p.choices?.map(c => `<option ${value === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`
    : p.valueType === 'NUMBER' ? `<input type="number" ${attrs} value="${esc(value)}">` : `<textarea ${attrs}>${esc(value)}</textarea>`;
  return `<label class="field"><span>${esc(p.text)}${p.required ? ' *' : ''}<small> ${esc(p.valueType)}</small></span>${input}</label>`;
}
export function readValues(host: HTMLElement, ports: Pick<Port, 'key' | 'valueType'>[], prefix = 'value'): Inputs {
  return Object.fromEntries(ports.flatMap(p => { const e = host.querySelector<HTMLInputElement>(`[data-${prefix}="${CSS.escape(p.key)}"]`); const v = e?.value ?? ''; return v === '' ? [] : [[p.key, p.valueType === 'BOOLEAN' ? v === 'true' : p.valueType === 'NUMBER' ? Number(v) : v]]; }));
}
export function bindFiles(host: HTMLElement, prefix = 'value'): void {
  host.querySelectorAll<HTMLButtonElement>('[data-file]').forEach(b => b.onclick = async () => {
    b.disabled = true; try { const path = await window.workpet.chooseDefinitionFile(); if (path) host.querySelector<HTMLInputElement>(`[data-${prefix}="${CSS.escape(b.dataset.file!)}"]`)!.value = path; }
    finally { b.disabled = false; }
  });
}
export function bindingLabel(b: Binding | undefined, d: { inputs: Port[]; nodes: WorkflowNode[] }, contracts: Record<string, Definition>): string {
  if (!b) return '未连接';
  if (b.type === 'VALUE') return `固定值：${b.value}`;
  if (b.type === 'INPUT') return `流程输入 / ${d.inputs.find(p => p.key === b.key)?.text ?? b.key}`;
  return `${d.nodes.find(n => n.id === b.nodeId)?.name ?? b.nodeId} → ${contracts[b.nodeId]?.content.deliverables.find(p => p.key === b.key)?.text ?? b.key}`;
}
/** Positions and connectors depend on the real graph, including parallel branches. */
export function graph(d: Pick<WorkflowDefinition, 'nodes'>, contracts: Record<string, Definition>, phases: Record<string, string> = {}, selected = '', compact = false): string {
  const levels = new Map<string, number>(), visiting = new Set<string>();
  const depth = (n: WorkflowNode): number => { if (levels.has(n.id)) return levels.get(n.id)!; if (visiting.has(n.id)) return 0; visiting.add(n.id); const level = Math.max(-1, ...dependencies(n).map(id => d.nodes.find(x => x.id === id)).filter((x): x is WorkflowNode => !!x).map(depth)) + 1; visiting.delete(n.id); levels.set(n.id, level); return level; };
  d.nodes.forEach(depth); const groups = new Map<number, WorkflowNode[]>();
  d.nodes.forEach(n => { const l = levels.get(n.id)!; groups.set(l, [...(groups.get(l) ?? []), n]); });
  const cardWidth = compact ? 172 : 200, cardHeight = compact ? 174 : 178, columnGap = compact ? 196 : 258, rowGap = compact ? 236 : 220;
  const height = compact ? Math.max(1, ...[...groups.values()].map(g => g.length)) * rowGap - 12 : Math.max(1, ...[...groups.values()].map(g => g.length)) * rowGap + 32, width = compact ? Math.max(1, groups.size) * columnGap + 48 : Math.max(1, groups.size) * columnGap - 26;
  const pos = Object.fromEntries(d.nodes.map(n => { const group = groups.get(levels.get(n.id)!)!, i = group.indexOf(n); return [n.id, { x: 16 + levels.get(n.id)! * columnGap, y: (height - cardHeight) / 2 + (i - (group.length - 1) / 2) * rowGap }]; }));
  const lines = d.nodes.flatMap(n => dependencies(n).flatMap(id => { const a = pos[id], b = pos[n.id]; if (!a || !b) return []; const x = a.x + cardWidth, y = a.y + cardHeight / 2, mid = (x + b.x) / 2; return [`<path d="M${x} ${y} H${mid} V${b.y + cardHeight / 2} H${b.x}"/><path d="M${b.x - 6} ${b.y + cardHeight / 2 - 4} L${b.x} ${b.y + cardHeight / 2} L${b.x - 6} ${b.y + cardHeight / 2 + 4}"/>`]; })).join('');
  return `<div class="wf-graph-scroll"><div class="wf-graph" style="width:${width}px;height:${height}px;--wf-node-width:${cardWidth}px;--wf-node-height:${cardHeight}px"><svg width="${width}" height="${height}" aria-hidden="true">${lines}</svg>${d.nodes.map(n => { const c = contracts[n.id], state = phases[n.id] ?? '已连接', p = pos[n.id]!; return `<button class="wf-node ${selected === n.id ? 'selected' : ''}" data-node="${esc(n.id)}" style="left:${p.x}px;top:${p.y}px"><span class="wf-category"><span>${esc(c?.category ?? '工作')}</span><span>v${c?.version ?? ''}</span></span><strong>${esc(n.name)}</strong><small>输入 ${esc(c?.content.inputs.map(p => p.text).join('、') || '无')}</small><small>输出 ${esc(c ? outputPorts(c).map(p => p.text).join('、') : '')}</small><span class="wf-phase ${state === '待验收' ? 'review' : ''}">${esc(state)}</span></button>`; }).join('')}</div></div>`;
}
