import { ensure, type DefinitionContent, type SourceRef } from '../contracts/definition.js';
import { clauseText, effectiveRules, ruleItems, type InstanceOverride } from '../contracts/rules.js';
import { hash, type Material, type MaterialStore } from './storage.js';
import type { Snapshot } from '../distillation/service.js';

export function pinRuleDocuments(content: DefinitionContent, inherited: Material[], refs: SourceRef[], readSnapshot: (id: string) => Snapshot, store: MaterialStore): Material[] {
  const materials = new Map<string, Material>();
  for (const { item } of ruleItems(content)) {
    const d = item.document;
    if (!d) continue;
    ensure(refs.some(r => r.snapshotId === d.source.snapshotId && r.workId === d.source.workId && r.eventId === d.source.eventId), "INVALID_SOURCE_REF");
    const role = `document:${d.hash}`;
    const old = inherited.find(m => m.role === role && m.hash === d.hash);
    if (old) { store.verify(old); clauseText(store.read(old.path).toString('utf8'), d); materials.set(role, old); continue; }
    ensure(refs.some(r => r.snapshotId === d.source.snapshotId && r.workId === d.source.workId && r.eventId === d.source.eventId && !r.deleted), 'INVALID_SOURCE_REF');
    const snapshot = readSnapshot(d.source.snapshotId);
    const source = snapshot.sources.find(s => s.workId === d.source.workId);
    const file = source?.files.find(f => f.id === d.source.eventId);
    ensure(source && !source.deleted && file?.content !== undefined && file.role === 'NORMATIVE', 'INVALID_SOURCE_REF', '未采用或未读取的文件不能成为规范');
    const bytes = Buffer.from(file.content, 'utf8');
    ensure(hash(bytes) === d.hash && file.hash === d.hash, 'SOURCE_CHANGED');
    clauseText(file.content, d);
    materials.set(role, store.freeze(bytes, role, file.path));
  }
  return [...materials.values()];
}

/** Resolve every active document before dispatch; no dependency on its mutable original path. */
export function resolveRuleDocuments(content: DefinitionContent, materials: Material[], store: MaterialStore, overrides: InstanceOverride[] = []) {
  const result = effectiveRules(content, overrides);
  const sources: { rule: string; name: string; hash: string; startLine: number; endLine: number }[] = [];
  for (const { address, item } of ruleItems(result.content)) {
    if (!item.document) continue;
    const d = item.document;
    const material = materials.find(m => m.role === `document:${d.hash}` && m.hash === d.hash);
    ensure(material, 'MATERIAL_MISSING', `缺少固定规范：${d.name}`);
    store.verify(material);
    item.text = clauseText(store.read(material.path).toString('utf8'), d);
    sources.push({ rule: address, name: d.name, hash: d.hash, startLine: d.startLine, endLine: d.endLine });
  }
  return { ...result, sources };
}
