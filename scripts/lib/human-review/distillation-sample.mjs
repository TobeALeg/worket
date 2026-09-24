import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { validateResult } from '../../../dist/contracts/definition.js';
import { hash } from './model.mjs';

const categories = { purpose: 'OBJECTIVE', inputs: 'INPUT', deliverables: 'DELIVERABLE',
  constraints: 'CONSTRAINT', acceptanceCriteria: 'ACCEPTANCE', methods: 'METHOD', materialRoles: 'INPUT' };
const role = kind => kind === 'user.prompt' ? 'user' : kind === 'agent.response' ? 'assistant'
  : kind.startsWith('tool.') ? 'tool' : kind === 'file.content' ? 'document' : 'work';

/** A review projection, not a new model extraction or a publication decision. */
export function distillationSample({ request, result, snapshot, accepted }) {
  assert.equal(accepted.status, 'AWAITING_REVIEW');
  assert.equal(snapshot.id, accepted.snapshotId);
  assert.equal(snapshot.contentHash, request.snapshotHash);
  validateResult(result, request);
  const messages = [], byKey = new Map();
  for (const source of snapshot.sources) {
    for (const event of source.events) {
      const message = { id: `${source.key}:${event.key}`, role: role(event.kind), kind: event.kind,
        content: event.content, sourceWorkId: source.workId, sourceEventId: event.id };
      messages.push(message); byKey.set(`${source.key}/${event.key}`, message);
    }
    // Selected file contents are separate snapshot material, not conversation events.
    for (const event of request.sources.find(s => s.key === source.key)?.events ?? []) {
      if (byKey.has(`${source.key}/${event.key}`)) continue;
      assert.equal(event.kind, 'file.content', '请求事件必须能对应到固定来源');
      const message = { id: `${source.key}:${event.key}`, role: 'document', kind: event.kind, content: event.content,
        sourceWorkId: source.workId, document: event.document };
      messages.push(message); byKey.set(`${source.key}/${event.key}`, message);
    }
  }
  const requirements = [];
  for (const [section, category] of Object.entries(categories)) {
    const items = section === 'purpose' ? [result.content.purpose] : result.content[section];
    for (const item of items) {
      const address = section === 'purpose' ? 'purpose' : `${section}.${item.key}`;
      const evidence = item.basis.refs.map(ref => {
        const message = byKey.get(`${ref.workId}/${ref.eventId}`);
        assert.ok(message, '引用必须指向固定的原始记录');
        // When the model cites an event without a quote, show that whole event.
        const quote = ref.excerpt ?? message.content;
        const start = message.content.indexOf(quote);
        assert.ok(quote.length && start >= 0, '引用必须逐字匹配，不能补造原文');
        return { messageId: message.id, quote, start, end: start + quote.length };
      });
      const origin = ['USER_STATED', 'AGENT_PROPOSED', 'DOCUMENT_STATED'].includes(item.basis.origin) ? item.basis.origin : 'INFERRED';
      const status = item.rule?.status === 'RETIRED' ? 'SUPERSEDED'
        : item.rule?.status === 'PROPOSED' || ['INFERRED', 'AGENT_PROPOSED'].includes(origin) ? 'UNRESOLVED' : 'ACTIVE';
      requirements.push({ id: address.replaceAll('.', '-'), address, category, text: item.text,
        scope: item.rule?.scope ?? 'UNCERTAIN', status, origin, evidence, supersedes: [],
        applicability: item.rule?.condition ?? item.basis.rationale ?? '',
        issues: result.issues.filter(issue => issue.field === address), originalItem: item });
    }
  }
  const linked = new Set(requirements.map(item => item.address));
  const questions = result.issues.filter(issue => !linked.has(issue.field)).map(issue => ({
    id: issue.id, text: issue.message, reason: issue.blocking ? '这项需要你的判断。' : '模型保留的提示，请核对是否需要补充。',
    priority: issue.blocking ? 'BLOCKING' : 'OPTIONAL', evidence: [], originalIssue: issue,
  }));
  assert.equal(requirements.length, accepted.items);
  assert.equal(requirements.reduce((sum, item) => sum + item.issues.length, 0) + questions.length, result.issues.length);
  const record = { id: snapshot.id, work: { instanceId: snapshot.sources[0].workId, focus: result.content.purpose.text }, messages };
  return { id: `distillation-${accepted.jobId}`, title: result.content.name, group: '沉淀结果确认', record,
    draft: { id: accepted.draftId, kind: 'WorkDefinitionReviewProjection', workInstanceId: record.work.instanceId,
      sourceRecordId: record.id, snapshotHash: hash(record), analysisRunId: accepted.requestId,
      title: result.content.name, requirements, questions },
    source: { jobId: accepted.jobId, snapshotId: snapshot.id, snapshotHash: request.snapshotHash,
      requestHash: hash(request), resultHash: hash(result), versions: result.versions, issues: result.issues } };
}

export function loadDistillationSample(directory) {
  const read = name => JSON.parse(readFileSync(join(directory, name), 'utf8'));
  const accepted = read('accepted.json'), request = read('request.json'), remote = read('remote-result.json');
  assert.equal(remote.status, 'SUCCEEDED');
  const db = new DatabaseSync(join(directory, 'replay.sqlite'), { readOnly: true });
  try {
    const row = db.prepare('SELECT payload_json FROM source_snapshots WHERE id=?').get(accepted.snapshotId);
    assert.ok(row, '缺少固定来源快照');
    return distillationSample({ request, result: remote.result, snapshot: JSON.parse(row.payload_json), accepted });
  } finally { db.close(); }
}
