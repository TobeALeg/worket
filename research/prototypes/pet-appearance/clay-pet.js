// State names follow PetState and DistillationActivity. Updates are a separate visual proposal.
export const states = [
  { id: 'sleeping', label: '休息', color: '#a6a093', detail: '闭眼休息，安静待机。' },
  { id: 'awake', label: '记录中', color: '#3f9d70', detail: '睁开眼睛，轻轻呼吸；贴边后只让绿点缓慢明暗。' },
  { id: 'waiting', label: '等待接入', color: '#d49b22', detail: '睁眼等候，琥珀色提示点常亮。' },
  { id: 'carrying', label: '携带', color: '#377fd2', detail: '小幅上下起伏，蓝点保持可见。现有状态定义保留，尚无业务触发。', reserved: true },
  { id: 'alert', label: '提醒', color: '#b6262e', detail: '轻摇三次后停下，留下红色提示。现有状态定义保留，尚无业务触发。', reserved: true },
  { id: 'distilling-running', label: '沉淀中', color: '#8b6537', detail: '便利贴上的线条依次亮起，棕色提示点缓慢明暗。' },
  { id: 'distilling-ready', label: '待审阅', color: '#3f9d70', detail: '轻跳三次后安静下来，绿色勾号提示可以审阅。', symbol: 'check' },
  { id: 'distilling-failed', label: '需处理', color: '#b6262e', detail: '轻摇三次后停下，红色叹号提示需要处理。', symbol: 'alert' },
];

export const updates = [
  { id: 'none', label: '收起', detail: '没有小芽' },
  { id: 'available', label: '有更新', detail: '短颈小芽出现' },
  { id: 'receiving', label: '接收中', detail: '小芽周围轻轻扩散' },
  { id: 'ready', label: '已就绪', detail: '芽尖短暂亮起' },
];

const NS = 'http://www.w3.org/2000/svg';
const ATLAS_SIZE = 1254;
const FREE_SCALE = 78 / 490;
const DOCK_SCALE = 32 / 269;
const EDGE_ROTATION = { right: 0, left: 180, top: -90, bottom: 90 };
// Alpha-measured viewports preserve the approved body, note, paws and sprout pixels.
const poses = {
  free: { x: 65, y: 106, width: 504, height: 483, scale: FREE_SCALE, asset: 'clay-poses-v1.png', eyeRects: [[212, 377, 60, 59], [360, 377, 60, 59]], dot: [528, 542, 29], note: [402, 270] },
  'free-bud': { x: 682, y: 106, width: 504, height: 483, scale: FREE_SCALE, asset: 'clay-poses-v2.png', eyeRects: [[830, 377, 61, 59], [976, 377, 61, 59]], dot: [1145, 542, 29], note: [1019, 272], bud: [940, 157] },
  dock: { x: 201, y: 650, width: 269, height: 571, scale: DOCK_SCALE, asset: 'clay-poses-v2.png', eyeRects: [[359, 855, 47, 61], [359, 957, 47, 61]], dot: [323, 1095, 18] },
  'dock-bud': { x: 803, y: 650, width: 269, height: 571, scale: DOCK_SCALE, asset: 'clay-poses-v2.png', eyeRects: [[962, 855, 48, 61], [962, 957, 48, 61]], dot: [925, 1095, 18], bud: [856, 938] },
};
let serial = 0;

function svgElement(tag, attributes = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function atlasImage(asset, attributes = {}) {
  return svgElement('image', { href: `assets/${asset}`, width: ATLAS_SIZE, height: ATLAS_SIZE, ...attributes });
}

function sprite(spec, state, update, magnification, edge) {
  const svg = svgElement('svg', {
    viewBox: `${spec.x} ${spec.y} ${spec.width} ${spec.height}`,
    width: spec.width * spec.scale * magnification,
    height: spec.height * spec.scale * magnification,
    'aria-hidden': 'true',
  });
  svg.append(atlasImage(spec.asset));
  if (state.id !== 'sleeping') {
    // Use only the generated eye patches: every pixel outside these clips is the approved atlas.
    const clipId = `awake-eyes-${++serial}`;
    const defs = svgElement('defs');
    const clip = svgElement('clipPath', { id: clipId, clipPathUnits: 'userSpaceOnUse' });
    for (const [x, y, width, height] of spec.eyeRects) clip.append(svgElement('rect', { x, y, width, height, rx: 12 }));
    defs.append(clip);
    svg.append(defs, atlasImage('clay-poses-awake-v3.png', { 'clip-path': `url(#${clipId})`, class: 'awake-eyes' }));
  }
  if (spec.note && state.id === 'distilling-running') {
    const [x, y] = spec.note;
    for (let i = 0; i < 3; i++) svg.append(svgElement('path', {
      class: 'note-activity', d: `M${x} ${y + i * 17}l${i === 2 ? 39 : 58} 7`,
      style: `animation-delay:${i * 0.2}s`,
    }));
  }
  if (spec.bud && (update === 'receiving' || update === 'ready')) {
    const [cx, cy] = spec.bud;
    svg.append(svgElement('circle', { class: `bud-${update}`, cx, cy, r: update === 'receiving' ? 29 : 15, style: `transform-origin:${cx}px ${cy}px` }));
  }
  const [cx, cy, r] = spec.dot;
  const badge = svgElement('g', { class: 'status-badge' });
  badge.append(svgElement('circle', { cx, cy, r, fill: state.color, stroke: '#fff7df', 'stroke-width': r * 0.25 }));
  const symbol = state.symbol ?? (state.id === 'alert' ? 'alert' : null);
  if (symbol) {
    const icon = svgElement('path', {
      d: symbol === 'check'
        ? `M${cx - r * .45} ${cy}l${r * .3} ${r * .32}l${r * .6} ${-r * .65}`
        : `M${cx} ${cy - r * .5}v${r * .55}M${cx} ${cy + r * .45}v.2`,
      fill: 'none', stroke: '#fff9e9', 'stroke-width': r * .21, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      transform: `rotate(${-EDGE_ROTATION[edge ?? 'right']} ${cx} ${cy})`,
    });
    badge.append(icon);
  }
  svg.append(badge);
  return svg;
}

export function createPet({ state: stateId = 'awake', update = 'none', edge = null, magnification = 1 } = {}) {
  const state = states.find(item => item.id === stateId) ?? states[1];
  const pose = `${edge ? 'dock' : 'free'}${update !== 'none' ? '-bud' : ''}`;
  const spec = poses[pose];
  const pet = document.createElement('div');
  pet.className = `clay-pet${edge ? ' dock-window' : ''}${edge ? ` ${edge}` : ''}`;
  pet.dataset.state = state.id;
  pet.dataset.update = update;
  pet.dataset.pose = pose;
  pet.dataset.edge = edge ?? 'free';
  pet.style.setProperty('--magnification', magnification);
  pet.style.setProperty('--lift', `${-1.5 * magnification}px`);
  const body = document.createElement('div');
  body.className = edge ? 'dock-pose' : 'free-pose';
  body.append(sprite(spec, state, update, magnification, edge));
  pet.append(body);
  return pet;
}
