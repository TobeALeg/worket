import test from 'node:test';
import assert from 'node:assert/strict';
import { workflowOverview } from '../../dist/renderer/workflow-overview.js';
import type { RunSummary } from '../../src/workflows/queries.ts';

const run = (status: RunSummary['status']): RunSummary => ({ id: status, name: '本次 <工作>', workflowId: 'flow', workflowKey: 'key', workflowName: '流程', version: 2, status, revision: 1, updatedAt: '2026-10-28T00:00:00Z', accepted: status === 'COMPLETED' ? 2 : 0, total: 2, review: [] });

test('empty overview provides one open-all entry without empty-state or completion labels', () => {
  const html = workflowOverview({ items: [], cursor: null }, { items: [], cursor: null });
  assert.doesNotMatch(html, /运行中|已完成|查看全部|wf-completed/);
  assert.equal((html.match(/id="wf-open-workspace"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /暂无|data-overview-run/);
  assert.match(html, /aria-label="打开全部"/);
  assert.match(html, /流程定义与编辑/); assert.match(html, /新建工作流/);
});

test('runs retain their identity and acceptance status, and the whole row is the only action', () => {
  const current = run('RUNNING'); current.review = [{ nodeId: 'n', name: '正文', generation: 2 }];
  const html = workflowOverview({ items: [current], cursor: { id: 'more', updatedAt: current.updatedAt } }, { items: [run('COMPLETED')], cursor: null });
  assert.match(html, /进行中/);
  assert.match(html, /正文待验收/);
  assert.doesNotMatch(html, /已完成|· v2/);
  assert.match(html, /<time datetime=/);
  assert.match(html, /10\/28/);
  assert.match(html, /本次 &lt;工作&gt;/);
  assert.ok(html.indexOf('data-overview-run="RUNNING"') < html.indexOf('data-overview-run="COMPLETED"'));
  assert.doesNotMatch(html, /查看交付|查看成果|查看运行/);
  assert.match(workflowOverview({ items: [run('RUNNING')], cursor: null }, { items: [], cursor: null }), /worket-spinner/);
});
