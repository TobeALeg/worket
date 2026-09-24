// Code-native character studies. Each silhouette is authored separately; state controls are shared.
const variants = [
  { id: 'A', name: '软糖小团', category: '原形进化', cost: '低', color: '#efbc57',
    recommendation: '优先试用', caption: '饱满轮廓 · 轻高光 · 更有神的眼睛',
    assessment: '保留圆团和便利贴，把精致感放在比例、眼神与阴影上。延续现有形象的成本最低。',
    implementation: 'CSS 渐变与可分层五官。沿用现有的 petState、便利贴点击和贴边旋转；主要改角色皮肤。',
    tradeoff: '品牌延续最强，但轮廓仍接近现有土豆。需要确认你想要的是精修，还是换一个新角色。',
    remaining: '对齐原生窗口命中区、便利贴 hover 和收纳过渡；补齐灰色 / 绿色 / 黄色状态规则。' },
  { id: 'B', name: '豆豆贴纸', category: '平面角色', cost: '低—中', color: '#f8d562',
    recommendation: '辨识度优先', caption: '不对称豆形 · 粗轮廓 · 小短手',
    assessment: '用轮廓和姿态建立性格，在复杂桌面上也更清楚。视觉更活泼，也更像一个独立角色。',
    implementation: 'SVG 轮廓加独立五官、手和便利贴。浏览器可直接渲染；不需要图片序列或 3D 引擎。',
    tradeoff: '粗描边在 1× 下可读性好，风格也更强；需要确认它是否过于卡通。贴边使用配套小头，不能直接裁掉半只身体。',
    remaining: '统一 Dock 图标、贴边小头和过渡姿势；验证深色桌面上的浅色外缘。' },
  { id: 'C', name: '纸页信使', category: '工作隐喻', cost: '中', color: '#ded0aa',
    recommendation: '', caption: '折角纸页 · 小表情 · 一点暖金色',
    assessment: '把记录工作的纸片变成角色本身，更有 Worket 的业务含义。品牌变化也最大。',
    implementation: 'SVG 折角、纸页和五官分层。翻角、呼吸可以做局部变换；试验页已用代码实现轮廓。',
    tradeoff: '角色与记录的关系直接，但“纸片本体”和“记录按钮”容易混淆。正式落地需要重新明确独立操作入口。',
    remaining: '决定点击纸页与点击角标的职责；配套设计贴边小纸页与应用图标。' },
  { id: 'D', name: '像素工友', category: '复古数码', cost: '中', color: '#e9b74b',
    recommendation: '', caption: '像素轮廓 · 方块五官 · 小背包',
    assessment: '用像素颗粒建立鲜明性格，动作可以很有趣。需要接受它与当前界面的风格反差。',
    implementation: '当前是 SVG 像素矢量，按整格绘制。正式可以保留 SVG，或把逐帧表情做成小型 sprite sheet。',
    tradeoff: '不依赖拟物纹理，状态扩展明确；非整数缩放容易出现不均匀像素，必须单独核对 1× 和 Retina。',
    remaining: '确定像素网格与显示倍率；按方向制作收纳和拖出关键帧，避免只旋转时显得僵硬。' },
  { id: 'E', name: '奶油陶土', category: '轻拟物', cost: '中—高', color: '#ebb269',
    recommendation: '材质近似', caption: '柔软体积 · 短手短脚 · 玩具感',
    assessment: '陪伴感来自体积和触感。当前可动版只是 CSS 材质近似；真实陶土质感需另一套素材。',
    implementation: '可先用透明 PNG / WebP 身体，加独立眼睛、便利贴和状态层。呼吸用局部变形即可，不必上实时 3D。',
    tradeoff: '素材一致性是主要成本：正面、四向贴边、表情要来自同一角色。把整只带脸 PNG 拉伸，只能得到粗略呼吸。',
    remaining: '制作可分层透明素材和贴边姿势；检查光照方向、边缘白边与小尺寸纹理。图像解码和多帧显存成本仍需实测。' },
];
const states = { sleeping: '休息', awake: '记录中', 'distilling-running': '沉淀中', 'distilling-ready': '完成', 'distilling-failed': '异常' };
let variant = variants.find(v => v.id === new URLSearchParams(location.search).get('variant')) ?? variants[0];
let state = 'awake';
let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
let serial = 0;
const $ = selector => document.querySelector(selector);

function vectorEyes(x1, x2, y) {
  return `<g class="vector-eyes"><ellipse cx="${x1}" cy="${y}" rx="3.5" ry="5"/><ellipse cx="${x2}" cy="${y}" rx="3.5" ry="5"/></g><g class="closed-eyes" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M${x1-4} ${y+1}h8M${x2-4} ${y+1}h8"/></g>`;
}

function bodyMarkup(id) {
  if (id === 'A' || id === 'E') return `<div class="soft-body"><span class="soft-highlight"></span><span class="soft-face"><i class="soft-eye left"></i><i class="soft-eye right"></i><i class="soft-mouth"></i><i class="cheek left"></i><i class="cheek right"></i></span></div>${id === 'E' ? '<i class="clay-arm left"></i><i class="clay-arm right"></i><i class="clay-foot left"></i><i class="clay-foot right"></i>' : ''}`;
  if (id === 'B') return `<svg class="character-vector" viewBox="0 0 104 94" aria-hidden="true"><g stroke="#383527" stroke-width="2.8" stroke-linejoin="round"><path fill="#ffe49a" d="M27 76q-8 11-1 14q9 1 13-11M66 78q2 12 12 11q5-5-3-15"/><path fill="#ffcf51" d="M22 41C13 50 14 69 23 78C37 91 73 87 83 75C94 61 89 46 78 38C69 31 70 14 54 12C37 9 35 26 29 35Z"/><path fill="#ffe49a" d="M19 54q-10 0-10 8q1 6 10 4M83 53q11-5 12 3q-1 8-9 9"/><path fill="none" stroke="#fff2bd" stroke-width="3" stroke-linecap="round" d="M39 28q3-11 13-10"/></g><g fill="#383527" color="#383527">${vectorEyes(38,62,51)}<path d="M45 65q6 6 12-1" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/></g><g fill="#e89057"><ellipse cx="28" cy="60" rx="5" ry="2.5"/><ellipse cx="73" cy="60" rx="5" ry="2.5"/></g></svg>`;
  if (id === 'C') { const uid = `paper-${++serial}`; return `<svg class="character-vector" viewBox="0 0 104 94" aria-hidden="true"><defs><linearGradient id="${uid}" x2=".7" y2="1"><stop stop-color="#fffef7"/><stop offset="1" stop-color="#e8debf"/></linearGradient></defs><g stroke="#706149" stroke-width="1.6" stroke-linejoin="round"><path fill="#ddb452" d="m28 77-5 11q0 4 10 1l8-10M66 79l7 11q9 2 9-3l-6-12"/><path fill="#edca77" d="M14 46q-10-1-10 6q0 6 10 7M88 44q11-2 11 4q0 6-10 10"/><path fill="#d6c6a1" d="m22 9 55 3 11 15-3 52-62 5-6-3Z"/><path fill="url(#${uid})" d="M17 8q30-5 55 1l17 17-4 51q-33 8-69 0Z"/><path fill="#fff9e8" d="m72 9-1 18 18-1Z"/><path fill="none" stroke="#d2c29e" d="M26 19h32M26 25h24"/></g><g fill="#51452f" color="#51452f">${vectorEyes(34,63,45)}<path d="M43 57q6 6 12 0" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></g><g fill="#d8b176" opacity=".6"><ellipse cx="23" cy="53" rx="5" ry="2"/><ellipse cx="74" cy="53" rx="5" ry="2"/></g><path d="M25 67h36M25 71h24" stroke="#d1c6ac" stroke-width="2" stroke-linecap="round"/></svg>`; }
  return `<svg class="character-vector pixel-vector" viewBox="0 0 104 94" aria-hidden="true" shape-rendering="crispEdges"><path fill="#463c2c" d="M32 12h40v4h12v8h8v40h-8v12h-8v12H60v-8H40v8H24V76h-8V64H8V44h8V24h8v-8h8Z"/><path fill="#eebd55" d="M32 20h40v4h12v40h-8v8H28v-8H16V48h8V28h8Z"/><path fill="#ffe292" d="M36 20h32v4H36v4h-8v12h-4V28h8v-4h4Z"/><path fill="#d79a37" d="M24 60h4v8h48v-8h8v8h-8v8H28v-4h-4Z"/><path fill="#ffe8a4" d="M12 48h8v12h-8M28 80h8v4h-8M64 80h8v4h-8"/><g class="vector-eyes" fill="#463c2c"><path d="M32 44h8v12h-8M60 44h8v12h-8"/></g><g class="closed-eyes" fill="#463c2c"><path d="M28 52h12v4H28M60 52h12v4H60"/></g><path fill="#fff9da" d="M32 44h4v4h-4M60 44h4v4h-4" class="pixel-eye-shine"/><path fill="#463c2c" d="M44 60h4v4h8v-4h4v8H44Z"/><path fill="#e98e55" d="M24 56h8v4h-8M68 56h8v4h-8"/></svg>`;
}

function mascot(id, native = false) {
  const el = document.createElement('div');
  el.className = `mascot variant-${id}${native ? ' native-mascot' : ''}`;
  el.dataset.state = state;
  el.innerHTML = `<div class="character-shadow"></div><div class="character-pose">${bodyMarkup(id)}<button class="note" aria-label="模拟便利贴入口"><i></i><i></i><i></i><span>记录</span></button><span class="state-badge" aria-hidden="true"></span></div>`;
  el.querySelector('.note').addEventListener('click', event => { event.stopPropagation(); $('#status').textContent = `已预览「${state.startsWith('distilling') ? '查看沉淀' : '记录工作'}」入口`; });
  return el;
}

function edge(id, direction) {
  const el = document.createElement('div');
  el.className = `edge-sample surface variant-${id}`;
  el.innerHTML = `<span class="edge-name">${{top:'上',right:'右',bottom:'下',left:'左'}[direction]}</span><div class="edge-window ${direction}"><div class="edge-pose" data-state="${state}"><div class="edge-head"><span class="edge-eyes"><i></i><i></i></span></div><div class="edge-hands"><i></i><i></i></div><span class="edge-badge"></span></div></div>`;
  return el;
}

function renderOptions() {
  for (const v of variants) {
    const button = document.createElement('button');
    button.className = 'option'; button.dataset.variant = v.id;
    button.setAttribute('aria-label', `${v.id} ${v.name}`);
    button.innerHTML = `<div class="option-top"><span>${v.id} / ${v.category}</span><span class="selection-dot"></span></div><div class="option-art"></div><div class="option-bottom"><strong>${v.name}</strong><span>${v.cost}成本</span></div>`;
    const preview = mascot(v.id); preview.querySelector('.note').replaceWith(Object.assign(document.createElement('span'), {className:'note',innerHTML:'<i></i><i></i><i></i>'}));
    button.querySelector('.option-art').append(preview);
    button.addEventListener('click', () => select(v));
    $('#options').append(button);
  }
}

function select(v, updateUrl = true) {
  variant = v;
  if (updateUrl) { const url = new URL(location.href); url.searchParams.set('variant', v.id); history.replaceState(null, '', url); }
  for (const button of document.querySelectorAll('.option')) button.setAttribute('aria-pressed', String(button.dataset.variant === v.id));
  $('#variant-number').textContent = v.id;
  $('#variant-title').textContent = v.name;
  $('#recommendation').textContent = v.recommendation;
  $('#recommendation').hidden = !v.recommendation;
  $('#hero-caption').textContent = v.caption;
  $('#hero').replaceChildren(mascot(v.id));
  $('#native').replaceChildren(mascot(v.id, true));
  $('#edges').replaceChildren(...['top','right','bottom','left'].map(d => edge(v.id, d)));
  $('#assessment').textContent = v.assessment;
  $('#switcher-label').textContent = `${v.id} / ${v.name}`;
  $('#status').textContent = `${states[state]} · ${paused ? '动效暂停' : '动效开启'}`;
  $('#implementation-title').textContent = `${v.id} · ${v.name}`;
  $('#implementation-body').innerHTML = `<dl><dt>实现成本：${v.cost}（相对判断）</dt><dd>${v.implementation}</dd><dt>取舍</dt><dd>${v.tradeoff}</dd><dt>接入前还需验证</dt><dd>${v.remaining}</dd></dl><p class="implementation-note">成本比较基于当前源码结构，不是工期承诺。此页验证外形与分层绘制，未接入真实 Worket 状态、拖动或系统窗口。</p>`;
  updateState();
}

function updateState() {
  for (const el of document.querySelectorAll('.mascot, .edge-pose')) el.dataset.state = state;
  for (const button of document.querySelectorAll('button[data-state]')) button.setAttribute('aria-pressed', String(button.dataset.state === state));
  for (const note of document.querySelectorAll('.note span')) note.textContent = state.startsWith('distilling') ? '查看' : '记录';
  $('#baseline').contentWindow?.postMessage({ type:'prototype-state', state, paused }, location.origin);
  $('#status').textContent = `${states[state]} · ${paused ? '动效暂停' : '动效开启'}`;
}

function cycle(delta) { const index = variants.indexOf(variant); select(variants[(index + delta + variants.length) % variants.length]); }
for (const button of document.querySelectorAll('button[data-state]')) button.addEventListener('click', () => {state = button.dataset.state;updateState();});
for (const button of document.querySelectorAll('button[data-surface]')) button.addEventListener('click', () => {document.body.dataset.surface = button.dataset.surface;updateSurface();});
function updateSurface(){for(const button of document.querySelectorAll('button[data-surface]'))button.setAttribute('aria-pressed',String(button.dataset.surface===document.body.dataset.surface));}
$('#prev').addEventListener('click', () => cycle(-1));
$('#next').addEventListener('click', () => cycle(1));
document.addEventListener('keydown', event => {
  if (event.target.closest('input, textarea, select, [contenteditable], dialog[open]')) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); cycle(event.key === 'ArrowLeft' ? -1 : 1); }
});
$('#motion').addEventListener('click', () => {paused = !paused;setMotion();});
function setMotion(){document.body.dataset.motion = paused ? 'off':'on';$('#motion').textContent = paused ? '播放动效':'暂停动效';$('#motion').setAttribute('aria-pressed',String(paused));updateState();}
$('#baseline').addEventListener('load', updateState);
$('#previous').addEventListener('click', () => $('#reference-dialog').showModal());
$('#implementation').addEventListener('click', () => $('#implementation-dialog').showModal());
for(const button of document.querySelectorAll('[data-close]'))button.addEventListener('click',()=>button.closest('dialog').close());
window.addEventListener('popstate',()=>select(variants.find(v=>v.id===new URLSearchParams(location.search).get('variant'))??variants[0],false));
renderOptions();select(variant);setMotion();updateSurface();
