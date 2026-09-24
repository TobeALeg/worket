// Measured from the generated PNG alpha bounds. No raster rewriting or CSS character recreation.
// Crop rectangles include a common transparent crown area or the fixed 32×68 dock viewport.
const ATLAS_SIZE = 1254;
const FREE_SCALE = 78 / 490;
const DOCK_SCALE = 32 / 269;
const poses = {
  'free-rest': { asset: 'clay-poses-v1.png', x: 65, y: 106, width: 504, height: 483, scale: FREE_SCALE },
  'free-bud': { asset: 'clay-poses-v2.png', x: 682, y: 106, width: 504, height: 483, scale: FREE_SCALE },
  'dock-rest': { asset: 'clay-poses-v2.png', x: 201, y: 650, width: 269, height: 571, scale: DOCK_SCALE },
  'dock-bud': { asset: 'clay-poses-v2.png', x: 803, y: 650, width: 269, height: 571, scale: DOCK_SCALE },
};
const NS = 'http://www.w3.org/2000/svg';
let state = new URLSearchParams(location.search).get('state') === 'rest' ? 'rest' : 'bud';
const $ = selector => document.querySelector(selector);

function pose(name, magnification = 1) {
  const spec = poses[name];
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `${spec.x} ${spec.y} ${spec.width} ${spec.height}`);
  svg.setAttribute('width', String(spec.width * spec.scale * magnification));
  svg.setAttribute('height', String(spec.height * spec.scale * magnification));
  svg.setAttribute('aria-hidden', 'true');
  svg.dataset.pose = name;
  const image = document.createElementNS(NS, 'image');
  image.setAttribute('href', `assets/${spec.asset}`);
  image.setAttribute('width', String(ATLAS_SIZE));
  image.setAttribute('height', String(ATLAS_SIZE));
  svg.append(image);
  return svg;
}

for (const art of document.querySelectorAll('.art')) {
  const name = art.dataset.pose;
  const group = document.createElement('div');
  group.className = name.startsWith('dock') ? 'edge-enlargement' : 'free-enlargement';
  group.append(pose(name, name.startsWith('dock') ? 3 : 2.4));
  art.append(group);
}

function renderNative() {
  $('#native-pet').replaceChildren(pose(`free-${state}`));
  for (const container of document.querySelectorAll('.native-edge')) {
    const frame = document.createElement('div');
    frame.className = `dock-window ${container.dataset.edge}`;
    const body = document.createElement('div');
    body.className = 'dock-pose';
    body.append(pose(`dock-${state}`));
    frame.append(body);
    container.querySelector('.edge-slot').replaceChildren(frame);
  }
  for (const button of document.querySelectorAll('[data-state]')) button.setAttribute('aria-pressed', String(button.dataset.state === state));
  const url = new URL(location.href);
  url.searchParams.delete('variant');
  url.searchParams.set('state', state);
  history.replaceState(null, '', url);
  renderStatus();
}
function renderStatus() {
  $('#view-state').textContent = `${state === 'bud' ? '有啾啾' : '日常'} · ${document.body.dataset.background === 'dark' ? '深色' : '浅色'}背景`;
}
for (const button of document.querySelectorAll('[data-state]')) button.addEventListener('click', () => {state = button.dataset.state;renderNative();});
$('#background').addEventListener('click', () => {
  const dark = document.body.dataset.background !== 'dark';
  document.body.dataset.background = dark ? 'dark' : 'light';
  $('#background').textContent = dark ? '浅色背景' : '深色背景';
  $('#background').setAttribute('aria-pressed', String(dark));
  renderStatus();
});
$('#reference').addEventListener('click', () => $('#reference-dialog').showModal());
$('#close-reference').addEventListener('click', () => $('#reference-dialog').close());
renderNative();
