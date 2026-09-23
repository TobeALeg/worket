import { ensure, object, string, LIMITS, type DefinitionContent } from '../contracts/definition.js';
import type { DefinitionRepository, Draft } from './repository.js';
import { transaction, type Material } from './storage.js';

/** Save explicit choices as immutable blobs. Existing saved choices never reread original paths. */
export function saveDraftMaterials(repository: DefinitionRepository, draft: Draft, content: DefinitionContent,
  choices: Record<string, string> | undefined, copied: Material[]): Material[] {
  object(choices ?? {});
  ensure(Object.keys(choices ?? {}).length <= LIMITS.maxMaterials, 'INPUT_TOO_LARGE');
  for (const [key, path] of Object.entries(choices ?? {})) {
    string(path);
    const role = content.materialRoles.find(role => role.key === key);
    ensure(role, 'INVALID_INPUT', '资料角色已移除，请重新选择');
    const material = role.kind === 'SKILL' ? repository.materials.copySkill(path, key) : repository.materials.copy(path, key);
    copied.push(material);
  }
  const materials = content.materialRoles.flatMap(role => {
    const material = copied.find(m => m.role === role.key) ?? draft.materials?.find(m => m.role === role.key && !!m.bundle === (role.kind === 'SKILL'));
    return material ? [material] : [];
  });
  ensure(materials.reduce((n,m) => n+m.size,0) <= LIMITS.maxMaterialBytes, 'INPUT_TOO_LARGE');
  for (const material of materials) {
    repository.materials.verify(material);
    repository.db.prepare('INSERT OR IGNORE INTO definition_materials VALUES (?,?)').run(material.id, JSON.stringify(material));
  }
  return materials;
}

/** A draft is a real blob owner until publication, cancellation or removal. */
export function collectUnusedMaterials(repository: DefinitionRepository, copied: Material[] = []): void {
  transaction(repository.db, () => {
  const used = new Set(repository.db.prepare('SELECT material_id FROM definition_material_refs').all().map(row => String(row.material_id)));
  for (const draft of repository.list<Draft>('definition_drafts')) if (!draft.invalidated && !draft.publishedId)
    for (const material of draft.materials ?? []) used.add(material.id);
  const stored = repository.db.prepare('SELECT payload_json FROM definition_materials').all().map(row => JSON.parse(String(row.payload_json)) as Material);
  for (const material of new Map([...stored, ...copied].map(m => [m.id,m])).values()) if (!used.has(material.id)) {
    repository.materials.remove(material);
    repository.db.prepare('DELETE FROM definition_materials WHERE id=?').run(material.id);
  }
  });
}
