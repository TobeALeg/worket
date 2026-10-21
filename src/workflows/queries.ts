import { ensure } from '../contracts/definition.js';
import { currentNode, type WorkflowRun, type WorkflowDefinition } from './types.js';
import type { WorkflowCore } from './core.js';

export type RunSummary = { id: string; name: string; workflowId: string; workflowKey: string; workflowName: string; version: number; status: WorkflowRun['status']; revision: number; updatedAt: string; accepted: number; total: number; review: { nodeId: string; name: string; generation: number }[] };
export type RunQuery = { workflowKey?: string; status?: WorkflowRun['status']; search?: string; review?: boolean; cursor?: { updatedAt: string; id: string }; limit?: number };
export type RunPage = { items: RunSummary[]; cursor: RunQuery['cursor'] | null };

/** Read-only projections; pending acceptance has no separate mutable task status. */
export function queryRuns(w: WorkflowCore, input: RunQuery = {}): RunPage {
  const limit = input.limit ?? 50;
  ensure(Number.isSafeInteger(limit) && limit > 0 && limit <= 100, 'INVALID_INPUT');
  const clauses: string[] = [], values: (string | number)[] = [];
  if (input.workflowKey) { ensure(typeof input.workflowKey === 'string', 'INVALID_INPUT'); clauses.push('d.definition_key=?'); values.push(input.workflowKey); }
  if (input.status) { ensure(['RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED'].includes(input.status), 'INVALID_INPUT'); clauses.push("json_extract(r.payload_json,'$.status')=?"); values.push(input.status); }
  if (input.search) { ensure(typeof input.search === 'string' && input.search.length <= 160, 'INVALID_INPUT'); clauses.push("instr(lower(json_extract(r.payload_json,'$.name') || ' ' || json_extract(d.payload_json,'$.name')),lower(?))>0"); values.push(input.search); }
  if (input.review) clauses.push("json_extract(r.payload_json,'$.status') IN ('RUNNING','PAUSED') AND EXISTS (SELECT 1 FROM json_each(r.payload_json,'$.nodes') AS n WHERE json_extract(n.value,'$[#-1].phase')='SUBMITTED')");
  if (input.cursor) { ensure(typeof input.cursor.updatedAt === 'string' && typeof input.cursor.id === 'string', 'INVALID_INPUT'); clauses.push("(json_extract(r.payload_json,'$.updatedAt'),r.id)<(?,?)"); values.push(input.cursor.updatedAt, input.cursor.id); }
  const rows = w.db.prepare(`SELECT r.payload_json,d.payload_json AS definition FROM workflow_runs r JOIN workflow_definitions d ON d.id=r.workflow_id ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''} ORDER BY json_extract(r.payload_json,'$.updatedAt') DESC,r.id DESC LIMIT ?`).all(...values, limit + 1);
  const items = rows.slice(0, limit).map(row => {
    const run = JSON.parse(String(row.payload_json)) as WorkflowRun, definition = JSON.parse(String(row.definition)) as WorkflowDefinition;
    return { id: run.id, name: run.name, workflowId: definition.id, workflowKey: definition.key, workflowName: definition.name, version: definition.version, status: run.status, revision: run.revision, updatedAt: run.updatedAt, total: definition.nodes.length, accepted: definition.nodes.filter(n => currentNode(run, n.id).phase === 'ACCEPTED').length, review: definition.nodes.flatMap(n => { const current = currentNode(run, n.id); return current.phase === 'SUBMITTED' ? [{ nodeId: n.id, name: n.name, generation: current.generation }] : []; }) };
  });
  const last = items.at(-1);
  return { items, cursor: rows.length > limit && last ? { updatedAt: last.updatedAt, id: last.id } : null };
}
