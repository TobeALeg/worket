import { array, ensure, object, string, validateContent, type DefinitionContent, type DefinedItem, type InputSpec } from './definition.js';
import { ruleSections } from './rules.js';

export const evolutionSections = ['purpose', 'inputs', 'deliverables', 'constraints', 'acceptanceCriteria', 'methods', 'materialRoles'] as const;
export type EvolutionSection = typeof evolutionSections[number];
export type EvolutionBaseline = { contentHash: string; content: DefinitionContent };
export type EvolutionChange = {
  kind: 'ADD' | 'DUPLICATE' | 'REPLACES' | 'SUPPLEMENTS' | 'CONFLICT';
  section: EvolutionSection;
  item: DefinedItem & Partial<Pick<InputSpec, 'valueType' | 'required' | 'choices' | 'defaultValue'>> & { obligation?: 'REFERENCE' | 'REQUIRED' };
  target?: string;
};
export type EvolutionResult = { baseHash: string; changes: EvolutionChange[] };
export function contentItems(content: DefinitionContent) {
  return evolutionSections.flatMap(section => (section === 'purpose' ? [content.purpose] : content[section]).map(item => ({ section, address: `${section}.${item.key}`, item })));
}
export function validateEvolution(value: unknown, baseline: EvolutionBaseline, refs: Set<string>): asserts value is EvolutionResult {
  object(value); string(value.baseHash); array(value.changes);
  ensure(value.baseHash === baseline.contentHash, 'BASE_DEFINITION_CHANGED');
  const known = new Map(contentItems(baseline.content).map(row => [row.address, row]));
  const candidates = new Set<string>(), replacing = new Set<string>();
  const inputs: InputSpec[] = baseline.content.inputs.map(item => ({ ...item, basis: { type: 'INFERRED' as const, refs: [], rationale: '已确认输入角色' } }));
  for (const raw of value.changes) {
    object(raw); object(raw.item);
    if (raw.section === 'inputs' && raw.kind === 'ADD') inputs.push(raw.item as InputSpec);
  }
  for (const raw of value.changes) {
    object(raw); object(raw.item);
    ensure(evolutionSections.includes(raw.section as EvolutionSection));
    ensure(['ADD', 'DUPLICATE', 'REPLACES', 'SUPPLEMENTS', 'CONFLICT'].includes(String(raw.kind)));
    const change = raw as unknown as EvolutionChange, item = change.item;
    const address = `${change.section}.${item.key}`;
    ensure(!candidates.has(address)); candidates.add(address);
    const isRule = (ruleSections as readonly string[]).includes(change.section);
    ensure(!item.rule?.relation, 'INVALID_MODEL_OUTPUT', '增量关系由 change.kind 和 target 表达');
    if (isRule) ensure(item.rule, 'INVALID_MODEL_OUTPUT', '增量规则必须明确范围与采纳状态');
    if (item.rule?.scope === 'INSTANCE' || item.rule?.status === 'RETIRED') ensure(change.kind === 'ADD', 'RULE_SCOPE_MISMATCH', '本次例外或已撤销提议不能修改通用约定');
    // Validate new evidence and all input placeholders, without treating the baseline as new evidence.
    const probe: DefinitionContent = { schemaVersion: 1, name: '增量校验', purpose: { key: 'purpose', text: '检查变更', basis: { type: 'INFERRED', refs: [], rationale: '校验' } }, inputs, deliverables: [], constraints: [], acceptanceCriteria: [], methods: [], materialRoles: [] };
    if (change.section === 'purpose') probe.purpose = item;
    else if (change.section === 'inputs') probe.inputs = [...inputs.filter(i => i.key !== item.key), item as InputSpec];
    else probe[change.section] = [item] as never;
    validateContent(probe, { model: true, refs });
    if (change.kind === 'ADD') {
      ensure(change.target === undefined && change.section !== 'purpose');
      if (!isRule) ensure(!known.has(address), 'INVALID_MODEL_OUTPUT', '新增输入或资料角色不能覆盖已有键');
      continue;
    }
    string(change.target);
    const target = known.get(change.target);
    ensure(target, 'INVALID_RULE_TARGET');
    if (isRule) {
      ensure((ruleSections as readonly string[]).includes(target.section), 'INVALID_RULE_TARGET');
      if (['DUPLICATE', 'REPLACES'].includes(change.kind)) ensure(
        item.rule!.scope === (target.item.rule?.scope ?? 'REUSABLE') &&
        (item.rule!.condition ?? '') === (target.item.rule?.condition ?? ''), 'RULE_SCOPE_MISMATCH');
      if (change.kind === 'DUPLICATE') ensure(item.rule!.status === 'ACTIVE', 'INVALID_MODEL_OUTPUT', '未采纳建议不能作为重复采纳的证据');
      if (change.section === 'methods' && target.section === 'methods' && change.kind === 'DUPLICATE')
        ensure(item.obligation === (target.item as typeof item).obligation, 'INVALID_MODEL_OUTPUT');
    } else {
      ensure(['DUPLICATE', 'REPLACES'].includes(change.kind) && target.section === change.section && target.item.key === item.key);
      if (change.kind === 'DUPLICATE') for (const key of ['valueType', 'required', 'choices', 'defaultValue'] as const)
        ensure(JSON.stringify(item[key]) === JSON.stringify((target.item as typeof item)[key]), 'INVALID_MODEL_OUTPUT', '输入或资料角色的规格变化不能当作重复');
    }
    if (change.kind === 'REPLACES') { ensure(!replacing.has(change.target), 'UNRESOLVED_RULE_CONFLICT'); replacing.add(change.target); }
  }
}
