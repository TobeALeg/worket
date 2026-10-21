import type { RunPage, RunQuery, RunSummary } from '../workflows/queries.js';
import type { WorkflowDefinition } from '../workflows/types.js';
import { api, esc } from './workflow-ui.js';

type Host = { root: HTMLElement; page: (title: string, body: string, actions: string) => void; valid: () => boolean; open: (id: string, node?: string, generation?: number) => Promise<void>; definitions: WorkflowDefinition[]; create?: () => Promise<void> };
export async function showWorkspace(host: Host, initial: RunQuery): Promise<() => Promise<void>> {
  const latest = host.definitions.filter((d, i, all) => all.findIndex(x => x.key === d.key) === i);
  host.page(initial.review ? '待验收' : '所有运行', `<div class="wf-filters"><label>查找运行<input id="wf-query-search" maxlength="160" placeholder="运行或流程名称" value="${esc(initial.search ?? '')}"></label><label>流程<select id="wf-query-flow"><option value="">全部流程</option>${latest.map(d => `<option value="${esc(d.key)}" ${d.key === initial.workflowKey ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label><label>状态<select id="wf-query-status"><option value="">全部状态</option>${Object.entries({ RUNNING: '进行中', PAUSED: '已暂停', COMPLETED: '已完成', CANCELLED: '已取消' }).map(([k, v]) => `<option value="${k}" ${k === initial.status ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div><p id="wf-query-count" role="status"></p><div id="wf-query-results" class="wf-table"></div><button id="wf-query-more" hidden>加载更多</button>`, host.create ? '<button id="wf-new-run" class="primary">开展一次</button>' : '');
  let items: RunSummary[] = [], cursor: RunPage['cursor'] = null, request = 0, loading = false;
  let timer: ReturnType<typeof setTimeout>;
  const field = <T extends HTMLElement>(selector: string) => host.root.querySelector<T>(selector)!;
  const query = (): RunQuery => {
    const search = field<HTMLInputElement>('#wf-query-search').value.trim(), workflowKey = field<HTMLSelectElement>('#wf-query-flow').value, status = field<HTMLSelectElement>('#wf-query-status').value as RunQuery['status'];
    return { ...(search ? { search } : {}), ...(workflowKey ? { workflowKey } : {}), ...(status ? { status } : {}), ...(initial.review ? { review: true } : {}) };
  };
  const draw = (): void => {
    field('#wf-query-results').innerHTML = items.length ? items.map(r => initial.review ? r.review.map(n => `<div class="wf-run-row"><div><strong>${esc(r.name)}</strong><small>${esc(r.workflowName)} · v${r.version}</small></div><span>${esc(n.name)}</span><span>第 ${n.generation} 轮${r.status === 'PAUSED' ? ' · 已暂停' : ' · 待验收'}</span><button data-review-run="${esc(r.id)}" data-review-node="${esc(n.nodeId)}" data-review-generation="${n.generation}">${r.status === 'PAUSED' ? '恢复并查看' : '验收交付'}</button></div>`).join('') : `<div class="wf-run-row"><div><strong>${esc(r.name)}</strong><small>${esc(r.workflowName)} · v${r.version}</small></div><span>${{ RUNNING: '进行中', PAUSED: '已暂停', COMPLETED: '已完成', CANCELLED: '已取消' }[r.status]}</span><span>${r.accepted}/${r.total} 已验收${r.review.length ? ` · ${r.review.length} 项待验收` : ''}</span><button data-open-run="${esc(r.id)}">打开运行</button></div>`).join('') : `<p class="empty">${initial.review ? '暂无待验收交付' : '暂无符合条件的运行'}</p>`;
    field('#wf-query-count').textContent = initial.review ? `${items.reduce((n, r) => n + r.review.length, 0)} 项待验收${cursor ? ' · 可加载更多' : ''}` : `${items.length} 次运行${cursor ? ' · 可加载更多' : ''}`;
    field<HTMLButtonElement>('#wf-query-more').hidden = !cursor;
    host.root.querySelectorAll<HTMLButtonElement>('[data-open-run],[data-review-run]').forEach(b => b.onclick = () => {
      if (!host.valid()) return;
      void host.open(b.dataset.openRun ?? b.dataset.reviewRun!, b.dataset.reviewNode, b.dataset.reviewGeneration ? Number(b.dataset.reviewGeneration) : undefined).catch(error => showError(error));
    });
  };
  const showError = (error: unknown): void => { if (host.valid()) { const e = field<HTMLElement>('[role="alert"]'); e.hidden = false; e.textContent = String(error); } };
  const load = async (more = false): Promise<void> => {
    if (!host.valid()) return;
    const current = ++request, input = query(); loading = true;
    try {
      const result: RunPage = await api('queryRuns', { ...input, ...(more && cursor ? { cursor } : {}), limit: more ? 50 : Math.min(100, Math.max(50, items.length)) });
      if (!host.valid() || request !== current) return;
      items = more ? [...items, ...result.items.filter(r => !items.some(old => old.id === r.id))] : result.items; cursor = result.cursor; draw();
    } finally { if (request === current) loading = false; }
  };
  const changed = (): void => { request++; clearTimeout(timer); timer = setTimeout(() => { void load().catch(showError); }, 250); };
  field<HTMLInputElement>('#wf-query-search').oninput = changed;
  field<HTMLSelectElement>('#wf-query-flow').onchange = changed;
  field<HTMLSelectElement>('#wf-query-status').onchange = changed;
  field<HTMLButtonElement>('#wf-query-more').onclick = () => { if (!loading) void load(true).catch(showError); };
  if (host.create) field<HTMLButtonElement>('#wf-new-run').onclick = () => { if (host.valid()) void host.create!().catch(showError); };
  await load();
  return async () => { if (!loading && items.length <= 100) await load(); };
}
