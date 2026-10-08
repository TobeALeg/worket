import { createWorkContract, setTabColor, normalizeColor, tabTextColor, TAB_PRESETS } from './contract.js';

const storageKey = 'worket.contract-design.tab-color.v1';
const $ = selector => document.querySelector(selector);
const normal = {
  id: 'WC–024', title: '客户方案设计', version: 'v1.0',
  purpose: '将客户需求转化为可评审、可执行的方案。',
  confirmedAt: '2026-10-08T08:22:00+08:00',
  categoryLabel: '客户方案',
  sections: [
    { kind: 'context', label: '上下文', items: ['客户目标 · 业务现状 · 交付边界'] },
    { kind: 'inputs', label: '输入', items: ['需求简报 · 访谈记录'] },
    { kind: 'deliverables', label: '交付', items: ['方案文档 · 实施路线'] },
    { kind: 'constraints', label: '约束', items: ['先确认范围，再展开设计'] },
    { kind: 'acceptance', label: '验收', items: ['目标清晰，范围与交付一一对应'] },
  ],
};
const long = {
  ...normal, title: '跨部门客户需求澄清与复杂项目实施方案设计',
  purpose: '把多个部门的目标、现有系统限制与阶段性投入，整理成各方可以审阅、确认和持续执行的交付方案。',
  sections: normal.sections.map(section => section.kind !== 'constraints' ? section : {
    ...section, items: [
      '正式设计前，由业务负责人确认范围、预算边界以及不纳入本次交付的事项。',
      '所有影响交付周期的外部依赖必须明确负责人和预计完成时间；未确认的依赖保留为待确认项。',
      '不自动继承上一位客户的业务数据、临时授权或项目特定结论。',
    ],
  }),
};
const minimal = { ...normal, sections: normal.sections.filter(s => ['inputs', 'deliverables', 'acceptance'].includes(s.kind)) };
const samples = { normal, long, minimal };
let selected = normal;
let color = TAB_PRESETS[0].color;
try { color = normalizeColor(localStorage.getItem(storageKey) ?? color); } catch { /* Restricted storage and invalid old preferences fall back to the preset. */ }
let card;

function syncColorControls() {
  $('#color-picker').value = color;
  $('#color-hex').value = color;
  $('#color-hex').removeAttribute('aria-invalid');
  $('#color-error').hidden = true;
  document.querySelectorAll('[data-preset]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.preset === color)));
}
function chooseColor(value) {
  try {
    color = setTabColor(card, value);
    syncColorControls();
    try { localStorage.setItem(storageKey, color); } catch { /* Live preview still works without storage. */ }
  } catch (error) {
    $('#color-hex').setAttribute('aria-invalid', 'true');
    $('#color-error').textContent = error.message;
    $('#color-error').hidden = false;
  }
}
function showDetails() {
  const content = $('#detail-content');
  content.replaceChildren();
  const heading = document.createElement('h3');
  heading.textContent = $('#contract-title').value || selected.title;
  const purpose = document.createElement('p');
  purpose.textContent = selected.purpose;
  content.append(heading, purpose);
  selected.sections.forEach(section => {
    const title = document.createElement('h3'); title.textContent = section.label;
    const list = document.createElement('ul');
    section.items.forEach(text => { const item = document.createElement('li'); item.textContent = text; list.append(item); });
    content.append(title, list);
  });
  $('#details-dialog').showModal();
}
function render() {
  card = createWorkContract({ ...selected, title: $('#contract-title').value || selected.title, color }, {
    onReuse: ({id, version}) => { $('#action-status').textContent = `预览已触发「发起新工作」：${id} / ${version}，未创建实际工作。`; },
    onDetails: showDetails,
  });
  $('#stage').replaceChildren(card);
  $('#action-status').textContent = '';
}

TAB_PRESETS.forEach(preset => {
  const button = document.createElement('button'); button.type = 'button';
  button.dataset.preset = preset.color;
  const dot = document.createElement('span'); dot.className = 'color-dot'; dot.style.background = preset.color; dot.setAttribute('aria-hidden', 'true');
  button.append(dot, preset.name);
  button.addEventListener('click', () => chooseColor(preset.color));
  $('#presets').append(button);
});
$('.preview-controls').addEventListener('submit', event => event.preventDefault());
$('#color-picker').addEventListener('input', event => chooseColor(event.target.value));
$('#color-hex').addEventListener('change', event => chooseColor(event.target.value));
$('#color-hex').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); chooseColor(event.target.value); } });
$('#contract-title').addEventListener('input', render);
$('#sample').addEventListener('change', event => {
  selected = samples[event.target.value]; $('#contract-title').value = selected.title; render();
});
$('#preview-width').addEventListener('change', event => {
  const value = event.target.value;
  $('#stage').style.width = value === 'auto' ? '' : `${value}px`;
  $('#stage').toggleAttribute('data-fixed', value !== 'auto');
});
$('#close-details').addEventListener('click', () => $('#details-dialog').close());
$('#export-color').addEventListener('click', () => {
  const css = `.wc-contract {\n  --wc-tab-color: ${color};\n  --wc-tab-ink: ${tabTextColor(color)};\n}\n`;
  const url = URL.createObjectURL(new Blob([css], { type: 'text/css;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'work-contract-color.css'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
render(); syncColorControls();
