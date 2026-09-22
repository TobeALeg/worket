import { randomUUID } from 'node:crypto';
import { array, ensure, object, string } from '../contracts/definition.js';
import { ruleText } from '../contracts/rules.js';
import type { WorkState } from '../core/types.js';
import { resolveRuleDocuments } from './document-rules.js';
import type { DefinitionRepository } from './repository.js';
import { hash } from './storage.js';

export type UpdateInstanceFiles = {
  workId: string; files: Record<string, string>; removeReferenceIds: string[];
  expectedHash: string; commandId: string;
};
/** Explicit user selection changes this instance only; old package files remain available. */
export function updateInstanceFiles(repository: DefinitionRepository, input: UpdateInstanceFiles): void {
  object(input.files); array(input.removeReferenceIds); string(input.expectedHash);
  repository.command(input.commandId, { op: 'updateInstanceFiles', ...input }, input.workId, () => {
    const db = repository.db;
    const work = db.prepare('SELECT * FROM work_instances WHERE id=?').get(input.workId);
    ensure(work?.status === 'OPEN', 'WORK_NOT_OPEN');
    const definition = repository.get(work.definition_id as string);
    const binding = repository.inputs(input.workId);
    ensure(hash(binding) === input.expectedHash, 'INSTANCE_INPUTS_CHANGED', '本次文件已在别处更新，请重新打开后选择');
    ensure(Object.keys(input.files).every(key => definition.content.inputs.some(spec => spec.key === key && spec.valueType === 'FILE')), 'INVALID_INPUT');
    ensure(input.removeReferenceIds.every(id => binding.referenceExamples.some(reference => reference.id === id)), 'INVALID_INPUT');
    for (const [key, path] of Object.entries(input.files)) {
      string(path);
      const material = repository.instanceFiles.copy(input.workId, path, key);
      binding.inputs[key] = material.path;
      binding.inputMaterials = [...(binding.inputMaterials ?? []).filter(item => item.role !== key), material];
    }
    binding.referenceExamples = binding.referenceExamples.filter(reference => !input.removeReferenceIds.includes(reference.id))
      .map(reference => repository.instanceFiles.reference(input.workId, reference));
    repository.instanceFiles.verify(input.workId, definition, binding);
    if (hash(binding) === input.expectedHash) return { changed: false };
    const previous = db.prepare("SELECT id FROM source_events WHERE work_instance_id=? AND kind='work.input_provided' ORDER BY sequence DESC LIMIT 1").get(input.workId);
    const adopted = db.prepare("SELECT id FROM source_events WHERE work_instance_id=? AND kind='work.definition_applied' ORDER BY sequence LIMIT 1").get(input.workId);
    const next = db.prepare('SELECT COALESCE(MAX(sequence),0)+1 AS value FROM source_events WHERE work_instance_id=?').get(input.workId)!;
    const at = new Date().toISOString(), eventId = randomUUID();
    db.prepare(`INSERT INTO source_events (work_instance_id,id,external_id,sequence,kind,content,timestamp,executor_type,environment_type,metadata_json,artifact_refs_json)
      VALUES (?,?,?,?,'work.input_provided',?,?,'HUMAN','WORKPET_LOCAL',?,'[]')`).run(input.workId, eventId, eventId, next.value!, JSON.stringify({
        inputs: binding.inputs, ruleOverrides: binding.ruleOverrides ?? [], changedFileKeys: Object.keys(input.files), removedReferenceIds: input.removeReferenceIds,
      }), at, JSON.stringify({ worketSource: { adapter: 'worket', conversationId: input.workId, externalId: 'instance-inputs', ...(previous ? { previousEventId: previous.id } : {}) } }));
    const row = db.prepare('SELECT state_json FROM work_records WHERE work_instance_id=?').get(input.workId)!;
    const state = JSON.parse(row.state_json as string) as WorkState;
    const interpolate = (text: string) => text.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => String(binding.inputs[key] ?? '（待提供）'));
    // Preserve manual edits/deletions: update existing generated items in place only.
    state.facts = state.facts.map(item => {
      if (item.origin === 'USER_EDITED' || !previous || !item.sourceMessageIds.includes(String(previous.id))) return item;
      const key = Object.keys(binding.inputs).find(key => item.text.startsWith(`${key}: `));
      return key ? { ...item, text: `${key}: ${binding.inputs[key]}`, sourceMessageIds: [eventId] } : item;
    });
    const resolved = resolveRuleDocuments(definition.content, definition.materials, repository.materials, binding.ruleOverrides ?? []);
    const sections = { objective: [definition.content.purpose.text], constraints: resolved.content.constraints.map(ruleText), successCriteria: resolved.content.acceptanceCriteria.map(ruleText) };
    for (const field of ['objective', 'constraints', 'successCriteria'] as const) {
      for (const item of state[field]) {
        if (item.origin === 'USER_EDITED' || !adopted || !item.sourceMessageIds.includes(String(adopted.id))) continue;
        const oldInputs = repository.inputs(input.workId).inputs;
        const template = sections[field].find(text => text.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => String(oldInputs[key] ?? '（待提供）')) === item.text);
        if (template) item.text = interpolate(template);
      }
    }
    db.prepare('UPDATE instance_inputs SET payload_json=? WHERE work_id=?').run(JSON.stringify(binding), input.workId);
    db.prepare('UPDATE work_records SET state_json=? WHERE work_instance_id=?').run(JSON.stringify(state), input.workId);
    db.prepare('UPDATE work_instances SET updated_at=? WHERE id=?').run(at, input.workId);
    db.prepare('UPDATE work_package_receipts SET read_at=NULL WHERE binding_id IN (SELECT id FROM capture_bindings_v2 WHERE work_instance_id=?)').run(input.workId);
    return { changed: true };
  });
}
