import test from 'node:test';
import assert from 'node:assert/strict';
import { distillationSample } from '../../scripts/lib/human-review/distillation-sample.mjs';
import { createReview, applyCommand, hash } from '../../scripts/lib/human-review/model.mjs';
import { result as fixtureResult } from './fixtures.ts';

function fixture() {
  const events = [
    { id: 'original-1', key: 'event-1', kind: 'user.prompt', content: '请保留原文。每条事实必须标注来源。', sequence: 1 },
    { id: 'original-2', key: 'event-2', kind: 'tool.result', content: '检查成功：可以回查出处。', sequence: 2 },
    { id: 'original-3', key: 'event-3', kind: 'tool.result', content: '被分析过滤的实现正文仍可在原始记录查看。', sequence: 3 },
  ];
  const snapshot = { id: 'snapshot', contentHash: 'fixed-snapshot-hash', sources: [{ key: 'work-1', workId: 'original-work', events }] };
  const request = { schemaVersion: 1, snapshotHash: snapshot.contentHash, sources: [{ key: 'work-1', events: events.slice(0, 2) }] };
  const result: any = fixtureResult(request);
  result.content.constraints[0].basis.refs[0].excerpt = '每条事实必须标注来源。';
  result.content.deliverables[0].basis = { type: 'SOURCE', origin: 'AGENT_PROPOSED', refs: [{ snapshotId: 'wire', workId: 'work-1', eventId: 'event-2', excerpt: '可以回查出处。' }] };
  result.issues = [
    { id: 'linked', field: 'constraints.sources', type: 'UNCERTAIN_GENERALIZATION', message: '需要核对适用范围。', blocking: true },
    { id: 'general', field: 'skills', type: 'MISSING_INFORMATION', message: '是否需要指定技能？', blocking: false },
  ];
  const accepted = { status: 'AWAITING_REVIEW', snapshotId: snapshot.id, jobId: 'job', draftId: 'draft', requestId: 'run', items: 6 };
  return { request, result, snapshot, accepted };
}

test('审阅投影保留全部候选、待确认项和原始来源，不把助手建议或未知范围升级为用户决定', () => {
  const input = fixture(), before = hash(input), sample = distillationSample(input);
  assert.equal(hash(input), before);
  assert.deepEqual(distillationSample(input), sample, '重启加载须保持同一草稿哈希');
  assert.equal(sample.draft.requirements.length, 6);
  assert.equal(sample.record.messages.length, 3, '分析时省略的工具正文仍可回查');
  assert.equal(sample.record.messages[1].role, 'tool');
  assert.equal(sample.record.messages[1].sourceEventId, 'original-2');
  const candidate = sample.draft.requirements.find(item => item.address === 'deliverables.report');
  assert.equal(candidate.origin, 'AGENT_PROPOSED');
  assert.equal(candidate.status, 'UNRESOLVED');
  assert.equal(candidate.scope, 'UNCERTAIN');
  const constraint = sample.draft.requirements.find(item => item.address === 'constraints.sources');
  assert.deepEqual(constraint.originalItem, input.result.content.constraints[0]);
  assert.equal(constraint.issues[0].id, 'linked');
  const ref = constraint.evidence[0], message = sample.record.messages.find(item => item.id === ref.messageId);
  assert.equal(message.content.slice(ref.start, ref.end), ref.quote);
  assert.equal(sample.draft.questions[0].originalIssue.id, 'general');
  assert.equal(sample.draft.questions.length, 1);
  assert.deepEqual(createReview(sample).decisions, {});
  const review = createReview(sample);
  const edited = applyCommand(sample, review, { type: 'decision', operationId: 'op', revision: 0,
    key: `requirement:${candidate.id}`, verdict: 'MODIFY', corrected: { text: '修改后仍保留待确认范围', scope: 'UNCERTAIN', status: 'UNRESOLVED', applicability: '' } });
  assert.equal(edited.decisions[`requirement:${candidate.id}`].corrected.scope, 'UNCERTAIN');
});

test('来源身份不符、无法逐字定位或候选缺失时拒绝生成确认页', () => {
  const mismatch = fixture(); mismatch.snapshot.contentHash = 'other';
  assert.throws(() => distillationSample(mismatch));
  const quote = fixture(); quote.result.content.constraints[0].basis.refs[0].excerpt = '原文没有说过的话';
  assert.throws(() => distillationSample(quote), /逐字匹配/);
  const missing = fixture(); missing.accepted.items++;
  assert.throws(() => distillationSample(missing));
});
