import { ruleSections } from '../dist/contracts/rules.js';

/** An unconfirmed suggestion cannot be collapsed into an adopted reusable rule. */
export function normalizeUnconfirmedDuplicates(result) {
  if (!result.content || !Array.isArray(result.issues)) return;
  const rows = ruleSections.flatMap(section => Array.isArray(result.content[section])
    ? result.content[section].filter(item => item && typeof item.key === 'string')
      .map(item => ({ address: `${section}.${item.key}`, item })) : []);
  const nodes = new Map(rows.map(row => [row.address, row.item]));
  for (const { address, item } of rows) {
    const rule = item.rule;
    if (rule?.status !== 'PROPOSED' || !['UNCERTAIN', 'INSTANCE'].includes(rule.scope) ||
        rule.relation?.kind !== 'DUPLICATE') continue;
    const target = nodes.get(rule.relation.target)?.rule;
    if (target?.status !== 'ACTIVE' || target.scope !== 'REUSABLE') continue;
    delete rule.relation;
    let id = `unconfirmed-duplicate-${result.issues.length + 1}`;
    while (result.issues.some(issue => issue.id === id)) id += '-review';
    result.issues.push({ id, type: 'UNCERTAIN_GENERALIZATION', field: address,
      message: '这条未确认候选与正式规则的适用范围不同，已分别保留，请确认是否采纳。', blocking: true });
  }
}
