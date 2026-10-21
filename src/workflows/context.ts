import type { DefinitionRepository } from '../definitions/repository.js';
import { outputPorts, currentNode, type WorkflowDefinition, type WorkflowRun } from './types.js';

/** Project persisted ownership into an executor package without inventing another work identity. */
export function workflowWorkContext(repository: DefinitionRepository, workId: string) {
  const row = repository.db.prepare('SELECT run_id,node_id,generation FROM workflow_node_works WHERE work_id=?').get(workId);
  if (!row) return undefined;
  const saved = repository.db.prepare('SELECT payload_json FROM workflow_runs WHERE id=?').get(String(row.run_id))!;
  const run = JSON.parse(String(saved.payload_json)) as WorkflowRun, nodeId = String(row.node_id), generation = Number(row.generation);
  const node = run.nodes[nodeId]!.find(n => n.generation === generation)!;
  const fixed = repository.db.prepare('SELECT payload_json FROM workflow_definitions WHERE id=?').get(run.workflowId)!;
  const definition = JSON.parse(String(fixed.payload_json)) as WorkflowDefinition;
  const contract = repository.get(definition.nodes.find(n => n.id === nodeId)!.contractId);
  return { runId: run.id, name: run.name, nodeId, generation, directory: node.directory!, outputs: outputPorts(contract), adopted: node.adopted, note: node.note, current: currentNode(run, nodeId).workId === workId, status: run.status };
}
