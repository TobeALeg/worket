import { ensure, object, string } from '../contracts/definition.js';
import { hash, transaction } from '../definitions/storage.js';
import type { WorkflowCore } from './core.js';
import type { WorkflowContent, WorkflowDefinition } from './types.js';

export type WorkflowDraft = { id: string; baseId?: string; revision: number; content: WorkflowContent; selectedNode: string; updatedAt: string; publishedId?: string };
export type DraftSummary = Pick<WorkflowDraft, 'id' | 'baseId' | 'revision' | 'updatedAt'> & { name: string };

/** Editable documents are separate from confirmed, executable workflow versions. */
export class WorkflowDrafts {
  constructor(private readonly workflows: WorkflowCore) {}
  private get db() { return this.workflows.db; }
  get(id: string): WorkflowDraft {
    string(id); const row = this.db.prepare('SELECT * FROM workflow_drafts WHERE id=?').get(id);
    ensure(row, 'DRAFT_NOT_FOUND', '流程草稿不存在');
    return { id, revision: Number(row.revision), content: JSON.parse(String(row.content_json)), selectedNode: String(row.selected_node), updatedAt: String(row.updated_at), ...(row.base_id ? { baseId: String(row.base_id) } : {}), ...(row.published_id ? { publishedId: String(row.published_id) } : {}) };
  }
  list(): DraftSummary[] {
    return this.db.prepare("SELECT id,base_id,revision,updated_at,json_extract(content_json,'$.name') AS name FROM workflow_drafts WHERE published_id IS NULL ORDER BY updated_at DESC,id DESC").all().map(row => ({ id: String(row.id), revision: Number(row.revision), name: String(row.name), updatedAt: String(row.updated_at), ...(row.base_id ? { baseId: String(row.base_id) } : {}) }));
  }
  save(input: { id: string; expectedRevision: number; content: WorkflowContent; selectedNode: string; baseId?: string }): WorkflowDraft {
    string(input.id); object(input.content); ensure(Number.isSafeInteger(input.expectedRevision) && input.expectedRevision >= 0, 'INVALID_INPUT');
    ensure(typeof input.selectedNode === 'string' && input.selectedNode.length <= 160, 'INVALID_INPUT');
    ensure(typeof input.content.name === 'string' && input.content.name.length <= 160 && ['inputs', 'nodes', 'outputs'].every(k => Array.isArray(input.content[k as keyof WorkflowContent])), 'INVALID_INPUT');
    const json = JSON.stringify(input.content); ensure(Buffer.byteLength(json) <= 2 * 1024 * 1024, 'INPUT_TOO_LARGE');
    return transaction(this.db, () => {
      const exists = this.db.prepare('SELECT id FROM workflow_drafts WHERE id=?').get(input.id), old = exists ? this.get(input.id) : undefined;
      ensure(!old?.publishedId, 'DRAFT_PUBLISHED', '此草稿已保存为流程版本，请打开正式流程');
      ensure(!old || old.baseId === input.baseId, 'INVALID_INPUT');
      if (old && old.revision === input.expectedRevision + 1 && old.baseId === input.baseId && old.selectedNode === input.selectedNode && hash(old.content) === hash(input.content)) return old;
      ensure((old?.revision ?? 0) === input.expectedRevision, 'REVISION_CONFLICT', '草稿已在其他页面修改；当前内容仍保留，请另存草稿或重新打开');
      if (input.baseId) this.workflows.definition(input.baseId);
      const updatedAt = new Date().toISOString();
      this.db.prepare('INSERT INTO workflow_drafts VALUES (?,?,?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,content_json=excluded.content_json,selected_node=excluded.selected_node,updated_at=excluded.updated_at').run(input.id, input.baseId ?? null, input.expectedRevision + 1, json, input.selectedNode, updatedAt);
      return this.get(input.id);
    });
  }
  publish(input: { id: string; expectedRevision: number; commandId: string }): WorkflowDefinition {
    return this.workflows.repository.command(input.commandId, { op: 'publishWorkflowDraft', ...input }, input.id, () => {
      const draft = this.get(input.id);
      ensure(draft.revision === input.expectedRevision, 'REVISION_CONFLICT', '草稿已变化，请重新核对');
      if (draft.publishedId) return this.workflows.definition(draft.publishedId);
      const used = new Set(draft.content.nodes.flatMap(n => Object.values(n.bindings).flatMap(b => b.type === 'INPUT' ? [b.key] : [])));
      const content = { ...draft.content, inputs: draft.content.inputs.filter(p => used.has(p.key)) };
      const definition = this.workflows.save({ content, ...(draft.baseId ? { baseId: draft.baseId } : {}), commandId: `${input.commandId}:definition` });
      this.db.prepare('UPDATE workflow_drafts SET published_id=? WHERE id=?').run(definition.id, draft.id);
      return definition;
    });
  }
  remove(input: { id: string; expectedRevision: number }): void {
    transaction(this.db, () => { const draft = this.get(input.id); ensure(!draft.publishedId && draft.revision === input.expectedRevision, 'REVISION_CONFLICT'); this.db.prepare('DELETE FROM workflow_drafts WHERE id=?').run(input.id); });
  }
}
