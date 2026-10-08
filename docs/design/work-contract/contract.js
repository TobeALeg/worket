/** @typedef {import('./contract').ContractView} ContractView */
/** @typedef {import('./contract').ContractActions} ContractActions */

export const TAB_PRESETS = Object.freeze([
  { name: '鼠尾草', color: '#60765f' },
  { name: '麦金', color: '#92743c' },
  { name: '陶土', color: '#946752' },
  { name: '雾蓝', color: '#5f7989' },
]);

/** Only opaque sRGB HEX colors are accepted, so the tab's contrast is predictable. */
export function normalizeColor(value) {
  if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value.trim())) {
    throw new TypeError('请输入六位 HEX 颜色，例如 #60765f');
  }
  return value.trim().toLowerCase();
}

export function tabTextColor(value) {
  const hex = normalizeColor(value).slice(1);
  const channels = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  const luminance = .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
  return (luminance + .05) / .05 >= 1.05 / (luminance + .05) ? '#000000' : '#ffffff';
}

/** Change only the tab, never the contract text, confirmation state or actions. */
export function setTabColor(element, color) {
  const normalized = normalizeColor(color);
  element.style.setProperty('--wc-tab-color', normalized);
  element.style.setProperty('--wc-tab-ink', tabTextColor(normalized));
  return normalized;
}

const paths = {
  context: '<path d="M7 3h9l4 4v14H5V3zM15 3v5h5M8 12h9M8 16h7"/>',
  inputs: '<path d="m12 3 10 5-10 5L2 8zM3 12l9 5 9-5M3 17l9 5 9-5"/>',
  deliverables: '<path d="M6 3h9l5 5v14H5V3zM14 3v6h6"/>',
  constraints: '<path d="M3 5h4m4 0h10M3 12h10m4 0h4M3 19h4m4 0h10"/><circle cx="9" cy="5" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="19" r="2"/>',
  acceptance: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m7 12 3 3 7-7"/>',
  methods: '<path d="M5 4h14v17H5zM8 8h8M8 12h8M8 16h5"/>',
  materials: '<path d="M3 7h7l2 2h9v12H3zM3 7V4h7l2 3"/>',
};

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  return element;
}
function icon(kind) {
  const el = node('span', 'wc-icon');
  el.setAttribute('aria-hidden', 'true');
  // Only fixed, authored SVG paths enter this string; user text is always textContent.
  el.innerHTML = `<svg viewBox="0 0 24 24">${paths[kind] ?? paths.context}</svg>`;
  return el;
}
function section(view) {
  const el = node('section', 'wc-section');
  const content = node('div', 'wc-section-content');
  const items = node('ul', 'wc-items');
  view.items.forEach(text => items.append(node('li', '', text)));
  content.append(node('h3', '', view.label), items);
  el.append(icon(view.kind), content);
  return el;
}
function confirmation(view) {
  const el = node('footer', 'wc-confirmation');
  const status = node('div', 'wc-status');
  const seal = node('span', 'wc-seal');
  seal.setAttribute('aria-hidden', 'true');
  status.append(seal, node('strong', '', '已确认'));
  const identity = node('div', 'wc-identity');
  identity.append(node('span', 'wc-id', view.id), node('span', 'wc-version', view.version));
  const date = node('div', 'wc-date');
  const time = node('time', '', new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(view.confirmedAt)).replaceAll('/', '.'));
  time.dateTime = view.confirmedAt;
  date.append(node('span', '', '确认于'), time);
  const notches = ['left', 'right'].map(side => {
    const notch = node('span', `wc-notch wc-notch-${side}`);
    notch.setAttribute('aria-hidden', 'true');
    return notch;
  });
  el.append(...notches, status, identity, date);
  return el;
}

/** Create a presentation of an already-confirmed version. No persistence or app calls. */
export function createWorkContract(view, actions = {}) {
  if (!view.id || !view.title || !view.version || !Number.isFinite(Date.parse(view.confirmedAt))) {
    throw new TypeError('工作契约需要名称、编号、版本与有效确认时间');
  }
  const root = node('article', 'wc-contract');
  root.setAttribute('aria-label', `${view.title}，${view.version}，已确认`);
  setTabColor(root, view.color ?? TAB_PRESETS[0].color);
  const folio = node('div', 'wc-folio');
  const tab = node('div', 'wc-tab', view.version);
  if (view.categoryLabel) {
    tab.title = `${view.categoryLabel} · ${view.version}`;
    tab.append(node('span', 'wc-sr-only', `，${view.categoryLabel}`));
  }
  const paper = node('div', 'wc-paper');
  const body = node('div', 'wc-body');
  const header = node('header', 'wc-header');
  header.append(node('p', 'wc-kicker', 'WORKING CONTRACT'), node('h2', 'wc-title', view.title));
  if (view.purpose) header.append(node('p', 'wc-purpose', view.purpose));
  const rule = node('div', 'wc-rule');
  rule.setAttribute('aria-hidden', 'true');
  header.append(rule);
  body.append(header, ...view.sections.filter(s => s.items.length).map(section));
  paper.append(body, confirmation(view));
  folio.append(tab, paper);
  root.append(folio);
  const controls = node('div', 'wc-actions');
  if (actions.onReuse) {
    const button = node('button', 'wc-primary');
    button.type = 'button';
    button.append(node('span', '', '发起新工作'));
    const arrow = node('span', '');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.innerHTML = '<svg viewBox="0 0 24 20"><path d="M2 10h18m-6-6 6 6-6 6"/></svg>';
    button.append(arrow);
    button.addEventListener('click', () => actions.onReuse({ id: view.id, version: view.version }));
    controls.append(button);
  }
  if (actions.onDetails) {
    const button = node('button', 'wc-secondary', '查看完整契约');
    button.type = 'button';
    button.addEventListener('click', () => actions.onDetails({ id: view.id, version: view.version }));
    controls.append(button);
  }
  if (controls.childElementCount) root.append(controls);
  return root;
}
