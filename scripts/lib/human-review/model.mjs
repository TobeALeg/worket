import { createHash, randomUUID } from 'node:crypto';

export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const itemsOf = sample => [
  ...sample.draft.requirements.map(item => ({ ...item, key: `requirement:${item.id}`, type: 'requirement' })),
  ...sample.draft.questions.map(item => ({ ...item, key: `question:${item.id}`, type: 'question' })),
];
export function createReview(sample, now = new Date().toISOString()) {
  return { schemaVersion: 1, kind: 'HumanRequirementsReview', id: randomUUID(),
    workInstanceId: sample.draft.workInstanceId, sourceRecordId: sample.draft.sourceRecordId,
    draftId: sample.draft.id, analysisRunId: sample.draft.analysisRunId,
    snapshotHash: sample.draft.snapshotHash, draftHash: hash(sample.draft),
    reviewer: 'work-owner', revision: 0, createdAt: now, updatedAt: now,
    status: 'IN_PROGRESS', decisions: {}, omissions: [], buffers: {}, cursor: null,
    completenessChecked: false, omissionBuffer: null, events: [] };
}
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const text = (value, max = 12000) => typeof value === 'string' && value.length <= max;
export function applyCommand(sample, previous, command, now = new Date().toISOString()) {
  if (!command || !text(command.operationId, 100) || !command.operationId) fail('缺少操作标识');
  if (previous.events.some(event => event.operationId === command.operationId)) return previous;
  if (command.revision !== previous.revision) throw Object.assign(new Error('这份审阅已在另一个页面更新，请重新载入。'), { status: 409 });
  if (previous.draftHash !== hash(sample.draft)) fail('草案版本发生变化，请使用原审阅版本');
  if (previous.status === 'SUBMITTED' && command.type !== 'reopen') fail('请先重新打开已提交的审阅');
  const next = structuredClone(previous);
  const item = itemsOf(sample).find(item => item.key === command.key);
  const before = { decisions: previous.decisions, omissions: previous.omissions, completenessChecked: previous.completenessChecked, cursor: command.type === 'decision' ? command.key : previous.cursor, buffers: previous.buffers, omissionBuffer: previous.omissionBuffer ?? null };
  let undoable = false;
  switch (command.type) {
    case 'decision': {
      if (!item || !['ACCEPT', 'MODIFY', 'REJECT', 'UNSURE'].includes(command.verdict)) fail('无效的审阅选择');
      if (!text(command.note ?? '', 2000)) fail('备注过长');
      const basis = command.basis ?? 'HISTORICAL';
      if (!['HISTORICAL', 'NEW_DECISION'].includes(basis)) fail('请选择修改依据');
      const corrected = command.corrected;
      if (command.verdict === 'MODIFY') {
        if (!corrected || !text(corrected.text) || !corrected.text.trim()) fail('请填写修改后的内容');
        if (item.type === 'requirement') {
          if (!['ACTIVE', 'SUPERSEDED', 'REJECTED', 'UNRESOLVED'].includes(corrected.status) ||
              !['INSTANCE', 'REUSABLE', 'UNCERTAIN'].includes(corrected.scope) || !text(corrected.applicability)) fail('修改后的范围或状态无效');
        } else if (!['BLOCKING', 'OPTIONAL'].includes(corrected.priority)) fail('问题的重要性无效');
      }
      next.decisions[item.key] = { verdict: command.verdict, basis, ...(command.verdict === 'MODIFY' ? { corrected } : {}), note: command.note ?? '', at: now };
      delete next.buffers[item.key];
      next.completenessChecked = false;
      next.cursor = command.nextKey && itemsOf(sample).some(i => i.key === command.nextKey) ? command.nextKey : item.key;
      undoable = true;
      break;
    }
    case 'buffer':
      if (!item || !command.buffer || !text(command.buffer.text) || !text(command.buffer.note ?? '', 2000)) fail('编辑内容无效');
      next.buffers[item.key] = command.buffer;
      next.cursor = item.key;
      break;
    case 'cursor':
      if (!item) fail('条目不存在');
      next.cursor = item.key;
      break;
    case 'omission-buffer':
      if (command.buffer !== null && (!command.buffer || !text(command.buffer.text) || !['MISSED','UNSTATED','NEW_DECISION'].includes(command.buffer.basis))) fail('补充内容无效');
      next.omissionBuffer = command.buffer;
      break;
    case 'discard-buffer':
      if (!item) fail('条目不存在');
      delete next.buffers[item.key];
      break;
    case 'omission': {
      if (!text(command.text) || !command.text.trim() || !['MISSED', 'UNSTATED', 'NEW_DECISION'].includes(command.basis)) fail('请填写遗漏内容及其来源');
      const evidenceIds = command.evidenceIds ?? [];
      if (!Array.isArray(evidenceIds) || evidenceIds.some(id => !sample.record.messages.some(m => m.id === id))) fail('补充要求的来源不存在');
      const omission = { id: randomUUID(), text: command.text.trim(), basis: command.basis, evidenceIds, at: now };
      next.omissions.push(omission);
      next.omissionBuffer = null;
      next.completenessChecked = false;
      undoable = true;
      break;
    }
    case 'remove-omission':
      if (!next.omissions.some(item => item.id === command.id)) fail('补充项不存在');
      next.omissions = next.omissions.filter(item => item.id !== command.id);
      next.completenessChecked = false;
      undoable = true;
      break;
    case 'complete-check':
      next.completenessChecked = command.value === true;
      break;
    case 'undo': {
      const undone = new Set(next.events.filter(event => event.type === 'undo').map(event => event.target));
      const target = next.events.findLast(event => event.undoable && !undone.has(event.operationId));
      if (!target) fail('没有可以撤销的操作');
      Object.assign(next, structuredClone(target.before));
      command = { ...command, target: target.operationId };
      break;
    }
    case 'submit':
      if (itemsOf(sample).some(item => !next.decisions[item.key] || next.decisions[item.key].verdict === 'UNSURE')) fail('还有未审阅或暂放的条目');
      if (Object.keys(next.buffers).length) fail('还有未完成的编辑，请先保存或取消');
      if (next.omissionBuffer?.text?.trim()) fail('还有未保存的补充，请先保存或取消');
      if (!next.completenessChecked) fail('请先检查是否有遗漏');
      next.status = 'SUBMITTED';
      next.submittedAt = now;
      break;
    case 'reopen':
      if (previous.status !== 'SUBMITTED') fail('当前审阅无需重新打开');
      next.status = 'IN_PROGRESS';
      next.completenessChecked = false;
      delete next.submittedAt;
      break;
    default: fail('未知操作');
  }
  next.revision++;
  next.updatedAt = now;
  const engagedMs = Math.max(0, Math.min(300000, Number(command.engagedMs) || 0));
  next.events.push({ ...command, engagedMs, at: now, undoable, ...(undoable ? { before } : {}) });
  return next;
}
export function summary(sample, review) {
  const items = itemsOf(sample);
  const count = (list, verdict) => list.filter(item => review.decisions[item.key]?.verdict === verdict).length;
  const requirements = items.filter(item => item.type === 'requirement');
  const judged = requirements.filter(item => ['ACCEPT', 'MODIFY', 'REJECT'].includes(review.decisions[item.key]?.verdict));
  const historical = judged.filter(item => review.decisions[item.key].basis === 'HISTORICAL');
  return { total: items.length, reviewed: items.filter(item => review.decisions[item.key] && review.decisions[item.key].verdict !== 'UNSURE').length,
    pending: items.filter(item => !review.decisions[item.key]).length, unsure: count(items, 'UNSURE'),
    accepted: count(requirements, 'ACCEPT'), modified: count(requirements, 'MODIFY'), rejected: count(requirements, 'REJECT'),
    requirementTotal: requirements.length, questionTotal: items.length - requirements.length,
    historicalJudged: historical.length, historicalAccepted: count(historical, 'ACCEPT'),
    historicalModified: count(historical, 'MODIFY'), newDecisions: judged.length - historical.length,
    omissions: review.omissions.length, missed: review.omissions.filter(item => item.basis === 'MISSED').length,
    engagedMs: review.events.reduce((sum, event) => sum + (event.engagedMs || 0), 0),
    status: review.status };
}
