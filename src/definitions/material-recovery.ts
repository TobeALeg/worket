import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensure, string } from '../contracts/definition.js';
import type { DefinitionRepository } from './repository.js';
import type { Material, MaterialStore } from './storage.js';
export type RecoveryContext = { definitionId?: string; workId?: string };
type RecoveryTarget = { key: string; name: string; scope: string; material: Material; store: MaterialStore };
function targets(repository: DefinitionRepository, context: RecoveryContext): RecoveryTarget[] {
  ensure(!!context.workId !== !!context.definitionId, 'INVALID_INPUT');
  let definitionId = context.definitionId;
  if (context.workId) {
    string(context.workId);
    const work = repository.db.prepare('SELECT definition_id FROM work_instances WHERE id=?').get(context.workId);
    ensure(work, 'WORK_NOT_FOUND'); definitionId = String(work.definition_id);
  }
  string(definitionId);
  const definition = repository.get(definitionId);
  const result: RecoveryTarget[] = definition.materials.map(material => ({ key: `definition:${material.role}`,
    name: definition.content.materialRoles.find(role => role.key === material.role)?.text ?? basename(material.originalPath),
    scope: `约定 v${definition.version}`, material, store: repository.materials }));
  if (context.workId) {
    const binding = repository.inputs(context.workId), store = repository.instanceFiles.store(context.workId);
    for (const material of binding.inputMaterials ?? []) result.push({ key: `input:${material.role}`,
      name: definition.content.inputs.find(input => input.key === material.role)?.text ?? material.role, scope: '本次输入', material, store });
    for (const reference of binding.referenceExamples) if (reference.material) result.push({ key: `reference:${reference.id}`,
      name: reference.filename, scope: '本次参考', material: reference.material, store });
  }
  return result;
}
export function materialRecoveryStatus(repository: DefinitionRepository, context: RecoveryContext) {
  return targets(repository, context).map(({ key, name, scope, material, store }) => {
    let available = true; try { store.verify(material); } catch { available = false; }
    return { key, name, scope, hash: material.hash, kind: material.bundle ? 'SKILL' : 'FILE', available };
  });
}
export function recoverMaterial(repository: DefinitionRepository, input: RecoveryContext & { key: string; expectedHash: string; path: string }): void {
  string(input.key); string(input.expectedHash); string(input.path);
  const target = targets(repository, input).find(target => target.key === input.key);
  ensure(target && target.material.hash === input.expectedHash, 'MATERIAL_CHANGED', '资料绑定已变化，请重新打开后选择');
  target.store.restore(target.material, input.path);
  repository.db.prepare('INSERT INTO review_events VALUES (?,?,?)').run(randomUUID(), input.workId ?? input.definitionId!,
    JSON.stringify({ type: 'MATERIAL_RESTORED', key: input.key, hash: target.material.hash, at: new Date().toISOString() }));
}
