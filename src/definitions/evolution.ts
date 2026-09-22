import { ensure, type DefinitionContent, type ExtractionResult, type Issue, type SourceRef } from '../contracts/definition.js';
import { contentItems, evolutionSections, type EvolutionBaseline, type EvolutionChange } from '../contracts/evolution.js';
import { ruleSections } from '../contracts/rules.js';
import type { Definition } from './repository.js';

export type EvolutionReview = {
  baseHash: string;
  changes: { kind: EvolutionChange['kind']; address: string; target?: string; previousText?: string }[];
  evidence: { target: string; baselineText: string; refs: SourceRef[] }[];
  ignored: { reason: 'INSTANCE' | 'RETIRED'; refs: SourceRef[] }[];
  sourceEvents: { workId: string; eventId: string; hash: string }[];
};

/** Only effective contract text/specs go to the model; no local paths, identities or old excerpts. */
export function evolutionBaseline(base: Definition, effective: DefinitionContent): EvolutionBaseline {
  const project = (item: DefinitionContent['purpose']) => {
    const result: Record<string, unknown> = {};
    for (const key of ['key', 'text', 'valueType', 'required', 'choices', 'defaultValue', 'obligation'])
      if (key in item) result[key] = structuredClone((item as unknown as Record<string, unknown>)[key]);
    result.basis = { type: 'INFERRED', refs: [], rationale: '用户已确认的基准约定，不是本次新证据' };
    if (item.rule) result.rule = { scope: item.rule.scope, status: item.rule.status, ...(item.rule.condition ? { condition: item.rule.condition } : {}) };
    return result;
  };
  const content = Object.fromEntries([['schemaVersion', 1], ['name', effective.name],
    ...evolutionSections.map(section => [section, section === 'purpose' ? project(effective.purpose) : effective[section].map(project)]),
  ]) as DefinitionContent;
  return { contentHash: base.contentHash, content };
}

/** Merge an explicit delta, never rebuild a confirmed contract from model omissions. */
export function mergeEvolution(base: Definition, result: ExtractionResult) {
  ensure(result.evolution?.baseHash === base.contentHash, 'BASE_DEFINITION_CHANGED');
  const content = structuredClone(base.content), issues: Issue[] = [];
  const review: EvolutionReview = { baseHash: base.contentHash, changes: [], evidence: [], ignored: [], sourceEvents: [] };
  const addresses = new Map<string, string>();
  for (const change of result.evolution.changes) {
    const item = structuredClone(change.item), incoming = `${change.section}.${item.key}`;
    const refs = item.basis.type === 'USER_AUTHORED' ? [] : item.basis.refs;
    if (item.rule?.scope === 'INSTANCE' || item.rule?.status === 'RETIRED') {
      ensure(change.kind === 'ADD', 'RULE_SCOPE_MISMATCH');
      review.ignored.push({ reason: item.rule.status === 'RETIRED' ? 'RETIRED' : 'INSTANCE', refs }); continue;
    }
    if (change.kind === 'DUPLICATE') {
      review.evidence.push({ target: change.target!, baselineText: contentItems(base.content).find(row => row.address === change.target)!.item.text, refs }); addresses.set(incoming, change.target!); continue;
    }
    const isRule = (ruleSections as readonly string[]).includes(change.section);
    if (isRule) {
      const originalKey = item.key;
      let suffix = 1;
      while (contentItems(content).some(row => row.address === `${change.section}.${item.key}`)) item.key = `update_${suffix++}_${originalKey}`;
      if (change.kind !== 'ADD') item.rule!.relation = { kind: change.kind, target: change.target! };
    }
    const address = `${change.section}.${item.key}`; addresses.set(incoming, address);
    if (change.section === 'purpose') content.purpose = item;
    else if (!isRule && change.kind === 'REPLACES') {
      content[change.section] = content[change.section].map(old => old.key === item.key ? item : old) as never;
    } else content[change.section].push(item as never);
    const previous = change.target ? contentItems(base.content).find(row => row.address === change.target)?.item : null;
    review.changes.push({ kind: change.kind, address, ...(change.target ? { target: change.target, ...(previous ? { previousText: previous.text } : {}) } : {}) });
    if (change.kind === 'CONFLICT' || item.rule?.scope === 'UNCERTAIN' || item.rule?.status === 'PROPOSED')
      issues.push({ id: `evolution-${address}`, type: change.kind === 'CONFLICT' ? 'CONFLICT' : 'UNCERTAIN_GENERALIZATION', field: address, message: '请确认这条变更的适用范围、采纳状态或冲突关系。', blocking: true });
  }
  for (const issue of result.issues) {
    const key = issue.field.replace(/^content\./u, '');
    const matches = [...addresses].filter(([candidate]) => candidate.split('.')[1] === key);
    const field = addresses.get(key) ?? (matches.length === 1 ? matches[0]![1] : issue.field);
    // Prefer the specific source-grounded question over our generic fallback for the
    // same decision. Other kinds of concern and nonblocking notes cannot erase it.
    const fallback = issues.findIndex(existing => existing.id === `evolution-${field}` && existing.type === issue.type && issue.blocking);
    if (fallback !== -1) issues.splice(fallback, 1);
    issues.push({ ...issue, field });
  }
  return { content, issues, evolution: review };
}
