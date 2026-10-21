import { randomUUID } from 'node:crypto';
import { basename, join } from 'node:path';
import { ensure, object, string } from '../contracts/definition.js';
import { acceptanceChecks } from '../contracts/rules.js';
import type { Inputs } from '../definitions/repository.js';
import { MaterialStore, type Material } from '../definitions/storage.js';
import type { WorkflowCore } from './core.js';
import { outputPorts, type NodeCommand, type OutputVersion } from './types.js';
import { validateValue } from './validation.js';

function registerFile(w: WorkflowCore, workId: string, m: Material): string {
  return w.core.addArtifactRef(workId, { path: m.path, filename: basename(m.path), role: 'DELIVERABLE', mimeType: null, size: m.size, sha256: m.hash, lastModifiedAt: new Date().toISOString(), availability: 'AVAILABLE' }).artifactRefs.find(a => a.path === m.path && a.sha256 === m.hash)!.id;
}
export function submitOutputs(w: WorkflowCore, input: NodeCommand & { outputs: Inputs }): void {
  w.command(input, 'submitWorkflowOutputs', (run, d) => {
    ensure(run.status === 'RUNNING', 'WORKFLOW_NOT_RUNNING'); const n = w.node(run, input);
    ensure(n.workId && n.phase === 'PREPARED', 'WORKFLOW_NODE_NOT_ACTIVE', '本轮成果已提交；修改请退回或创建新一轮'); object(input.outputs);
    const ports = outputPorts(w.repository.get(d.nodes.find(x => x.id === input.nodeId)!.contractId));
    ensure(Object.keys(input.outputs).length === ports.length, 'INPUT_REQUIRED', '请关联每项约定的交付物');
    const store = new MaterialStore(join(n.directory!, 'submitted')), outputs: OutputVersion[] = [];
    for (const p of ports) {
      const value = input.outputs[p.key]; validateValue(p, value); const o: OutputVersion = { id: randomUUID(), key: p.key, valueType: p.valueType, value: value! };
      if (p.valueType === 'FILE') { o.material = store.copy(String(value), p.key, true); o.value = o.material.path; o.artifactId = registerFile(w, n.workId, o.material); }
      outputs.push(o);
    }
    // A manifest makes typed text/number outputs part of the same immutable acceptance evidence.
    const manifest = store.freeze(Buffer.from(JSON.stringify(outputs, null, 2)), 'OUTPUT_MANIFEST', 'outputs.json', 'outputs.json');
    n.manifestId = registerFile(w, n.workId, manifest); n.outputs = outputs; n.phase = 'SUBMITTED';
    w.event(run, 'SUBMITTED', `第 ${n.generation} 轮成果已固定，等待逐项验收`, input.nodeId);
  });
}
export type ReviewCommand = NodeCommand & { decision: 'PASS' | 'REVISE'; criteria: Record<string, 'PASS' | 'NEEDS_REVISION'>; note?: string };
export function reviewOutputs(w: WorkflowCore, input: ReviewCommand): void {
  w.command(input, 'reviewWorkflowNode', (run, d) => {
    ensure(run.status === 'RUNNING', 'WORKFLOW_NOT_RUNNING'); const n = w.node(run, input);
    ensure(n.phase === 'SUBMITTED' && n.workId, 'WORKFLOW_NODE_NOT_SUBMITTED', '请先提交本轮成果');
    const criteria = acceptanceChecks(w.repository.get(d.nodes.find(x => x.id === input.nodeId)!.contractId).content);
    object(input.criteria); ensure(Object.keys(input.criteria).length === criteria.length && criteria.every(c => ['PASS', 'NEEDS_REVISION'].includes(input.criteria[c.key]!)), 'INPUT_REQUIRED', '请逐项核对验收要求');
    ensure(input.decision === 'PASS' || input.decision === 'REVISE', 'INVALID_INPUT'); n.criteria = input.criteria;
    if (input.decision === 'REVISE') {
      string(input.note); ensure(input.note.length <= 10000, 'INVALID_INPUT'); n.phase = 'SUPERSEDED';
      run.nodes[input.nodeId]!.push({ generation: n.generation + 1, phase: 'WAITING', adopted: [], outputs: [], note: input.note });
      w.event(run, 'REJECTED', input.note, input.nodeId); return;
    }
    ensure(criteria.every(c => input.criteria[c.key] === 'PASS'), 'INPUT_REQUIRED', '请确认全部要求后再通过');
    n.outputs.forEach(o => { if (o.material) new MaterialStore(run.directory).verify(o.material); });
    w.repository.accept({ workId: n.workId, artifactIds: [n.manifestId!, ...n.outputs.flatMap(o => o.artifactId ? [o.artifactId] : [])], criteriaResults: input.criteria, commandId: `${input.commandId}:accept` }, true);
    n.phase = 'ACCEPTED'; n.acceptedAt = new Date().toISOString(); n.outputs.forEach(o => { o.acceptedAt = n.acceptedAt!; });
    w.event(run, 'ACCEPTED', `第 ${n.generation} 轮验收通过，成果可供下游采用`, input.nodeId);
  });
}
