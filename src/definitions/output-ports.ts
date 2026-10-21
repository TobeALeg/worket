import { randomUUID } from 'node:crypto';
import { ensure, object, validateContent } from '../contracts/definition.js';
import type { Definition, DefinitionRepository } from './repository.js';
import { hash } from './storage.js';
import { outputPorts } from '../workflows/types.js';
import type { ValueType } from '../workflows/types.js';

/** Explicit confirmation publishes a new immutable Contract; existing work keeps its version. */
export function confirmOutputTypes(r: DefinitionRepository, input: { definitionId: string; expectedHash: string; types: Record<string, ValueType>; commandId: string }): Definition {
  object(input.types);
  return r.command(input.commandId, { op: 'confirmOutputTypes', ...input }, input.definitionId, () => {
    const base = r.get(input.definitionId);
    ensure(base.contentHash === input.expectedHash, 'REVISION_CONFLICT');
    const active = outputPorts(base);
    ensure(Object.keys(input.types).length === active.length && active.every(p => ['TEXT', 'FILE', 'NUMBER', 'BOOLEAN', 'CHOICE'].includes(input.types[p.key]!)), 'OUTPUT_TYPE_REQUIRED', '请确认每项交付物的输出类型');
    const content = structuredClone(base.content);
    content.deliverables.filter(p => active.some(o => o.key === p.key)).forEach(p => { p.valueType = input.types[p.key]!; ensure(p.valueType !== 'CHOICE' || p.choices?.length, 'INVALID_INPUT', '选项输出须先在 Contract 中定义选项'); });
    validateContent(content);
    if (hash(content) === hash(base.content)) return base;
    base.materials.forEach(m => r.materials.verify(m));
    const definition: Definition = { ...base, id: randomUUID(), version: r.versions(base.definitionKey)[0]!.version + 1, content, contentHash: hash({ content, materials: base.materials }), confirmedAt: new Date().toISOString() };
    r.db.prepare("INSERT INTO work_definitions (id,definition_key,name,version,kind,payload_json) VALUES (?,?,?,?,'REUSABLE',?)").run(definition.id, definition.definitionKey, content.name, definition.version, JSON.stringify(definition));
    for (const m of definition.materials) r.db.prepare('INSERT INTO definition_material_refs VALUES (?,?,?)').run(definition.id, m.id, m.role);
    r.db.prepare('INSERT INTO review_events VALUES (?,?,?)').run(randomUUID(), definition.id, JSON.stringify({ type: 'OUTPUT_TYPES_CONFIRMED', baseDefinitionId: base.id, types: input.types, at: definition.confirmedAt }));
    return definition;
  });
}
