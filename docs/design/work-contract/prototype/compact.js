// Read-only, single-page density prototype. No confirmation or database writes.
const view = await fetch('./compact-data.json').then(response => response.json());
const total = view.sections.reduce((sum, section) => sum + section.items.length, 0);
const $ = selector => document.querySelector(selector);
function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function itemList(section) {
  const list = el('ol', 'sheet-items');
  section.items.forEach(item => {
    const li = el('li'); li.dataset.key = item.key;
    li.append(el('span', 'source-text', item.text));
    const meta = item.meta || '';
    li.dataset.meta = meta;
    if (meta.includes('必填')) {
      const required = el('span', 'item-required', '*');
      required.title = '必填'; required.setAttribute('aria-label', '必填'); li.append(required);
    }
    const provenance = [];
    if (meta.includes('模型推断')) provenance.push('模型推断');
    if (meta.includes('参考方法')) provenance.push('参考方法');
    if (provenance.length) {
      const note = el('small', 'item-provenance', provenance.join(' · '));
      note.title = meta; note.setAttribute('aria-label', meta); li.append(note);
    }
    list.append(li);
  });
  return list;
}
function disclosureSummary(heading) {
  const summary = el('summary');
  const action = el('span', 'disclosure-action');
  const arrow = el('span', 'disclosure-arrow'); arrow.setAttribute('aria-hidden', 'true');
  action.append(el('span', 'when-closed', '展开'), el('span', 'when-open', '收起'), arrow);
  summary.append(heading, action);
  return summary;
}
function section(key, collapsed = false) {
  const data = view.sections.find(s => s.key === key);
  if (!data) return el('div');
  const block = el(collapsed ? 'details' : 'section', `sheet-section section-${key}${collapsed ? ' sheet-disclosure' : ''}`);
  const heading = el('h3');
  heading.append(el('span', '', key === 'deliverables' ? '交付物' : data.label), el('small', '', `${data.items.length} 项`));
  if (collapsed) {
    block.append(disclosureSummary(heading), itemList(data));
  } else block.append(heading, itemList(data));
  return block;
}
function footer() {
  const footer = el('footer', 'wc-confirmation');
  for (const side of ['left', 'right']) footer.append(el('span', `wc-notch wc-notch-${side}`));
  const status = el('div', 'wc-status');
  status.append(el('span', 'pending-dot'), el('strong', '', '待确认'));
  const identity = el('div', 'wc-identity');
  identity.append(el('span', 'wc-id', `编号 ${view.id.slice(0, 8)}`), el('span', 'wc-version', `第 ${view.revision} 版草稿`));
  identity.title = view.id;
  const date = el('div', 'wc-date');
  const time = el('time', '', new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(view.createdAt)).replaceAll('/', '.'));
  time.dateTime = view.createdAt; date.append(el('span', '', '提炼于'), time);
  footer.append(status, identity, date);
  return footer;
}
const card = el('article', 'wc-contract');
card.style.setProperty('--wc-tab-color', '#92743c');
card.style.setProperty('--wc-tab-ink', '#000000');
const folio = el('div', 'wc-folio'), paper = el('div', 'wc-paper'), body = el('div', 'wc-body');
const header = el('header', 'wc-header');
const masthead = el('div', 'sheet-masthead');
masthead.append(el('p', 'wc-kicker', 'WORKING CONTRACT'));
header.append(masthead, el('h2', 'wc-title', view.title), el('div', 'wc-rule'));
const disclosures = el('div', 'sheet-disclosures');
disclosures.append(...['constraints', 'acceptanceCriteria', 'materialRoles', 'methods'].map(key => section(key, true)));
const purpose = el('details', 'sheet-section sheet-disclosure sheet-purpose');
purpose.append(disclosureSummary(el('h3', '', '工作目的')), el('p', 'source-purpose', view.purpose));
disclosures.append(purpose);
body.append(header, section('inputs'), section('deliverables'), disclosures);
paper.append(body, footer()); folio.append(el('div', 'wc-tab', '草稿'), paper); card.append(folio);
$('#stage').append(card);
$('#preview-meta').textContent = `工作契约 · ${total} 条内容 · 待确认`;
$('#preview-width').addEventListener('change', event => $('#stage').style.setProperty('--prototype-width', `${event.target.value}px`));
