// State names follow PetState and DistillationActivity. Updates are a separate visual proposal.
export const states = [
  { id: 'sleeping', label: '休息', color: null, detail: '闭眼休息，啾啾熄灯，保留原来的金色。' },
  { id: 'awake', label: '记录中', color: '#55d59b', detail: '芽尖亮起柔和绿光，缓慢呼吸；贴边时身体保持安静。' },
  { id: 'waiting', label: '等待接入', color: '#ffae58', detail: '芽尖保持暖橙色，安静等候接入。' },
  { id: 'carrying', label: '携带', color: '#76baff', detail: '芽尖亮起天蓝色，身体小幅起伏。现有定义中的预留状态。', reserved: true },
  { id: 'alert', label: '提醒', color: '#ff7969', detail: '珊瑚红光短暂明暗三次，随后常亮。现有定义中的预留状态。', reserved: true },
  { id: 'distilling-running', label: '沉淀中', color: '#b294f6', detail: '芽尖淡紫色光缓慢明暗，便利贴上的线条依次亮起。' },
  { id: 'distilling-ready', label: '待审阅', color: '#c1fff1', detail: '芽尖亮起青白色，轻跳三次后安静等候审阅。' },
  { id: 'distilling-failed', label: '需处理', color: '#ff7969', detail: '珊瑚红光提示需要处理，轻摇三次后停住。' },
];

export const updates = [
  { id: 'none', label: '无更新', detail: '啾啾颜色表示工作状态' },
  { id: 'available', label: '有更新', detail: '一道细波纹提示新版本' },
  { id: 'receiving', label: '接收中', detail: '波纹向外轻轻扩散' },
  { id: 'ready', label: '已就绪', detail: '两道细波纹表示版本就绪' },
];

const NS = 'http://www.w3.org/2000/svg';
const ATLAS_SIZE = 1254;
const FREE_SCALE = 78 / 490;
const DOCK_SCALE = 32 / 269;
// Alpha-measured viewports preserve the approved body, note, paws and sprout pixels.
// The sprout is now present in every state. The tip mask fades before its gold neck joins the body.
const poses = {
  free: { x: 682, y: 106, width: 504, height: 483, scale: FREE_SCALE, eyeRects: [[830, 377, 61, 59], [976, 377, 61, 59]], note: [1019, 272], bud: [939, 156], tip: [912, 136, 53, 44], fade: [939, 165, 939, 179], highlight: [939, 149], halo: [34, 30] },
  dock: { x: 803, y: 650, width: 269, height: 571, scale: DOCK_SCALE, eyeRects: [[962, 855, 48, 61], [962, 957, 48, 61]], bud: [857, 939], tip: [834, 918, 54, 42], fade: [866, 939, 886, 939], highlight: [852, 933], halo: [30, 28] },
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

function budLight(spec, color, defs, id) {
  const [cx, cy] = spec.bud;
  const [x, y, width, height] = spec.tip;
  const [x1, y1, x2, y2] = spec.fade;
  const fade = svgElement('linearGradient', { id: `${id}-fade`, gradientUnits: 'userSpaceOnUse', x1, y1, x2, y2 });
  fade.append(svgElement('stop', { offset: 0, 'stop-color': 'white' }), svgElement('stop', { offset: 1, 'stop-color': 'black' }));
  const fadeMask = svgElement('mask', { id: `${id}-fade-mask`, maskUnits: 'userSpaceOnUse', x, y, width, height });
  fadeMask.append(svgElement('rect', { x, y, width, height, fill: `url(#${id}-fade)` }));
  const mask = svgElement('mask', { id: `${id}-tip`, maskUnits: 'userSpaceOnUse', x, y, width, height, style: 'mask-type:alpha' });
  mask.append(atlasImage('clay-poses-v2.png', { mask: `url(#${id}-fade-mask)` }));
  const tint = svgElement('filter', { id: `${id}-tint`, filterUnits: 'userSpaceOnUse', x, y, width, height, 'color-interpolation-filters': 'sRGB' });
  // Tint the existing alpha and luminance, retaining the organic outline and clay shading.
  const rgb = color.slice(1).match(/../g).map(value => parseInt(value, 16) / 255);
  const matrix = rgb.flatMap(value => [.2126 * value * .72, .7152 * value * .72, .0722 * value * .72, 0, value * .28]);
  tint.append(svgElement('feColorMatrix', { type: 'matrix', values: [...matrix, 0, 0, 0, 1, 0].join(' ') }));
  const halo = svgElement('radialGradient', { id: `${id}-halo` });
  halo.append(...[[0, .46], [.5, .22], [1, 0]].map(([offset, opacity]) => svgElement('stop', { offset, 'stop-color': color, 'stop-opacity': opacity })));
  const glint = svgElement('radialGradient', { id: `${id}-glint` });
  glint.append(svgElement('stop', { offset: 0, 'stop-color': '#f4fff9', 'stop-opacity': .7 }), svgElement('stop', { offset: 1, 'stop-color': color, 'stop-opacity': 0 }));
  defs.append(fade, fadeMask, mask, tint, halo, glint);
  const light = svgElement('g', { class: 'bud-status', 'data-color': color });
  light.append(svgElement('ellipse', { class: 'bud-halo', cx, cy, rx: spec.halo[0], ry: spec.halo[1], fill: `url(#${id}-halo)` }));
  const tip = svgElement('g', { mask: `url(#${id}-tip)` });
  tip.append(atlasImage('clay-poses-v2.png', { class: 'bud-tint', filter: `url(#${id}-tint)` }));
  tip.append(svgElement('ellipse', { cx: spec.highlight[0], cy: spec.highlight[1], rx: 14, ry: 11, fill: `url(#${id}-glint)` }));
  light.append(tip);
  return light;
}

function updateSignal(spec, update, docked) {
  const [cx, cy] = spec.bud;
  const signal = svgElement('g', { class: 'update-signal', transform: `translate(${cx} ${cy}) rotate(${docked ? -90 : 0})` });
  const paths = ['M-26 -18Q0 -40 26 -18', 'M-34 -29Q0 -57 34 -29'];
  for (const [index, d] of paths.slice(0, update === 'available' ? 1 : 2).entries()) {
    signal.append(svgElement('path', { class: 'update-wave', d, style: `animation-delay:${index * .35}s` }));
  }
  return signal;
}

function sprite(spec, state, update, magnification, edge) {
  const svg = svgElement('svg', {
    viewBox: `${spec.x} ${spec.y} ${spec.width} ${spec.height}`,
    width: spec.width * spec.scale * magnification,
    height: spec.height * spec.scale * magnification,
    'aria-hidden': 'true',
  });
  const id = `clay-${++serial}`;
  const defs = svgElement('defs');
  svg.append(defs, atlasImage('clay-poses-v2.png'));
  if (state.id !== 'sleeping') {
    // Use only the generated eye patches: every pixel outside these clips is the approved atlas.
    const clipId = `${id}-eyes`;
    const clip = svgElement('clipPath', { id: clipId, clipPathUnits: 'userSpaceOnUse' });
    for (const [x, y, width, height] of spec.eyeRects) clip.append(svgElement('rect', { x, y, width, height, rx: 12 }));
    defs.append(clip);
    svg.append(atlasImage('clay-poses-awake-v3.png', { 'clip-path': `url(#${clipId})`, class: 'awake-eyes' }));
  }
  if (spec.note && state.id === 'distilling-running') {
    const [x, y] = spec.note;
    for (let i = 0; i < 3; i++) svg.append(svgElement('path', {
      class: 'note-activity', d: `M${x} ${y + i * 17}l${i === 2 ? 39 : 58} 7`,
      style: `animation-delay:${i * 0.2}s`,
    }));
  }
  if (state.color) svg.append(budLight(spec, state.color, defs, id));
  if (update !== 'none') svg.append(updateSignal(spec, update, Boolean(edge)));
  return svg;
}

export function createPet({ state: stateId = 'awake', update = 'none', edge = null, magnification = 1 } = {}) {
  const state = states.find(item => item.id === stateId) ?? states[1];
  const pose = edge ? 'dock' : 'free';
  const spec = poses[pose];
  const pet = document.createElement('div');
  pet.className = `clay-pet${edge ? ' dock-window' : ''}${edge ? ` ${edge}` : ''}`;
  pet.dataset.state = state.id;
  pet.dataset.update = update;
  pet.dataset.pose = `${pose}-bud`;
  pet.dataset.edge = edge ?? 'free';
  pet.style.setProperty('--magnification', magnification);
  pet.style.setProperty('--lift', `${-1.5 * magnification}px`);
  const body = document.createElement('div');
  body.className = edge ? 'dock-pose' : 'free-pose';
  body.append(sprite(spec, state, update, magnification, edge));
  pet.append(body);
  return pet;
}
