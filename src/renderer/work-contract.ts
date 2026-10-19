import type { Definition } from '../definitions/repository.js';
import { contractSections, type ContractSection, type ContractFeedback } from '../definitions/contract-view.js';

const escape = (value: string) => value.replace(/[&<>"']/gu, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const colorKey = (key: string) => `worket.contract.color.${key}`;
export function contractColor(key: string): string {
  try { const value = localStorage.getItem(colorKey(key)); if (value && /^#[\da-f]{6}$/iu.test(value)) return value; } catch { /* Preferences may be unavailable. */ }
  return '#92743c';
}
export function setContractColor(host: HTMLElement, key: string, color: string): void {
  if (!/^#[\da-f]{6}$/iu.test(color)) return;
  host.style.setProperty('--wc-tab-color', color);
  try { localStorage.setItem(colorKey(key), color); } catch { /* The current view still updates. */ }
}
function summary(title: string): string {
  return `<summary>${title}<span class="disclosure-action"><span class="when-closed">展开</span><span class="when-open">收起</span><span class="disclosure-arrow" aria-hidden="true"></span></span></summary>`;
}
function section(data: ContractSection): string {
  const heading = `<h3><span>${data.label}</span><small>${data.items.length} 项</small></h3>`;
  const list = `<ol class="sheet-items">${data.items.map(item => `<li data-contract-address="${escape(item.address)}"><span class="source-text">${escape(item.text)}</span>${item.required ? '<span class="item-required" aria-label="必填" title="必填">*</span>' : ''}</li>`).join('')}</ol>`;
  const folded = !['inputs', 'deliverables'].includes(data.key);
  return folded ? `<details class="sheet-section sheet-disclosure section-${data.key}">${summary(heading)}${list}</details>`
    : `<section class="sheet-section section-${data.key}">${heading}${data.items.length ? list : '<p class="contract-empty">无须提供输入</p>'}</section>`;
}
export function workContract(definition: Definition, feedback?: ContractFeedback): string {
  const sections = contractSections(definition);
  const date = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(definition.confirmedAt)).replaceAll('/', '.');
  return `<article class="contract-sheet wc-contract${feedback && feedback !== 'evidence' ? ' contract-arrival' : ''}" data-definition-id="${escape(definition.id)}">
    <div class="wc-folio"><button type="button" class="wc-tab" title="编辑工作分类" aria-label="编辑工作分类：${escape(definition.category ?? '其他工作')}">${escape(definition.category ?? '其他工作')}</button><div class="wc-paper"><div class="wc-body">
    <header class="wc-header"><p class="wc-kicker">WORKING CONTRACT</p><h2 class="wc-title">${escape(definition.content.name)}</h2><div class="wc-rule"></div></header>
    ${sections.slice(0, 2).map(section).join('')}<div class="sheet-disclosures">${sections.slice(2).filter(s => s.items.length).map(section).join('')}
    <details class="sheet-section sheet-disclosure sheet-purpose">${summary('<h3>工作目的</h3>')}<p class="source-purpose">${escape(definition.content.purpose.text)}</p></details></div>
    </div><footer class="wc-confirmation"><span class="wc-notch wc-notch-left"></span><span class="wc-notch wc-notch-right"></span>
    <div class="wc-status"><span class="wc-seal" aria-hidden="true"></span><strong>已确认</strong></div><div class="wc-identity"><span class="wc-id" title="${escape(definition.id)}">编号 ${escape(definition.id.slice(0, 8))}</span><span class="wc-version">v${definition.version}</span></div><div class="wc-date"><span>确认于</span><time datetime="${escape(definition.confirmedAt)}">${date}</time></div></footer></div></div></article>`;
}
