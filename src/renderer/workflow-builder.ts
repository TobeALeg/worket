import type { Definition } from '../definitions/repository.js';
import type { Binding, WorkflowContent, WorkflowDefinition, WorkflowNode } from '../workflows/types.js';
import { outputPorts } from '../workflows/types.js';
import { api, esc, cid, graph, bindingLabel, control, readValues } from './workflow-ui.js';

export type BuilderHost = { capture: () => () => boolean; page: (title: string, body: string, actions: string) => void; modal: (title: string, body: string, actions: string) => HTMLDialogElement; bind: (host: HTMLElement, selector: string, action: () => Promise<void>) => void; root: HTMLElement; closeModal: () => void };
export async function buildWorkflow(host: BuilderHost, done: (d: WorkflowDefinition) => Promise<void>, base?: WorkflowDefinition): Promise<void> {
  const valid = host.capture(), catalog: { contracts: Definition[] } = await api('catalog'); if (!valid()) return;
  const data: WorkflowContent = base ? structuredClone(base) : { name: '', inputs: [], nodes: [], outputs: [] };
  const contracts: Record<string, Definition> = {};
  for (const n of data.nodes) contracts[n.id] = await window.workpet.distillation('definition', { id: n.contractId });
  if (!valid()) return;
  let selected = data.nodes[0]?.id ?? '';
  const draw = (): void => {
    const n = data.nodes.find(n => n.id === selected), c = n ? contracts[n.id]! : undefined;
    if (!valid()) return;
    host.page('连接工作约定', `<label class="field">流程名称<input id="wf-name" maxlength="160" value="${esc(data.name)}"></label><div class="wf-inline"><select id="wf-contract"><option value="">选择已确认的 Contract</option>${catalog.contracts.map(c => `<option value="${esc(c.id)}">${esc(c.content.name)} · v${c.version}</option>`).join('')}</select><button id="wf-add-node">加入流程</button></div>${data.nodes.length ? `<div class="wf-run-layout">${graph(data, contracts, {}, selected)}<section class="wf-inspector"><h3>${esc(n?.name ?? '')}</h3>${n && c ? `<label class="field">节点名称<input id="wf-node-name" value="${esc(n.name)}" maxlength="160"></label><p>${esc(c.content.name)} · v${c.version}</p><h4>输入来源</h4>${c.content.inputs.map(p => `<button class="wf-binding" data-bind-input="${esc(p.key)}"><strong>${esc(p.text)} <small>${esc(p.valueType)}${p.required ? ' · 必填' : ''}</small></strong><span>${esc(bindingLabel(n.bindings[p.key], data, contracts))}</span></button>`).join('') || '<p>无须提供输入</p>'}<details><summary>仅控制顺序的前置工作</summary>${data.nodes.filter(x => x.id !== n.id).map(x => `<label class="wf-check"><input type="checkbox" data-after="${esc(x.id)}" ${n.after.includes(x.id) ? 'checked' : ''}>${esc(x.name)}</label>`).join('')}</details><button id="wf-output-types">确认输出类型</button><button id="wf-remove-node" class="destructive">移除此节点</button>` : ''}</section></div><section class="wf-final"><h3>最终交付</h3>${data.nodes.map(n => outputPorts(contracts[n.id]!).map(p => `<label class="wf-check"><input type="checkbox" data-final-node="${esc(n.id)}" data-final-key="${esc(p.key)}" ${data.outputs.some(o => o.nodeId === n.id && o.outputKey === p.key) ? 'checked' : ''}>${esc(n.name)} / ${esc(p.text)}</label>`).join('')).join('')}</section>` : ''}`, '<button id="wf-save" class="primary">保存流程版本</button>');
    host.root.querySelector<HTMLInputElement>('#wf-name')!.oninput = e => { data.name = (e.target as HTMLInputElement).value; };
    host.root.querySelectorAll<HTMLButtonElement>('[data-node]').forEach(b => b.onclick = () => { selected = b.dataset.node!; draw(); });
    host.bind(host.root, '#wf-add-node', async () => {
      const id = host.root.querySelector<HTMLSelectElement>('#wf-contract')!.value; if (!id) throw new Error('请先选择 Contract');
      const c = catalog.contracts.find(c => c.id === id)!;
      if (outputPorts(c).some(p => !p.valueType)) { await types(c, addNode); return; } addNode(c);
    });
    if (n && c) {
      host.root.querySelector<HTMLInputElement>('#wf-node-name')!.oninput = e => { n.name = (e.target as HTMLInputElement).value; };
      host.root.querySelectorAll<HTMLInputElement>('[data-after]').forEach(e => e.onchange = () => { n.after = [...host.root.querySelectorAll<HTMLInputElement>('[data-after]:checked')].map(e => e.dataset.after!); });
      host.root.querySelectorAll<HTMLButtonElement>('[data-bind-input]').forEach(b => b.onclick = () => binding(n, b.dataset.bindInput!));
      host.bind(host.root, '#wf-output-types', () => types(c, next => { n.contractId = next.id; contracts[n.id] = next; draw(); }));
      host.bind(host.root, '#wf-remove-node', async () => { data.nodes = data.nodes.filter(x => x.id !== n.id); data.outputs = data.outputs.filter(o => o.nodeId !== n.id); for (const other of data.nodes) { other.after = other.after.filter(id => id !== n.id); for (const [key, b] of Object.entries(other.bindings)) if (b.type === 'OUTPUT' && b.nodeId === n.id) delete other.bindings[key]; } selected = data.nodes[0]?.id ?? ''; draw(); });
    }
    host.root.querySelectorAll<HTMLInputElement>('[data-final-node]').forEach(e => e.onchange = () => { data.outputs = [...host.root.querySelectorAll<HTMLInputElement>('[data-final-node]:checked')].map((e, i) => ({ key: `final_${i + 1}`, nodeId: e.dataset.finalNode!, outputKey: e.dataset.finalKey! })); });
    host.bind(host.root, '#wf-save', async () => {
      const used = new Set(data.nodes.flatMap(n => Object.values(n.bindings).flatMap(b => b.type === 'INPUT' ? [b.key] : [])));
      const d = await api('save', { content: { name: data.name, inputs: data.inputs.filter(p => used.has(p.key)), nodes: data.nodes, outputs: data.outputs }, ...(base ? { baseId: base.id } : {}), commandId: cid() }); if (valid()) await done(d);
    });
  };
  function addNode(c: Definition): void {
    if (!valid()) return;
    const id = `n_${cid().replaceAll('-', '').slice(0, 12)}`, node: WorkflowNode = { id, name: c.content.name, contractId: c.id, bindings: {}, after: [] };
    for (const p of c.content.inputs) { const key = `${id}_${p.key.slice(0, 60)}`; data.inputs.push({ ...p, key, text: `${c.content.name} / ${p.text}` }); node.bindings[p.key] = { type: 'INPUT', key }; }
    data.nodes.push(node); contracts[id] = c; selected = id;
    data.outputs = outputPorts(c).map((p, i) => ({ key: `final_${i + 1}`, nodeId: id, outputKey: p.key })); host.closeModal(); draw();
  }
  async function types(c: Definition, next: (c: Definition) => void): Promise<void> {
    const m = host.modal('确认 Contract 输出类型', `<p>${esc(c.content.name)} · 当前 v${c.version}。确认变更将保存新版本，已有工作保持原版本。</p>${outputPorts(c).map(p => `<label class="field">${esc(p.text)}<select data-output-type="${esc(p.key)}">${['TEXT', 'FILE', 'NUMBER', 'BOOLEAN', ...(p.choices?.length ? ['CHOICE'] : [])].map(t => `<option ${p.valueType === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`).join('')}`, '<button id="wf-confirm-types" class="primary">确认并使用</button>');
    host.bind(m, '#wf-confirm-types', async () => { const types = Object.fromEntries([...m.querySelectorAll<HTMLSelectElement>('[data-output-type]')].map(e => [e.dataset.outputType!, e.value])); const d: Definition = await api('confirmPorts', { definitionId: c.id, expectedHash: c.contentHash, types, commandId: cid() }); if (!valid() || !m.open) return; catalog.contracts = catalog.contracts.filter(x => x.definitionKey !== c.definitionKey); catalog.contracts.push(d); host.closeModal(); next(d); });
  }
  function binding(n: WorkflowNode, key: string): void {
    const p = contracts[n.id]!.content.inputs.find(p => p.key === key)!, options: { label: string; binding: Binding; type: string }[] = [];
    for (const source of data.inputs) options.push({ label: `流程输入 / ${source.text}`, binding: { type: 'INPUT', key: source.key }, type: source.valueType });
    for (const source of data.nodes.filter(x => x.id !== n.id)) for (const o of outputPorts(contracts[source.id]!)) options.push({ label: `${source.name} → ${o.text}`, binding: { type: 'OUTPUT', nodeId: source.id, key: o.key }, type: o.valueType! });
    const m = host.modal('连接 Contract', `<p>${esc(n.name)} / ${esc(p.text)} · ${esc(p.valueType)}${p.required ? ' · 必填' : ''}</p><label class="field">输入来源<select id="wf-source"><option value="">请选择来源</option>${options.map((o, i) => `<option value="${i}" ${JSON.stringify(n.bindings[key]) === JSON.stringify(o.binding) ? 'selected' : ''}>${esc(o.label)} · ${esc(o.type)}</option>`).join('')}${p.valueType !== 'FILE' ? '<option value="fixed">固定值</option>' : ''}</select></label><div id="wf-fixed" hidden>${control({ ...p, required: true }, n.bindings[key]?.type === 'VALUE' ? n.bindings[key].value : '')}</div><p id="wf-binding-feedback" role="status"></p>`, '<button id="wf-save-binding" class="primary">保存连接</button>');
    const select = m.querySelector<HTMLSelectElement>('#wf-source')!, status = m.querySelector<HTMLElement>('#wf-binding-feedback')!;
    select.onchange = () => { m.querySelector<HTMLElement>('#wf-fixed')!.hidden = select.value !== 'fixed'; status.textContent = select.value !== '' && select.value !== 'fixed' && options[Number(select.value)]?.type !== p.valueType ? `类型不匹配：此输入需要 ${p.valueType}` : ''; };
    host.bind(m, '#wf-save-binding', async () => {
      if (select.value === 'fixed') { const v = readValues(m, [p])[p.key]; if (v === undefined) throw new Error('请提供固定值'); n.bindings[key] = { type: 'VALUE', value: v }; }
      else { const source = options[Number(select.value)]; if (select.value === '' || !source) throw new Error('请选择输入来源'); if (source.type !== p.valueType) throw new Error(`类型不匹配：此输入需要 ${p.valueType}`); n.bindings[key] = source.binding; }
      host.closeModal(); draw();
    });
  }
  draw();
}
