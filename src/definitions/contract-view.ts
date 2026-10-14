import type { Definition } from './repository.js';
import type { DefinedItem } from '../contracts/definition.js';
import { effectiveRules, ruleText } from '../contracts/rules.js';

export type ContractItem = { address: string; text: string; required: boolean };
export type ContractSection = { key: string; label: string; items: ContractItem[] };

/** Reading projection only. Original addresses and execution obligations stay intact. */
export function contractSections(definition: Definition): ContractSection[] {
  const { content } = effectiveRules(definition.content);
  const items = (key: string, values: (DefinedItem & { required?: boolean })[]): ContractItem[] =>
    values.map(item => ({ address: `${key}.${item.key}`, text: ruleText(item), required: item.required === true }));
  return [
    { key: 'inputs', label: '输入', items: items('inputs', content.inputs) },
    { key: 'deliverables', label: '交付物', items: items('deliverables', content.deliverables) },
    { key: 'constraints', label: '约束', items: [
      ...items('constraints', content.constraints), ...items('acceptanceCriteria', content.acceptanceCriteria),
      ...items('methods', content.methods.filter(item => item.obligation === 'REQUIRED')),
    ] },
    { key: 'materialRoles', label: '资料', items: items('materialRoles', content.materialRoles) },
  ];
}

export type ContractFeedback = 'saved' | 'updated' | 'evidence';
export function publishedFeedback(previous: Definition | undefined, current: Definition): ContractFeedback {
  return !previous ? 'saved' : previous.id === current.id ? 'evidence' : 'updated';
}
