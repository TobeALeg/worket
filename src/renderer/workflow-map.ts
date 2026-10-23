import type { Definition } from '../definitions/repository.js';
import { currentNode, dependencies, outputPorts, type RunDetail, type WorkflowContent, type WorkflowNode } from '../workflows/types.js';
import { esc } from './workflow-ui.js';

const WIDTH = 208, COLUMN = 288, GAP = 112, PADDING = 64;
const colors = [
  ['#8795a8', '#eff2f5'], ['#8c69d1', '#f2edf9'], ['#20a79a', '#eaf7f5'],
  ['#bd8e37', '#fbf4e5'], ['#588bd3', '#ecf3fb'], ['#83a656', '#f0f5e9'],
  ['#ad78b5', '#f5eef6'], ['#c17a68', '#fbefea'], ['#4b9aa6', '#eaf5f7'],
];
const views = new Map<string, { scale: number; fit: boolean; left: number; top: number }>();
const icons = { start: '612f5', end: '1c877', current: '2d68e', work: '91732' };
type Row = { key: string; text: string; kind: 'input' | 'output'; color: number; filled: boolean };
type Card = { node: WorkflowNode; rows: Row[]; height: number; x: number; y: number; level: number; state: string; tone: string; start: boolean; end: boolean; active: boolean; current: boolean };
export type MapModel = { cards: Card[]; width: number; height: number; connections: { from: string; to: string; output: string; input: string; color: number; orderOnly: boolean; ready: boolean; active: boolean }[] };

/** A presentation of the existing bindings and current/adopted generations; never another run state machine. */
export function mapModel(flow: WorkflowContent, contracts: Record<string, Definition>, detail?: RunDetail): MapModel {
  const identities = new Map<string, number>();
  flow.nodes.forEach(n => outputPorts(contracts[n.id]!).forEach(p => identities.set(`${n.id}:${p.key}`, identities.size % colors.length)));
  const levels = new Map<string, number>();
  const depth = (n: WorkflowNode, seen = new Set<string>()): number => {
    if (levels.has(n.id)) return levels.get(n.id)!;
    if (seen.has(n.id)) return 0;
    const next = new Set(seen).add(n.id);
    const value = 1 + Math.max(-1, ...dependencies(n).map(id => flow.nodes.find(x => x.id === id)).filter((x): x is WorkflowNode => !!x).map(x => depth(x, next)));
    levels.set(n.id, value); return value;
  };
  const cards: Card[] = flow.nodes.map(node => {
    const contract = contracts[node.id]!, run = detail && currentNode(detail.run, node.id);
    const active = !!run && run.phase === 'PREPARED' && detail!.phases[node.id] === '执行中';
    const state = !run ? '' : run.phase === 'ACCEPTED' ? '已完成' : run.phase === 'WAITING' ? '未到达' : detail!.phases[node.id] ?? '未到达';
    const tone = !run ? 'definition' : run.phase === 'ACCEPTED' ? 'done' : run.phase === 'SUBMITTED' ? 'review' : active ? 'running' : run.phase === 'WAITING' ? 'waiting' : 'ready';
    const rows: Row[] = contract.content.inputs.map(p => {
      const binding = node.bindings[p.key];
      const adopted = run?.adopted.find(a => a.inputKey === p.key);
      const ready = binding?.type === 'OUTPUT' && (!detail || !!adopted || currentNode(detail.run, binding.nodeId).phase === 'ACCEPTED');
      return { key: p.key, text: p.text, kind: 'input', color: binding?.type === 'OUTPUT' ? identities.get(`${binding.nodeId}:${binding.key}`) ?? 0 : -1, filled: !!ready };
    });
    rows.push(...outputPorts(contract).map(p => ({
      key: p.key, text: p.text, kind: 'output' as const, color: identities.get(`${node.id}:${p.key}`)!,
      filled: !detail ? flow.nodes.some(n => Object.values(n.bindings).some(b => b.type === 'OUTPUT' && b.nodeId === node.id && b.key === p.key)) : !!run?.outputs.some(o => o.key === p.key),
    })));
    const end = !flow.nodes.some(n => dependencies(n).includes(node.id));
    const current = active || run?.phase === 'SUBMITTED' || !!detail && detail.run.status === 'COMPLETED' && end;
    const height = 44 + rows.reduce((sum, r) => sum + (r.filled ? 28 : 18) + 8, 0);
    return { node, rows, height, x: 0, y: 0, level: depth(node), state, tone, start: !dependencies(node).length, end, active, current };
  });
  const connections: MapModel['connections'] = cards.flatMap(card => {
    const edges = Object.entries(card.node.bindings).flatMap(([input, b]) => {
      if (b.type !== 'OUTPUT') return [];
      const run = detail && currentNode(detail.run, card.node.id), adopted = run?.adopted.find(a => a.inputKey === input);
      const ready = !detail || !!adopted || currentNode(detail.run, b.nodeId).phase === 'ACCEPTED';
      return [{ from: b.nodeId, to: card.node.id, output: b.key, input, color: identities.get(`${b.nodeId}:${b.key}`) ?? 0, orderOnly: false, ready, active: ready && card.active && detail?.run.status === 'RUNNING' }];
    });
    return [...edges, ...card.node.after.filter(id => !edges.some(e => e.from === id)).map(id => ({ from: id, to: card.node.id, output: '', input: '', color: -1, orderOnly: true, ready: !detail || currentNode(detail.run, id).phase === 'ACCEPTED', active: false }))];
  });
  const linear = cards.every(c => dependencies(c.node).length <= 1 && cards.filter(n => dependencies(n.node).includes(c.node.id)).length <= 1) && cards.filter(c => c.start).length === 1;
  // Reserve the larger definition/runtime geometry, keeping node coordinates stable when switching views.
  const reserve = (card: Card) => 44 + card.rows.length * 36;
  if (linear) {
    const ordered = [...cards].sort((a, b) => a.level - b.level);
    const stride = Math.max(116, ...cards.map(reserve)) + GAP;
    ordered.forEach((card, i) => { const row = Math.floor(i / 4), col = row % 2 ? 3 - i % 4 : i % 4; card.x = PADDING + col * COLUMN; card.y = 48 + row * stride; });
  } else {
    const groups = new Map<number, Card[]>();
    cards.forEach(card => groups.set(card.level, [...groups.get(card.level) ?? [], card]));
    const maxRows = Math.max(1, ...[...groups.values()].map(g => g.length)), stride = Math.max(152, ...cards.map(reserve)) + GAP;
    cards.forEach(card => { const group = groups.get(card.level)!; card.x = PADDING + card.level * COLUMN; card.y = 48 + ((group.length === 1 && !card.start && dependencies(card.node).length === 1 ? 0 : (maxRows - group.length) / 2) + group.indexOf(card)) * stride; });
    // A single terminal below its parent keeps the final handoff within the workbench.
    const lastLevel = Math.max(0, ...cards.map(c => c.level)), last = groups.get(lastLevel), previous = groups.get(lastLevel - 1);
    if (lastLevel >= 4 && last?.length === 1 && previous?.length === 1 && dependencies(last[0]!.node).length === 1) {
      last[0]!.x = previous[0]!.x; last[0]!.y = previous[0]!.y + reserve(previous[0]!) + GAP;
    }
  }
  return { cards, connections, width: Math.max(480, ...cards.map(c => c.x + WIDTH + 64)), height: Math.max(400, ...cards.map(c => c.y + reserve(c) + 48)) };
}

const workIcon = (name: string) => /视频|成片/.test(name) ? 'aae1d' : /封面|图像|图片/.test(name) ? '3474f' : /调研|研究/.test(name) ? '10b5f' : /整理|发布|资料/.test(name) ? '3372c' : icons.work;
const icon = (name: keyof typeof icons) => `<img src="workflow-icons/${icons[name]}.svg" alt="" width="24" height="24">`;
export function workflowMap(flow: WorkflowContent, contracts: Record<string, Definition>, detail?: RunDetail, selected = ''): string {
  const model = mapModel(flow, contracts, detail);
  return `<div class="wf-map-tools"><span>${detail ? `${model.cards.filter(c => c.tone === 'done').length} 项已完成 · ${model.cards.filter(c => c.active).length} 项执行中` : `${flow.nodes.length} 项工作 · ${model.connections.filter(e => !e.orderOnly).length} 项输入输出依赖`}</span><div><button data-map-fit>适应画布</button><button data-map-zoom="-1" aria-label="缩小地图">−</button><button data-map-reset aria-label="原始大小">100%</button><button data-map-zoom="1" aria-label="放大地图">+</button></div></div><div class="wf-map-viewport" tabindex="0" aria-label="${detail ? '运行地图' : '定义地图'}，可滚动查看"><div class="wf-map-space"><div class="wf-map" style="width:${model.width}px;height:${model.height}px">${model.cards.map((c, i) => `<button class="wf-map-card ${c.tone} ${selected === c.node.id ? 'selected' : ''}" data-node="${esc(c.node.id)}" style="left:${c.x}px;top:${c.y}px" aria-pressed="${selected === c.node.id}"><span class="wf-map-card-header"><span class="wf-map-icon">${c.end ? icon('end') : c.current ? '' : c.start ? icon('start') : `<img src="workflow-icons/${workIcon(c.node.name)}.svg" alt="" width="24" height="24">`}${c.current ? icon('current') : ''}</span><strong>${String(i + 1).padStart(2, '0')} ${esc(c.node.name)}</strong></span>${c.state ? `<span class="wf-map-status">${esc(c.state)}</span>` : ''}${c.rows.map(r => { const palette = colors[r.color]; return `<span class="wf-map-row ${r.filled ? 'filled' : ''}" data-port="${r.kind}:${esc(r.key)}" style="${palette ? `--port-color:${palette[0]};--port-bg:${palette[1]}` : ''}"><small>${r.kind === 'input' ? '输入' : '输出'}</small><span>${esc(r.text)}</span></span>`; }).join('')}${!c.rows.length ? '<span class="wf-map-no-ports">无输入输出</span>' : ''}</button>`).join('')}<svg class="wf-map-lines" width="${model.width}" height="${model.height}" aria-hidden="true"></svg></div></div></div><footer class="wf-map-footer"><span>${esc(flow.name)} · ${detail ? '本次运行' : '流程定义'}</span>${detail ? '<span class="wf-map-legend"><i class="done"></i>已完成 <i class="running"></i>执行中 <i class="waiting"></i>未到达</span>' : ''}</footer>`;
}

/** Measure actual rows, so wrapped text and mixed backplates cannot detach a connector from its port. */
export function wireMap(host: HTMLElement, flow: WorkflowContent, contracts: Record<string, Definition>, detail?: RunDetail): () => void {
  const model = mapModel(flow, contracts, detail), canvas = host.querySelector<HTMLElement>('.wf-map')!, viewport = host.querySelector<HTMLElement>('.wf-map-viewport')!, space = host.querySelector<HTMLElement>('.wf-map-space')!;
  const svg = canvas.querySelector<SVGSVGElement>('svg')!;
  const viewKey = detail?.run.id ?? ('id' in flow ? String(flow.id) : flow.name);
  const saved = views.get(viewKey);
  let scale = saved?.scale ?? 1, fit = saved?.fit ?? false;
  const resize = () => {
    canvas.style.transform = `scale(${scale})`;
    space.style.width = `${model.width * scale}px`; space.style.height = `${model.height * scale}px`;
    host.querySelector<HTMLElement>('[data-map-reset]')!.textContent = `${Math.round(scale * 100)}%`;
  };
  const fitCanvas = () => { scale = Math.min(1, Math.max(.2, Math.min((viewport.clientWidth - 16) / model.width, (viewport.clientHeight - 16) / model.height))); resize(); };
  const draw = () => {
    const anchor = (id: string, kind: string, key: string, side: 'left' | 'right') => {
      const card = canvas.querySelector<HTMLElement>(`[data-node="${CSS.escape(id)}"]`)!;
      const row = card.querySelector<HTMLElement>(`[data-port="${kind}:${CSS.escape(key)}"]`);
      return { x: card.offsetLeft + (side === 'right' ? card.offsetWidth : 0), y: card.offsetTop + (row ? row.offsetTop + row.offsetHeight / 2 : 22) };
    };
    // Measure a common maximum surface/header for both views, including long text.
    const reservedHeight = (id: string) => {
      const card = canvas.querySelector<HTMLElement>(`[data-node="${CSS.escape(id)}"]`)!, clone = card.cloneNode(true) as HTMLElement;
      clone.removeAttribute('data-node'); clone.classList.remove('definition');
      clone.style.visibility = 'hidden'; clone.setAttribute('aria-hidden', 'true');
      clone.querySelectorAll('.wf-map-row').forEach(row => row.classList.add('filled'));
      canvas.append(clone); const height = clone.offsetHeight; clone.remove(); return height;
    };
    // Expand the vertical lanes for wrapped rows, without depending on runtime row surfaces.
    let bottom = 0;
    for (const x of new Set(model.cards.map(c => c.x))) {
      let columnBottom = 0;
      for (const card of model.cards.filter(c => c.x === x).sort((a, b) => a.y - b.y)) {
        const y = Math.max(card.y, columnBottom);
        canvas.querySelector<HTMLElement>(`[data-node="${CSS.escape(card.node.id)}"]`)!.style.top = `${y}px`;
        columnBottom = y + reservedHeight(card.node.id) + GAP;
      }
      bottom = Math.max(bottom, columnBottom);
    }
    model.height = Math.max(model.height, bottom - GAP + 48);
    canvas.style.height = `${model.height}px`; svg.setAttribute('height', String(model.height));
    svg.innerHTML = model.connections.map(e => {
      const source = canvas.querySelector<HTMLElement>(`[data-node="${CSS.escape(e.from)}"]`)!, target = canvas.querySelector<HTMLElement>(`[data-node="${CSS.escape(e.to)}"]`)!;
      const reverse = target.offsetLeft < source.offsetLeft, sameColumn = target.offsetLeft === source.offsetLeft;
      const loopLeft = sameColumn && source.offsetLeft === PADDING;
      const sourceSide = reverse || loopLeft ? 'left' : 'right', targetSide = reverse || sameColumn && !loopLeft ? 'right' : 'left';
      const a = anchor(e.from, 'output', e.output, sourceSide), b = anchor(e.to, 'input', e.input, targetSide), color = colors[e.color]?.[0] ?? '#a3a8ae';
      let path: string;
      if (sameColumn) {
        const outer = a.x + (loopLeft ? -56 : 56);
        path = `M${a.x} ${a.y} C${outer} ${a.y} ${outer} ${b.y} ${b.x} ${b.y}`;
      } else {
        const bend = Math.max(40, Math.abs(b.x - a.x) * .5), direction = reverse ? -1 : 1;
        path = `M${a.x} ${a.y} C${a.x + bend * direction} ${a.y} ${b.x - bend * direction} ${b.y} ${b.x} ${b.y}`;
      }
      const arrowBack = targetSide === 'left' ? -5 : 5;
      const arrow = `M${b.x + arrowBack} ${b.y - 3} L${b.x} ${b.y} L${b.x + arrowBack} ${b.y + 3}`;
      return `<g class="${e.ready ? '' : 'unreached'} ${e.orderOnly ? 'order-only' : ''}" style="color:${color}" data-map-edge="${esc(e.from)}:${esc(e.output)}→${esc(e.to)}:${esc(e.input)}"><path d="${path}"/><circle cx="${a.x}" cy="${a.y}" r="3"/><circle cx="${b.x}" cy="${b.y}" r="3"/><path d="${arrow}"/></g>${e.active ? `<path class="wf-map-flow-tail" pathLength="1" d="${path}" stroke="${color}"/><path class="wf-map-flow-head" pathLength="1" d="${path}" stroke="#438bff"/>` : ''}`;
    }).join('');
    if (fit) fitCanvas(); else resize();
  };
  host.querySelector<HTMLButtonElement>('[data-map-fit]')!.onclick = () => { fit = true; fitCanvas(); };
  host.querySelector<HTMLButtonElement>('[data-map-reset]')!.onclick = () => { fit = false; scale = 1; resize(); };
  host.querySelectorAll<HTMLButtonElement>('[data-map-zoom]').forEach(b => b.onclick = () => { fit = false; scale = Math.max(.2, Math.min(2, scale + Number(b.dataset.mapZoom) * .1)); resize(); });
  const observer = new ResizeObserver(draw);
  canvas.querySelectorAll<HTMLElement>('.wf-map-card').forEach(c => observer.observe(c));
  observer.observe(viewport); draw();
  viewport.scrollLeft = saved?.left ?? 0; viewport.scrollTop = saved?.top ?? 0;
  return () => { views.set(viewKey, { scale, fit, left: viewport.scrollLeft, top: viewport.scrollTop }); observer.disconnect(); };
}
