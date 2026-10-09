// THROWAWAY PROTOTYPE: three shorter contract layouts on the existing preview route.
// The fixture stays on localhost, outside Git; this module never confirms a contract.
const view = await fetch('./compact-data.json').then(response => response.json());
const variants = [
  { key: 'A', name: '双列概览', description: '六个摘要入口，点开读原文', render: overview },
  { key: 'B', name: '分类折叠', description: '按类别展开，一次阅读一部分', render: accordion },
  { key: 'C', name: '极简封面', description: '只留身份与目的，全文单独阅读', render: cover },
];
const icons = {
  inputs: '<path d="m12 3 10 5-10 5L2 8zM3 12l9 5 9-5M3 17l9 5 9-5"/>',
  deliverables: '<path d="M6 3h9l5 5v14H5V3zM14 3v6h6"/>',
  constraints: '<path d="M3 5h4m4 0h10M3 12h10m4 0h4M3 19h4m4 0h10"/><circle cx="9" cy="5" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="19" r="2"/>',
  acceptanceCriteria: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m7 12 3 3 7-7"/>',
  methods: '<path d="M5 4h14v17H5zM8 8h8M8 12h8M8 16h5"/>',
  materialRoles: '<path d="M3 7h7l2 2h9v12H3zM3 7V4h7l2 3"/>',
};
const total = view.sections.reduce((sum, section) => sum + section.items.length, 0);
document.querySelector('#preview-meta').textContent = `候选草稿 · ${total} 条内容 · 待确认`;
document.querySelector('#show-all').textContent = `查看全部 ${total} 条`;
let current = Math.max(0, variants.findIndex(v => v.key === new URLSearchParams(location.search).get('variant')));
const $ = selector => document.querySelector(selector);
function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function icon(key) {
  const element = el('span', 'wc-icon'); element.setAttribute('aria-hidden', 'true');
  element.innerHTML = `<svg viewBox="0 0 24 24">${icons[key]}</svg>`;
  return element;
}
function itemList(section) {
  const list = el('ol', 'prototype-items');
  section.items.forEach(item => {
    const li = el('li'); li.dataset.key = item.key;
    li.append(el('p', 'source-text', item.text));
    if (item.meta) li.append(el('small', 'item-meta', item.meta));
    list.append(li);
  });
  return list;
}
function detailSection(section) {
  const block = el('section', 'detail-section');
  block.append(el('h3', '', `${section.label} · ${section.items.length}`), itemList(section));
  return block;
}
function showDetail(key) {
  const section = view.sections.find(s => s.key === key);
  $('#detail-kicker').textContent = view.title;
  $('#detail-title').textContent = section ? `${section.label} · ${section.items.length} 条` : `完整契约 · ${total} 条`;
  $('#detail-content').replaceChildren();
  if (section) $('#detail-content').append(itemList(section));
  else {
    const purpose = el('section', 'detail-section');
    purpose.append(el('h3', '', '目的'), el('p', 'source-text', view.purpose));
    $('#detail-content').append(purpose, ...view.sections.map(detailSection));
  }
  $('#show-all').hidden = !section;
  $('#detail-content').scrollTop = 0;
  if (!$('#detail-dialog').open) $('#detail-dialog').showModal();
  $('#close-detail').focus();
}
function heading() {
  const header = el('header', 'wc-header');
  header.append(el('p', 'wc-kicker', 'WORKING CONTRACT'), el('h2', 'wc-title', view.title));
  const purpose = el('button', 'prototype-purpose', view.purposeSummary);
  purpose.type = 'button'; purpose.setAttribute('aria-label', '查看完整目的与契约');
  purpose.addEventListener('click', () => showDetail());
  header.append(purpose, el('div', 'wc-rule'));
  return header;
}
function footer() {
  const footer = el('footer', 'wc-confirmation');
  for (const side of ['left', 'right']) footer.append(el('span', `wc-notch wc-notch-${side}`));
  const status = el('div', 'wc-status');
  status.append(el('span', 'pending-dot'), el('strong', '', '待确认'));
  const identity = el('div', 'wc-identity');
  identity.append(el('span', 'wc-id', view.id.slice(0, 8)), el('span', 'wc-version', `草稿 r${view.revision}`));
  identity.title = view.id;
  const date = el('div', 'wc-date');
  const time = el('time', '', new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(view.createdAt)).replaceAll('/', '.'));
  time.dateTime = view.createdAt; date.append(el('span', '', '提炼于'), time);
  footer.append(status, identity, date);
  return footer;
}
function shell(body) {
  const card = el('article', `wc-contract variant-${variants[current].key}`);
  card.style.setProperty('--wc-tab-color', '#92743c'); card.style.setProperty('--wc-tab-ink', '#000000');
  const folio = el('div', 'wc-folio'), paper = el('div', 'wc-paper');
  paper.append(body, footer()); folio.append(el('div', 'wc-tab', '草稿'), paper);
  const actions = el('div', 'wc-actions');
  const read = el('button', 'wc-primary', `查看完整契约 · ${total} 条`); read.type = 'button';
  read.addEventListener('click', () => showDetail()); actions.append(read);
  card.append(folio, actions);
  return card;
}
function overview() {
  const body = el('div', 'wc-body'); body.append(heading());
  const grid = el('div', 'overview-grid');
  view.sections.forEach(section => {
    const button = el('button', 'overview-entry'); button.type = 'button';
    button.setAttribute('aria-label', `查看${section.label}，${section.items.length}条`);
    const label = el('span', 'overview-label');
    label.append(icon(section.key), el('strong', '', section.label), el('small', '', `${section.items.length} ›`));
    button.append(label, el('span', 'overview-summary', section.summary));
    button.addEventListener('click', () => showDetail(section.key)); grid.append(button);
  });
  body.append(grid);
  return shell(body);
}
function accordion() {
  const body = el('div', 'wc-body'); body.append(heading());
  const stack = el('div', 'accordion-stack');
  view.sections.forEach(section => {
    const details = el('details', 'accordion-entry'); details.name = 'contract-section';
    const summary = el('summary');
    summary.append(icon(section.key), el('strong', '', section.label), el('small', '', `${section.items.length} 条`), el('span', 'accordion-arrow', '+'));
    details.append(summary, itemList(section)); stack.append(details);
  });
  body.append(stack);
  return shell(body);
}
function cover() {
  const body = el('div', 'wc-body'); body.append(heading());
  const index = el('div', 'cover-index');
  index.append(el('span', 'cover-total', String(total)), el('span', '', '条款 · 输入、交付、约束、验收、方法与资料'));
  body.append(index);
  return shell(body);
}
function render() {
  const variant = variants[current];
  const url = new URL(location.href); url.searchParams.set('variant', variant.key); history.replaceState(null, '', url);
  $('#stage').replaceChildren(variant.render());
  $('#variant-name').textContent = `${variant.key} · ${variant.name}${variant.key === 'A' ? '（推荐）' : ''}`;
  $('#variant-description').textContent = variant.description;
  window.scrollTo(0, 0);
}
function cycle(direction) { current = (current + direction + variants.length) % variants.length; render(); }
$('#previous-variant').addEventListener('click', () => cycle(-1));
$('#next-variant').addEventListener('click', () => cycle(1));
$('#close-detail').addEventListener('click', () => $('#detail-dialog').close());
$('#show-all').addEventListener('click', () => showDetail());
$('#preview-width').addEventListener('change', event => $('#stage').style.setProperty('--prototype-width', `${event.target.value}px`));
document.addEventListener('keydown', event => {
  if ($('#detail-dialog').open || event.target.closest('input,textarea,select,[contenteditable]')) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); cycle(event.key === 'ArrowLeft' ? -1 : 1); }
});
render();
