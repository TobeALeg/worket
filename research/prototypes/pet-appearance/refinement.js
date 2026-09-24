import { states, updates, createPet } from './clay-pet.js';

const $ = selector => document.querySelector(selector);
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let paused = motionPreference.matches;
let state;
let update;

function readLocation() {
  const query = new URLSearchParams(location.search);
  // Preserve the link used for the approved two-pose study.
  state = states.find(item => item.id === query.get('state')) ?? states[1];
  update = updates.find(item => item.id === query.get('update'))?.id ?? (query.get('state') === 'rest' ? 'none' : 'available');
}

function renderGallery() {
  $('#state-gallery').replaceChildren(...states.map(item => {
    const button = document.createElement('button');
    button.className = 'state-card surface';
    button.dataset.state = item.id;
    button.setAttribute('aria-label', `${item.label}${item.reserved ? '（预留状态）' : ''}`);
    button.setAttribute('aria-pressed', String(item.id === state.id));
    const art = document.createElement('span');
    art.className = 'card-art';
    art.append(createPet({ state: item.id, update }));
    const label = document.createElement('span');
    label.className = 'card-label';
    label.textContent = item.label;
    button.append(art, label);
    if (item.reserved) {
      const reserved = document.createElement('small');
      reserved.className = 'reserved';
      reserved.textContent = '预留';
      button.append(reserved);
    }
    button.addEventListener('click', () => {
      state = item;
      render();
      $(`.state-card[data-state="${item.id}"]`).focus({ preventScroll: true });
    });
    return button;
  }));
}

function renderFocus() {
  $('#focus-pet').replaceChildren(createPet({ state: state.id, update, magnification: 2.4 }));
  $('#focus-edge').replaceChildren(createPet({ state: state.id, update, edge: 'right', magnification: 2.8 }));
  $('#native-pet').replaceChildren(createPet({ state: state.id, update }));
  for (const container of document.querySelectorAll('.native-edge')) {
    container.querySelector('.edge-slot').replaceChildren(createPet({ state: state.id, update, edge: container.dataset.edge }));
  }
  $('#state-title').textContent = state.label;
  $('#state-category').textContent = state.reserved ? 'RESERVED' : state.id.startsWith('distilling') ? 'DISTILLATION' : 'DAILY';
  $('#state-description').textContent = state.detail;
  const item = updates.find(item => item.id === update);
  $('#update-description').textContent = item.detail;
  for (const button of document.querySelectorAll('#update-options button')) button.setAttribute('aria-pressed', String(button.dataset.update === update));
  renderStatus();
}

function renderStatus() {
  const status = updates.find(item => item.id === update);
  $('#view-state').textContent = `${state.label} · ${status.label} · ${paused ? '动效暂停' : '动效开启'}`;
}

function render(writeUrl = true) {
  renderGallery();
  renderFocus();
  if (writeUrl) {
    const url = new URL(location.href);
    url.searchParams.delete('variant');
    url.searchParams.set('state', state.id);
    url.searchParams.set('update', update);
    history.replaceState(null, '', url);
  }
}

function setMotion() {
  paused = paused || motionPreference.matches;
  document.body.dataset.motion = paused ? 'off' : 'on';
  $('#motion').textContent = motionPreference.matches ? '已减少动态效果' : paused ? '播放动效' : '暂停动效';
  $('#motion').disabled = motionPreference.matches;
  $('#replay').disabled = motionPreference.matches;
  $('#motion').setAttribute('aria-pressed', String(paused));
  renderStatus();
}

for (const item of updates) {
  const button = document.createElement('button');
  button.dataset.update = item.id;
  button.textContent = item.label;
  button.addEventListener('click', () => { update = item.id; render(); });
  $('#update-options').append(button);
}
$('#background').addEventListener('click', () => {
  const dark = document.body.dataset.background !== 'dark';
  document.body.dataset.background = dark ? 'dark' : 'light';
  $('#background').textContent = dark ? '浅色背景' : '深色背景';
  $('#background').setAttribute('aria-pressed', String(dark));
});
$('#motion').addEventListener('click', () => { paused = !paused; setMotion(); });
motionPreference.addEventListener('change', event => { paused = event.matches; setMotion(); });
$('#replay').addEventListener('click', () => { renderFocus(); });
$('#reference').addEventListener('click', () => $('#reference-dialog').showModal());
$('#close-reference').addEventListener('click', () => $('#reference-dialog').close());
window.addEventListener('popstate', () => { readLocation(); render(false); });
readLocation();
render();
setMotion();
