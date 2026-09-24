import type { PetState, PetUpdateState } from "../ui-contract.js";

export type PetVisualState = PetState | "distilling-running" | "distilling-ready" | "distilling-failed";
const colors: Record<PetVisualState, string | null> = {
  sleeping: null, awake: "#55d59b", waiting: "#ffae58", carrying: "#76baff", alert: "#ff7969",
  "distilling-running": "#b294f6", "distilling-ready": "#c1fff1", "distilling-failed": "#ff7969",
};
type Pair = readonly [number, number];
type Box = readonly [number, number, number, number];
type Pose = {
  x: number; y: number; width: number; height: number; scale: number;
  eyeRects: readonly Box[]; note?: Pair; bud: Pair; tip: Box; fade: Box; highlight: Pair; halo: Pair;
};
type Attributes = Record<string, string | number>;

const NS = 'http://www.w3.org/2000/svg';
const ATLAS_SIZE = 1254;
const FREE_SCALE = 78 / 490;
const DOCK_SCALE = 32 / 269;
// Alpha-measured viewports preserve the approved body, note, paws and sprout pixels.
// The sprout is now present in every state. The tip mask fades before its gold neck joins the body.
const poses: Record<"free" | "dock", Pose> = {
  free: { x: 682, y: 106, width: 504, height: 483, scale: FREE_SCALE, eyeRects: [[830, 377, 61, 59], [976, 377, 61, 59]], note: [1019, 272], bud: [939, 156], tip: [912, 136, 53, 44], fade: [939, 165, 939, 179], highlight: [939, 149], halo: [34, 30] },
  dock: { x: 803, y: 650, width: 269, height: 571, scale: DOCK_SCALE, eyeRects: [[962, 855, 48, 61], [962, 957, 48, 61]], bud: [857, 939], tip: [834, 918, 54, 42], fade: [866, 939, 886, 939], highlight: [852, 933], halo: [30, 28] },
};
let serial = 0;

function svgElement<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Attributes = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function atlasImage(asset: string, attributes: Attributes = {}) {
  return svgElement('image', { href: `pet-assets/${asset}`, width: ATLAS_SIZE, height: ATLAS_SIZE, ...attributes });
}

function budLight(spec: Pose, color: string, defs: SVGDefsElement, id: string) {
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
  const rgb = color.slice(1).match(/../g)!.map(value => parseInt(value, 16) / 255);
  const matrix = rgb.flatMap(value => [.2126 * value * .72, .7152 * value * .72, .0722 * value * .72, 0, value * .28]);
  tint.append(svgElement('feColorMatrix', { type: 'matrix', values: [...matrix, 0, 0, 0, 1, 0].join(' ') }));
  const halo = svgElement('radialGradient', { id: `${id}-halo` });
  halo.append(...([[0, .46], [.5, .22], [1, 0]] as const).map(([offset, opacity]) => svgElement('stop', { offset, 'stop-color': color, 'stop-opacity': opacity })));
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

function updateSignal(spec: Pose, update: PetUpdateState, docked: boolean) {
  const [cx, cy] = spec.bud;
  const signal = svgElement('g', { class: 'update-signal', transform: `translate(${cx} ${cy}) rotate(${docked ? -90 : 0})` });
  const paths = ['M-26 -18Q0 -40 26 -18', 'M-34 -29Q0 -57 34 -29'];
  for (const [index, d] of paths.slice(0, update === 'available' ? 1 : 2).entries()) {
    signal.append(svgElement('path', { class: 'update-wave', d, style: `animation-delay:${index * .35}s` }));
  }
  return signal;
}

function sprite(spec: Pose, state: PetVisualState) {
  const svg = svgElement('svg', {
    viewBox: `${spec.x} ${spec.y} ${spec.width} ${spec.height}`,
    width: spec.width * spec.scale,
    height: spec.height * spec.scale,
    'aria-hidden': 'true',
  });
  const id = `clay-${++serial}`;
  const defs = svgElement('defs');
  svg.append(defs, atlasImage('clay-poses-v2.png'));
  if (state !== 'sleeping') {
    // Use only the generated eye patches: every pixel outside these clips is the approved atlas.
    const clipId = `${id}-eyes`;
    const clip = svgElement('clipPath', { id: clipId, clipPathUnits: 'userSpaceOnUse' });
    for (const [x, y, width, height] of spec.eyeRects) clip.append(svgElement('rect', { x, y, width, height, rx: 12 }));
    defs.append(clip);
    svg.append(atlasImage('clay-poses-awake-v3.png', { 'clip-path': `url(#${clipId})`, class: 'awake-eyes' }));
  }
  if (spec.note && state === 'distilling-running') {
    const [x, y] = spec.note;
    for (let i = 0; i < 3; i++) svg.append(svgElement('path', {
      class: 'note-activity', d: `M${x} ${y + i * 17}l${i === 2 ? 39 : 58} 7`,
      style: `animation-delay:${i * 0.2}s`,
    }));
  }
  const color = colors[state];
  if (color) svg.append(budLight(spec, color, defs, id));
  return svg;
}

// Placement polling must not rebuild the sprite or restart finite work-state notices.
export function createPetVisual(host: HTMLElement) {
  let previousState: PetVisualState | undefined;
  let previousDocked: boolean | undefined;
  let previousUpdate: PetUpdateState | undefined;
  let art: SVGSVGElement;
  return (state: PetVisualState, docked: boolean, update: PetUpdateState) => {
    const changed = state !== previousState || docked !== previousDocked;
    const spec = poses[docked ? "dock" : "free"];
    if (changed) {
      art = sprite(spec, state);
      host.replaceChildren(art);
      host.dataset.pose = docked ? "dock" : "free";
      host.dataset.state = state;
      previousState = state;
      previousDocked = docked;
    }
    if (changed || update !== previousUpdate) {
      art.querySelector(".update-signal")?.remove();
      if (update !== "none") art.append(updateSignal(spec, update, docked));
      host.dataset.update = update;
      previousUpdate = update;
    }
  };
}
