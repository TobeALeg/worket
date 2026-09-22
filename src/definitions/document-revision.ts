import { randomUUID } from 'node:crypto';
import { basename, extname } from 'node:path';
import { TextDecoder } from 'node:util';
import { ensure, LIMITS } from '../contracts/definition.js';
import { clauseText, ruleItems } from '../contracts/rules.js';
import { hash } from './storage.js';
import type { DefinitionRepository, Draft } from './repository.js';
import type { Snapshot } from '../distillation/service.js';

export function previewDocumentRevision(repository: DefinitionRepository, input: { draftId: string; address: string; path: string }) {
  const draft = repository.read<Draft>('definition_drafts', input.draftId);
  ensure(!draft.publishedId && !draft.invalidated, 'DRAFT_NOT_EDITABLE');
  const item = ruleItems(draft.content).find(r => r.address === input.address)?.item;
  ensure(item?.document, 'INVALID_SOURCE_REF');
  ensure(['.md', '.txt'].includes(extname(input.path).toLowerCase()), 'UNSUPPORTED_FILE', '规范版本更新仅支持 Markdown / UTF-8 文本');
  const bytes = repository.materials.read(input.path, LIMITS.maxBytes);
  const text = new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const contentHash = hash(bytes);
  return { previous: item.document, previousText: item.text, text, hash: contentHash, name: basename(input.path), changed: contentHash !== item.document.hash };
}

export function adoptDocumentRevision(repository: DefinitionRepository, input: { draftId: string; expectedRevision: number; address: string; path: string; expectedHash: string; startLine: number; endLine: number }): Draft {
  const preview = previewDocumentRevision(repository, input);
  ensure(preview.hash === input.expectedHash, 'SOURCE_CHANGED');
  const draft = repository.read<Draft>('definition_drafts', input.draftId);
  ensure(draft.revision === input.expectedRevision, 'REVISION_CONFLICT');
  const selectedText = clauseText(preview.text, input);
  ensure(Number.isInteger(input.startLine) && input.startLine > 0 && Number.isInteger(input.endLine) && input.endLine >= input.startLine, 'INVALID_SOURCE_REF');
  const snapshotId = randomUUID(), fileId = randomUUID();
  const source = { snapshotId, workId: preview.previous.source.workId, eventId: fileId };
  const snapshot: Snapshot = { id: snapshotId, schemaVersion: 1, capturedAt: new Date().toISOString(), contentHash: preview.hash,
    sources: [{ workId: source.workId, key: 'document-review', title: preview.name, status: 'REVIEWED', events: [], files: [{ id: fileId, name: preview.name, path: input.path, hash: preview.hash, role: 'NORMATIVE', content: preview.text }] }] };
  // Freeze exactly the previewed bytes. Existing definitions keep their old snapshots.
  repository.db.prepare('INSERT INTO source_snapshots VALUES (?,?)').run(snapshot.id, JSON.stringify(snapshot));
  const content = structuredClone(draft.content);
  const item = ruleItems(content).find(r => r.address === input.address)!.item;
  item.document = { source, hash: preview.hash, name: preview.name, startLine: input.startLine, endLine: input.endLine };
  item.text = selectedText;
  const updated = repository.update({ draftId: draft.id, expectedRevision: draft.revision, content, issueResolutions: [], replaceResolutions: true });
  updated.refs.push(source);
  for (const row of ruleItems(updated.content)) if (row.item.rule?.relation?.target === input.address) {
    row.item.rule.status = 'PROPOSED';
    const issueId = `document-change-${updated.revision}-${row.address}`;
    updated.issues.push({ id: issueId, type: 'UNCERTAIN_GENERALIZATION', field: row.address, message: '依赖条款已更新，请重新确认这条合并、补充或替代关系；未确认前不生效。', blocking: true });
  }
  repository.write('definition_drafts', updated);
  return updated;
}
