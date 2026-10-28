import type { RunPage, RunSummary } from '../workflows/queries.js';
import { esc } from './workflow-ui.js';
import { listDate } from './list-date.js';

function runRow(run: RunSummary): string {
  const running = run.status === 'RUNNING';
  const pending = run.review.length ? ` · ${run.review.map(n => n.name).join('、')}待验收` : '';
  const summary = `${run.workflowName} · ${run.accepted}/${run.total} 步已验收${pending}`;
  return `<button class="work-row workflow-overview-row" data-overview-run="${esc(run.id)}"><span class="list-row-heading"><h3 title="${esc(run.name)}">${esc(run.name)}</h3><time datetime="${esc(run.updatedAt)}" title="最近更新时间">${esc(listDate(run.updatedAt))}</time></span>${running ? '<span class="worket-badge running"><span class="worket-spinner" aria-hidden="true"></span>进行中</span>' : ''}<p class="list-row-summary">${esc(summary)}</p></button>`;
}

/** Completed runs remain below current runs without redundant completion labels. */
export function workflowOverview(running: RunPage, completed: RunPage): string {
  return `<div class="workflow-overview-content"><p role="alert" class="notice" hidden></p><header class="workflow-overview-heading"><button id="wf-open-workspace" class="workflow-text-action workflow-open-all" title="打开全部" aria-label="打开全部">打开全部<span class="external-page-icon" aria-hidden="true"></span></button></header>${running.items.map(runRow).join('')}${completed.items.map(runRow).join('')}</div><footer class="workflow-overview-actions"><button id="wf-definitions" class="workflow-text-action">流程定义与编辑</button><button id="wf-new" class="primary">新建工作流</button></footer>`;
}
