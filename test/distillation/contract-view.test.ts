import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contractSections, publishedFeedback } from '../../dist/definitions/contract-view.js';
import { workContract } from '../../dist/renderer/work-contract.js';
import { inferredCategory } from '../../dist/definitions/category.js';
import { result } from './fixtures.ts';
function definition() {
  const content = result({ sources: [{ key: 'work', events: [{ key: 'event' }] }] }).content;
  return { id: 'definition-1', definitionKey: 'series', version: 1, kind: 'REUSABLE', content, confirmedAt: '2026-10-09T01:00:00Z', refs: [], materials: [], contentHash: 'hash' } as any;
}
test('reading projection merges constraints and completion checks without dropping required methods or mutating execution content', () => {
  const d = definition(), basis = d.content.constraints[0].basis;
  d.content.methods = [
    { key: 'mandatory', text: '通过公开资料核对', obligation: 'REQUIRED', basis },
    { key: 'example', text: '可参考历史报告', obligation: 'REFERENCE', basis },
  ];
  const before = structuredClone(d);
  const sections = contractSections(d);
  assert.deepEqual(sections.map(s => s.key), ['inputs', 'deliverables', 'constraints', 'materialRoles']);
  assert.deepEqual(sections[2]!.items.map(i => i.address), ['constraints.sources', 'acceptanceCriteria.traceable', 'methods.mandatory']);
  assert.equal(sections[0]!.items.length, 2);
  assert.ok(sections[0]!.items.every(i => i.required));
  assert.deepEqual(d, before);
});
test('confirmed card follows effective rules; retired and instance rules do not reappear as reusable obligations', () => {
  const d = definition(), base = d.content.constraints[0];
  d.content.constraints.push({ ...base, key: 'retired', text: '已撤销的限制', rule: { scope: 'REUSABLE', status: 'RETIRED' } });
  d.content.constraints.push({ ...base, key: 'one-time', text: '只用于原工作', rule: { scope: 'INSTANCE', status: 'ACTIVE' } });
  d.content.constraints[0].rule = { scope: 'REUSABLE', status: 'ACTIVE', condition: '对外发布' };
  const rows = contractSections(d)[2]!.items;
  assert.equal(rows.length, 2);
  assert.match(rows[0]!.text, /对外发布/);
  const html = workContract(d);
  assert.doesNotMatch(html, /已撤销的限制|只用于原工作/);
  assert.ok(html.indexOf('section-inputs') < html.indexOf('section-deliverables'));
});
test('receipt distinguishes first save, immutable revision and evidence-only confirmation; user content is escaped', () => {
  const d = definition();
  assert.equal(publishedFeedback(undefined, d), 'saved');
  assert.equal(publishedFeedback(d, { ...d }), 'evidence');
  assert.equal(publishedFeedback(d, { ...d, id: 'definition-2', version: 2 }), 'updated');
  d.content.name = '<img src=x onerror=alert(1)>';
  const html = workContract(d);
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('contract-arrival'));
  assert.ok(workContract(d, 'saved').includes('contract-arrival'));
  assert.ok(!workContract(d, 'evidence').includes('contract-arrival'));
});

test('category label identifies the work domain while the version remains in the confirmation', () => {
  const d = definition();
  d.content.name = '网站监控与 SEO 分析配置';
  d.category = inferredCategory(d.content);
  assert.equal(d.category, '网站运维');
  const html = workContract(d);
  assert.match(html, /class="wc-tab"[^>]*>网站运维<\/button>/u);
  assert.match(html, /class="wc-version">v1<\/span>/u);
});

test('dispatch presentation distinguishes NOT_DISPATCHED and failed retries from launch and correlated receipt', async () => {
  const { contractDispatchState } = await import('../../dist/renderer/contract-dispatch.js');
  const work = { status: 'OPEN', dispatchStatus: 'NOT_DISPATCHED', dispatchReadAt: null, captureStatus: 'stopped', bindings: [] } as any;
  assert.equal(contractDispatchState(work), 'created');
  assert.equal(contractDispatchState({ ...work, dispatchStatus: 'FAILED' }), 'failed');
  assert.equal(contractDispatchState({ ...work, dispatchStatus: 'WAITING' }), 'waiting');
  assert.equal(contractDispatchState({ ...work, dispatchStatus: 'STARTING', dispatchReadAt: 'now', captureStatus: 'waiting' }), 'waiting');
  assert.equal(contractDispatchState({ ...work, dispatchStatus: 'BOUND', dispatchReadAt: 'now', captureStatus: 'recording' }), 'received');
  assert.equal(contractDispatchState({ ...work, dispatchStatus: 'FAILED', bindings: [{ status: 'ACTIVE' }] }), 'waiting');
});
