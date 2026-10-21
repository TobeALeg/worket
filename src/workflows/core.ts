import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ensure, object, string } from '../contracts/definition.js';
import type { WorkCore } from '../core/types.js';
import type { DefinitionRepository, Inputs } from '../definitions/repository.js';
import { MaterialStore } from '../definitions/storage.js';
import { workflowWorkContext } from './context.js';
import { validateValue, validateWorkflow } from './validation.js';
import { submitOutputs, reviewOutputs, type ReviewCommand } from './outputs.js';
import { currentNode, dependencies, type Adoption, type NodeCommand, type NodeRun, type OutputVersion, type RunCommand, type RunDetail, type WorkflowContent, type WorkflowDefinition, type WorkflowRun } from './types.js';

export class WorkflowCore {
  constructor(readonly core: WorkCore, readonly repository: DefinitionRepository) {}
  get db() { return this.repository.db; }
  definitions(): WorkflowDefinition[] {
    return this.db.prepare('SELECT payload_json FROM workflow_definitions ORDER BY rowid DESC').all().map(r => JSON.parse(String(r.payload_json)));
  }
  definition(id: string): WorkflowDefinition {
    string(id); const row = this.db.prepare('SELECT payload_json FROM workflow_definitions WHERE id=?').get(id);
    ensure(row, 'WORKFLOW_NOT_FOUND', '流程不存在'); return JSON.parse(String(row.payload_json));
  }
  save(input: { content: WorkflowContent; baseId?: string; commandId: string }): WorkflowDefinition {
    return this.repository.command(input.commandId, { op: 'saveWorkflow', ...input }, input.baseId ?? 'workflow', () => {
      validateWorkflow(input.content, this.repository);
      const base = input.baseId ? this.definition(input.baseId) : undefined;
      if (base) ensure(this.definitions().find(d => d.key === base.key)?.id === base.id, 'REVISION_CONFLICT', '流程已有新版，请重新打开');
      const d: WorkflowDefinition = { ...structuredClone(input.content), id: randomUUID(), key: base?.key ?? randomUUID(), version: (base?.version ?? 0) + 1, confirmedAt: new Date().toISOString() };
      this.db.prepare('INSERT INTO workflow_definitions VALUES (?,?,?,?)').run(d.id, d.key, d.version, JSON.stringify(d));
      for (const id of new Set(d.nodes.map(n => n.contractId))) this.db.prepare('INSERT INTO workflow_contract_refs VALUES (?,?)').run(d.id, id);
      return d;
    });
  }
  runs(workflowId?: string): WorkflowRun[] {
    if (workflowId) string(workflowId);
    return this.db.prepare('SELECT payload_json FROM workflow_runs ORDER BY rowid DESC').all().map(r => JSON.parse(String(r.payload_json)) as WorkflowRun).filter(r => !workflowId || r.workflowId === workflowId);
  }
  run(id: string): WorkflowRun {
    string(id); const row = this.db.prepare('SELECT payload_json FROM workflow_runs WHERE id=?').get(id);
    ensure(row, 'WORKFLOW_RUN_NOT_FOUND', '本次流程不存在'); return JSON.parse(String(row.payload_json));
  }
  event(run: WorkflowRun, type: string, detail: string, nodeId?: string): void { run.events.push({ at: new Date().toISOString(), type, detail, ...(nodeId ? { nodeId } : {}) }); }
  private refresh(run: WorkflowRun, d: WorkflowDefinition): void {
    for (const node of d.nodes) {
      const n = currentNode(run, node.id);
      if (n.phase === 'WAITING' || n.phase === 'READY') n.phase = dependencies(node).every(id => currentNode(run, id).phase === 'ACCEPTED') ? 'READY' : 'WAITING';
    }
    if (run.status !== 'PAUSED' && run.status !== 'CANCELLED') run.status = d.nodes.every(n => currentNode(run, n.id).phase === 'ACCEPTED') ? 'COMPLETED' : 'RUNNING';
  }
  command<T>(input: RunCommand, op: string, action: (run: WorkflowRun, definition: WorkflowDefinition) => T): T {
    return this.repository.command(input.commandId, { op, ...input }, input.runId, () => {
      const run = this.run(input.runId); ensure(run.revision === input.expectedRevision, 'REVISION_CONFLICT', '流程状态已变化，请刷新后重试');
      const d = this.definition(run.workflowId), result = action(run, d); this.refresh(run, d);
      run.revision++; run.updatedAt = new Date().toISOString();
      this.db.prepare('UPDATE workflow_runs SET payload_json=? WHERE id=?').run(JSON.stringify(run), run.id); return result;
    });
  }
  node(run: WorkflowRun, input: NodeCommand): NodeRun {
    ensure(run.nodes[input.nodeId], 'INVALID_INPUT'); const n = currentNode(run, input.nodeId);
    ensure(n.generation === input.generation, 'STALE_GENERATION', '这是旧一轮工作的交付，不能覆盖当前一轮'); return n;
  }
  create(input: { workflowId: string; name: string; inputs: Inputs; commandId: string }): string {
    return this.repository.command(input.commandId, { op: 'createWorkflowRun', ...input }, input.workflowId, () => {
      string(input.name); ensure(input.name.length <= 160, 'INVALID_INPUT'); object(input.inputs);
      const d = this.definition(input.workflowId); validateWorkflow(d, this.repository);
      ensure(Object.keys(input.inputs).every(key => d.inputs.some(p => p.key === key)), 'INVALID_INPUT');
      const id = randomUUID(), directory = join(this.repository.materials.directory, 'workflows', id), store = new MaterialStore(join(directory, 'inputs'));
      const run: WorkflowRun = { id, workflowId: d.id, name: input.name, directory, status: 'RUNNING', revision: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), inputs: {}, inputMaterials: [], nodes: {}, events: [] };
      for (const p of d.inputs) {
        const value = input.inputs[p.key] ?? p.defaultValue;
        if (value === undefined || value === '') { ensure(!p.required, 'INPUT_REQUIRED', p.text); continue; }
        validateValue(p, value);
        if (p.valueType === 'FILE') { const m = store.copy(String(value), p.key, true); run.inputMaterials.push(m); run.inputs[p.key] = m.path; }
        else run.inputs[p.key] = value;
      }
      for (const n of d.nodes) run.nodes[n.id] = [{ generation: 1, phase: 'WAITING', adopted: [], outputs: [] }];
      this.refresh(run, d); this.event(run, 'CREATED', '创建独立运行，固定流程版本与本次输入');
      this.db.prepare('INSERT INTO workflow_runs VALUES (?,?,?)').run(id, d.id, JSON.stringify(run)); return id;
    });
  }
  output(run: WorkflowRun, nodeId: string, key: string): OutputVersion {
    const n = currentNode(run, nodeId); ensure(n.phase === 'ACCEPTED', 'INPUT_REQUIRED', '上游成果尚未验收');
    const o = n.outputs.find(o => o.key === key && o.acceptedAt); ensure(o, 'INPUT_REQUIRED', '上游交付物缺失');
    if (o.material) new MaterialStore(run.directory).verify(o.material); return o;
  }
  prepare(input: NodeCommand): string {
    let created: string | undefined;
    try { return this.command(input, 'prepareWorkflowNode', (run, d) => {
      ensure(run.status === 'RUNNING', 'WORKFLOW_NOT_RUNNING', '请先恢复本次流程'); const n = this.node(run, input);
      if (n.workId) { ensure(n.phase === 'PREPARED', 'WORKFLOW_NODE_NOT_READY'); return n.workId; }
      ensure(n.phase === 'READY', 'WORKFLOW_NODE_NOT_READY', '请先完成并验收前置工作');
      const node = d.nodes.find(x => x.id === input.nodeId)!, values: Inputs = {}, adopted: Adoption[] = [];
      for (const [key, b] of Object.entries(node.bindings)) {
        if (b.type === 'INPUT') { const m = run.inputMaterials.find(m => m.role === b.key); if (m) new MaterialStore(run.directory).verify(m); if (run.inputs[b.key] !== undefined) values[key] = run.inputs[b.key]!; }
        else if (b.type === 'VALUE') values[key] = b.value;
        else { const o = this.output(run, b.nodeId, b.key); values[key] = o.value; adopted.push({ inputKey: key, nodeId: b.nodeId, generation: currentNode(run, b.nodeId).generation, outputId: o.id, outputKey: o.key }); }
      }
      n.directory = join(run.directory, 'nodes', node.id, String(n.generation)); mkdirSync(n.directory, { recursive: true });
      created = this.repository.create({ definitionId: node.contractId, inputs: values, referenceExampleIds: [], commandId: `workflow-prepare:${run.id}:${node.id}:${n.generation}` });
      const copied = this.repository.inputs(created).inputMaterials ?? [];
      for (const [key, binding] of Object.entries(node.bindings)) {
        const expected = binding.type === 'INPUT' ? run.inputMaterials.find(m => m.role === binding.key)
          : binding.type === 'OUTPUT' ? this.output(run, binding.nodeId, binding.key).material : undefined;
        if (expected) ensure(copied.find(m => m.role === key)?.hash === expected.hash, 'SOURCE_CHANGED', '准备期间输入版本发生变化，未采用改动后的文件');
      }
      n.workId = created; n.adopted = adopted; n.phase = 'PREPARED';
      this.db.prepare('INSERT INTO workflow_node_works VALUES (?,?,?,?)').run(created, run.id, node.id, n.generation);
      if (n.note) this.recordRework(created, n.note);
      this.event(run, 'PREPARED', `准备第 ${n.generation} 轮工作，固定实际采用的输入`, node.id); return created;
    }); } catch (error) { if (created && !this.db.prepare('SELECT id FROM work_instances WHERE id=?').get(created)) this.repository.instanceFiles.remove(created); throw error; }
  }
  private recordRework(workId: string, note: string): void {
    const id = randomUUID(), sequence = Number(this.db.prepare('SELECT MAX(sequence)+1 AS value FROM source_events WHERE work_instance_id=?').get(workId)!.value);
    this.db.prepare("INSERT INTO source_events (work_instance_id,id,external_id,sequence,kind,content,timestamp,executor_type,environment_type,metadata_json,artifact_refs_json) VALUES (?,?,?,?, 'work.rework',?,?,'HUMAN','WORKPET_LOCAL','{}','[]')").run(workId, id, id, sequence, note, new Date().toISOString());
    const row = this.db.prepare('SELECT state_json FROM work_records WHERE work_instance_id=?').get(workId)!;
    const state = JSON.parse(String(row.state_json)); state.pendingActions.push({ id: randomUUID(), text: note, origin: 'USER_STATED', sourceMessageIds: [id] });
    this.db.prepare('UPDATE work_records SET state_json=? WHERE work_instance_id=?').run(JSON.stringify(state), workId);
  }
  context(workId: string) { return workflowWorkContext(this.repository, workId); }

  assertActive(workId: string): void {
    const c = this.context(workId); if (!c) return;
    ensure(c.current && c.status === 'RUNNING' && currentNode(this.run(c.runId), c.nodeId).phase === 'PREPARED', 'WORKFLOW_NODE_NOT_ACTIVE', '此轮已提交、被重做或流程已暂停，请回到所属流程查看');
  }
  submit(input: NodeCommand & { outputs: Inputs }): void { submitOutputs(this, input); }
  review(input: ReviewCommand): void { reviewOutputs(this, input); }
  rework(input: NodeCommand & { note: string }): void {
    this.command(input, 'reworkWorkflowNode', run => {
      ensure(['RUNNING', 'COMPLETED'].includes(run.status), 'WORKFLOW_NOT_RUNNING'); string(input.note); ensure(input.note.length <= 10000, 'INVALID_INPUT');
      const n = this.node(run, input); ensure(n.workId && n.phase !== 'SUPERSEDED', 'WORKFLOW_NODE_NOT_ACTIVE');
      n.phase = 'SUPERSEDED'; run.status = 'RUNNING'; run.nodes[input.nodeId]!.push({ generation: n.generation + 1, phase: 'WAITING', adopted: [], outputs: [], note: input.note }); this.event(run, 'REWORKED', input.note, input.nodeId);
    });
  }
  impact(runId: string, sourceNodeId: string): string[] {
    const d = this.definition(this.run(runId).workflowId); ensure(d.nodes.some(n => n.id === sourceNodeId), 'INVALID_INPUT'); const affected = new Set([sourceNodeId]);
    let previous = 0; while (previous !== affected.size) { previous = affected.size; for (const n of d.nodes) if (dependencies(n).some(id => affected.has(id))) affected.add(n.id); }
    return d.nodes.filter(n => n.id !== sourceNodeId && affected.has(n.id)).map(n => n.id);
  }
  adopt(input: NodeCommand): void {
    this.command(input, 'adoptWorkflowRevision', (run, d) => {
      ensure(['RUNNING', 'COMPLETED'].includes(run.status), 'WORKFLOW_NOT_RUNNING'); const source = this.node(run, input); ensure(source.phase === 'ACCEPTED', 'INPUT_REQUIRED', '新版须先验收'); source.outputs.forEach(o => this.output(run, input.nodeId, o.key));
      ensure(this.detail(run.id).updates[input.nodeId]?.length, 'NO_NEW_OUTPUT', '后续工作已经采用当前版本，无须重复重做');
      for (const id of this.impact(run.id, input.nodeId)) {
        const n = currentNode(run, id);
        if (n.workId) { n.phase = 'SUPERSEDED'; run.nodes[id]!.push({ generation: n.generation + 1, phase: 'WAITING', adopted: [], outputs: [], note: `采用 ${d.nodes.find(x => x.id === input.nodeId)!.name} 第 ${source.generation} 轮成果，重做受影响的后续工作` }); }
        else { n.phase = 'WAITING'; n.adopted = []; }
      }
      run.status = 'RUNNING'; this.event(run, 'ADOPTED', `明确采用 ${input.nodeId} 第 ${source.generation} 轮成果，仅重做受影响后续`, input.nodeId);
    });
  }
  setStatus(input: RunCommand & { status: 'RUNNING' | 'PAUSED' | 'CANCELLED' }): void {
    this.command(input, 'setWorkflowStatus', run => {
      ensure(input.status === 'RUNNING' ? run.status === 'PAUSED' : ['PAUSED', 'CANCELLED'].includes(input.status) && ['RUNNING', 'PAUSED'].includes(run.status), 'INVALID_INPUT');
      run.status = input.status; this.event(run, input.status, input.status === 'PAUSED' ? '暂停新工作交付；外部执行仍可能继续' : input.status === 'CANCELLED' ? '取消本次流程，保留历史与外部执行记录' : '恢复本次流程');
    });
  }
  detail(id: string): RunDetail {
    const run = this.run(id), definition = this.definition(run.workflowId), contracts = Object.fromEntries(definition.nodes.map(n => [n.id, this.repository.get(n.contractId)]));
    const phases: Record<string, string> = {}, updates: Record<string, string[]> = {};
    for (const node of definition.nodes) {
      const n = currentNode(run, node.id); phases[node.id] = ({ WAITING: '等待输入', READY: '可开展', PREPARED: '可开展', SUBMITTED: '待验收', ACCEPTED: '已验收', SUPERSEDED: '已被重做' })[n.phase];
      if (n.phase === 'PREPARED' && n.workId) {
        const work = this.core.getWork(n.workId), dispatch = this.db.prepare('SELECT status,read_at FROM pending_dispatches WHERE work_id=?').get(n.workId);
        if (dispatch?.status === 'FAILED') phases[node.id] = '交付失败';
        else if (work?.activeBinding) phases[node.id] = !work.activeBinding.conversationId.startsWith('pending:') && work.packageReadAt ? '执行中' : '等待接手';
        else if (dispatch && ['STARTING', 'WAITING'].includes(String(dispatch.status))) phases[node.id] = '等待接手';
      }
      for (const a of n.adopted) { const latest = currentNode(run, a.nodeId).outputs.find(o => o.key === a.outputKey && o.acceptedAt); if (latest && latest.id !== a.outputId) (updates[a.nodeId] ??= []).push(node.id); }
    }
    return { run, definition, contracts, phases, updates };
  }
}
