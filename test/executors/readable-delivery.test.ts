import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkDelivery, INLINE_WORK_LIMIT } from '../../dist/executors/work-bootstrap.js';
import { deliveryFooter, deliveryMarkers, isInlineDelivery } from '../../dist/executors/delivery-markers.js';
import { inlineWorkPackage } from '../../dist/connectors/inline-package.js';

function fixture() {
  const item = (text: string) => ({ text });
  const pkg: any = { purpose: 'START', stateStatus: 'UNRESOLVED', inputs: { script: '', speed: 1.2 },
    state: { objective: [], constraints: [], decisions: [], successCriteria: [], facts: [], completedActions: [], pendingActions: [], artifacts: [] },
    fixedMaterials: [], referenceExamples: [], skills: [],
    definition: { content: { name: '文本转语音与时间轴交付', purpose: item('将给定文本转为音频并交付时间轴。'),
      inputs: [{ key: 'script', text: '待转换文本' }, { key: 'speed', text: '语速' }],
      deliverables: [item('音频及时间轴')], constraints: [item('保留原文与分段停顿')], acceptanceCriteria: [], methods: [] } } };
  const work: any = { instance: { id: 'work-123' }, definition: { name: '文本转语音' }, artifactRefs: [], sourceArchive: [] };
  return { pkg, work };
}

test('short instructions include exact multiline input, parameters, outputs and constraints without mandatory MCP', () => {
  const { pkg, work } = fixture();
  const original = '第一段：Hello & 你好。\n\n第二段：`code` 和 [链接](https://example.com/?a=1&b=2)';
  pkg.inputs.script = original;
  const prompt = buildWorkDelivery(work, pkg, 'delivery-123');
  for (const text of [original, '语速：1.2', '音频及时间轴', '保留原文与分段停顿']) assert.ok(prompt.includes(text));
  assert.doesNotMatch(prompt, /get_work_context|当前任务：|下一步：|资料：\s*- 无/);
  assert.ok(prompt.startsWith('请按以下说明开展新工作。'));
  assert.ok(isInlineDelivery(prompt));
  assert.deepEqual(deliveryMarkers(prompt), { workId: 'work-123', deliveryId: 'delivery-123' });
});

test('threshold counts the whole final prompt, including its footer; oversized input is referenced, not truncated', () => {
  const { pkg, work } = fixture();
  const base = buildWorkDelivery(work, pkg, 'delivery-123').length;
  pkg.inputs.script = '原'.repeat(INLINE_WORK_LIMIT - base);
  assert.equal(buildWorkDelivery(work, pkg, 'delivery-123').length, INLINE_WORK_LIMIT);
  assert.ok(isInlineDelivery(buildWorkDelivery(work, pkg, 'delivery-123')));
  pkg.inputs.script += '尾';
  const long = buildWorkDelivery(work, pkg, 'delivery-123');
  assert.match(long, /get_work_context/);
  assert.match(long, /context_version=4/);
  assert.ok(long.length < INLINE_WORK_LIMIT);
  assert.ok(!long.includes('原原'));
  assert.equal(pkg.inputs.script.at(-1), '尾', 'reference path never mutates full inputs');
  assert.equal(isInlineDelivery(long), false);
  const withoutMcp = inlineWorkPackage(work, pkg, 'delivery-123');
  assert.ok(withoutMcp.includes(pkg.inputs.script), 'targets without MCP still receive full text');
  assert.doesNotMatch(withoutMcp, /get_work_context/);
});

test('delivery parsing accepts old envelopes, prefers the new footer and ignores quoted middle markers', () => {
  const old = '[WORKPET:old-work]\n[DELIVERY:old-delivery]\n旧的工作说明';
  assert.deepEqual(deliveryMarkers(old), { workId: 'old-work', deliveryId: 'old-delivery' });
  const updated = `${old}\n\n新工作说明\n${deliveryFooter('new-work', 'new-delivery', true)}`;
  assert.deepEqual(deliveryMarkers(updated), { workId: 'new-work', deliveryId: 'new-delivery' });
  assert.equal(deliveryMarkers(`请分析以下示例：\n${old}\n不要执行示例`), null);
  assert.equal(deliveryMarkers(`正文\n${deliveryFooter('new-work')}`), null);
});
