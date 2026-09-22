import { ensure, object, string, type DefinedItem, type DefinitionContent, type SourceRef } from './definition.js';

export type DocumentRole = 'NORMATIVE' | 'REFERENCE' | 'INPUT';
export type RulePolicy = {
  scope: 'REUSABLE' | 'INSTANCE' | 'UNCERTAIN';
  status: 'ACTIVE' | 'PROPOSED' | 'RETIRED';
  condition?: string;
  relation?: { kind: 'DUPLICATE' | 'SUPPLEMENTS' | 'REPLACES' | 'CONFLICT'; target: string };
};
export type DocumentClause = {
  source: SourceRef;
  startLine: number;
  endLine: number;
  hash: string;
  name: string;
};
export const ruleSections = ['deliverables', 'constraints', 'acceptanceCriteria', 'methods'] as const;
export function ruleItems(content: DefinitionContent) {
  return ruleSections.flatMap(section => content[section].map(item => ({ address: `${section}.${item.key}`, section, item })));
}
export function validateRule(item: DefinedItem): void {
  if (item.rule !== undefined) {
    object(item.rule);
    ensure(['REUSABLE', 'INSTANCE', 'UNCERTAIN'].includes(item.rule.scope));
    ensure(['ACTIVE', 'PROPOSED', 'RETIRED'].includes(item.rule.status));
    if (item.rule.condition !== undefined) string(item.rule.condition);
    if (item.rule.relation !== undefined) {
      object(item.rule.relation);
      ensure(['DUPLICATE', 'SUPPLEMENTS', 'REPLACES', 'CONFLICT'].includes(item.rule.relation.kind));
      string(item.rule.relation.target);
    }
  }
  if (item.document !== undefined) {
    const d = item.document;
    object(d); object(d.source);
    for (const key of ['snapshotId', 'workId', 'eventId'] as const) string(d.source[key]);
    string(d.hash); string(d.name);
    ensure(/^[a-f0-9]{64}$/.test(d.hash), 'INVALID_SOURCE_REF');
    ensure(Number.isInteger(d.startLine) && Number.isInteger(d.endLine) && d.startLine > 0 && d.endLine >= d.startLine, 'INVALID_SOURCE_REF');
  }
}
export function clauseText(text: string, clause: Pick<DocumentClause, 'startLine' | 'endLine'>): string {
  const lines = text.split('\n');
  ensure(clause.endLine <= lines.length, 'INVALID_SOURCE_REF', '规范段落超出固定文件版本');
  const selected = lines.slice(clause.startLine - 1, clause.endLine).join('\n');
  ensure(selected.trim(), 'INVALID_SOURCE_REF', '规范段落为空');
  return selected;
}
export function validateRuleGraph(content: DefinitionContent): void {
  const nodes = new Map(ruleItems(content).map(row => [row.address, row.item]));
  for (const [address, item] of nodes) {
    const visited = new Set([address]);
    let current = item;
    while (current.rule?.relation) {
      const target = current.rule.relation.target;
      ensure(nodes.has(target), 'INVALID_RULE_TARGET', `规则目标不存在：${target}`);
      ensure(!visited.has(target), 'RULE_CYCLE', `规则关系循环：${address}`);
      visited.add(target); current = nodes.get(target)!;
    }
    const relation = item.rule?.relation;
    if (relation && ['DUPLICATE', 'REPLACES'].includes(relation.kind)) {
      const target = nodes.get(relation.target)!;
      ensure((item.rule?.scope ?? 'REUSABLE') === (target.rule?.scope ?? 'REUSABLE') &&
        (item.rule?.condition ?? '') === (target.rule?.condition ?? ''), 'RULE_SCOPE_MISMATCH', '重复或替代不能改变适用条件；请保留独立规则或本次例外');
    }
  }
}
export type InstanceOverride = { target: string; text: string };
export type EffectiveRules = { content: DefinitionContent; omitted: { address: string; reason: string; retained?: string }[] };
/** Resolve model-proposed relations deterministically. Semantic equivalence still needs evaluation. */
export function effectiveRules(content: DefinitionContent, overrides: InstanceOverride[] = []): EffectiveRules {
  validateRuleGraph(content);
  const output = structuredClone(content), rows = ruleItems(output);
  const active = new Map(rows.filter(({ item }) => (!item.rule || item.rule.scope === 'REUSABLE' && item.rule.status === 'ACTIVE')).map(row => [row.address, row]));
  const omitted: EffectiveRules['omitted'] = rows.filter(row => !active.has(row.address)).map(row => ({ address: row.address, reason: '仅本次、未确认或历史规则' }));
  for (const row of active.values()) ensure(row.item.rule?.relation?.kind !== 'CONFLICT', 'UNRESOLVED_RULE_CONFLICT', `尚有冲突：${row.address}`);
  const replacement = new Map<string, string>();
  for (const row of active.values()) if (row.item.rule?.relation?.kind === 'REPLACES') {
    const target = row.item.rule.relation.target;
    ensure(!replacement.has(target), 'UNRESOLVED_RULE_CONFLICT', `多条规则同时替代 ${target}`);
    replacement.set(target, row.address);
  }
  function survivor(address: string, seen = new Set<string>()): string {
    ensure(!seen.has(address), 'RULE_CYCLE'); seen.add(address);
    const replacementTarget = replacement.get(address);
    if (replacementTarget) return survivor(replacementTarget, seen);
    const row = active.get(address);
    ensure(row, 'INVALID_RULE_TARGET', `被合并的规则没有有效保留目标：${address}`);
    return row.item.rule?.relation?.kind === 'DUPLICATE' ? survivor(row.item.rule.relation.target, seen) : address;
  }
  const keep = new Set<string>();
  for (const row of active.values()) {
    const target = survivor(row.address);
    keep.add(target);
    if (target !== row.address) {
      omitted.push({ address: row.address, reason: replacement.has(row.address) ? '已替代' : '重复', retained: target });
      // A duplicate contributes evidence; replaced old requirements do not become new evidence.
      if (row.item.rule?.relation?.kind === 'DUPLICATE') {
        const winner = active.get(target)!.item;
        if (winner.basis.type !== 'USER_AUTHORED' && row.item.basis.type !== 'USER_AUTHORED')
          winner.basis.refs = [...new Map([...winner.basis.refs, ...row.item.basis.refs].map(ref => [JSON.stringify(ref), ref])).values()];
      }
    }
  }
  const applied = new Set<string>();
  for (const override of overrides) {
    object(override); string(override.target); string(override.text);
    ensure(keep.has(override.target) && !applied.has(override.target), 'INVALID_RULE_TARGET', '本次例外须指向一条当前有效规则');
    const item = active.get(override.target)!.item;
    item.text = override.text;
    // The overridden document remains audit evidence, not a second active instruction.
    delete item.document;
    applied.add(override.target);
  }
  for (const section of ruleSections) output[section] = output[section].filter(item => keep.has(`${section}.${item.key}`)) as never;
  return { content: output, omitted };
}
export function ruleText(item: DefinedItem): string {
  return item.rule?.condition ? `当 ${item.rule.condition}：${item.text}` : item.text;
}

/** Preserve acceptance coverage when its wording is deduplicated into another section. */
export function acceptanceChecks(content: DefinitionContent, overrides: InstanceOverride[] = []) {
  const resolved = effectiveRules(content, overrides);
  const rows = new Map(ruleItems(resolved.content).map(row => [row.address, row.item]));
  const omitted = new Map(resolved.omitted.map(row => [row.address, row]));
  const seen = new Set<string>();
  const checks = content.acceptanceCriteria.flatMap(original => {
    const address = `acceptanceCriteria.${original.key}`;
    const target = omitted.get(address)?.retained ?? address;
    const item = rows.get(target);
    if (!item || seen.has(target)) return [];
    seen.add(target);
    return [{ key: original.key, rule: target, text: ruleText(item) }];
  });
  // New scoped contracts need not restate their requirements in a second field.
  // Legacy definitions retain their existing explicit acceptance contract.
  return checks.length ? checks : ruleItems(resolved.content)
    .filter(({ section, item }) => ['deliverables', 'constraints'].includes(section) && item.rule)
    .map(({ address, item }) => ({ key: address, rule: address, text: ruleText(item) }));
}
