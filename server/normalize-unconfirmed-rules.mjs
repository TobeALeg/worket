import { ruleSections } from '../dist/contracts/rules.js';

/** An unconfirmed suggestion cannot be collapsed into an adopted reusable rule. */
export function normalizeUnconfirmedDuplicates(result) {
  if (!result.content) return;
  const rows = ruleSections.flatMap(section => Array.isArray(result.content[section])
    ? result.content[section].filter(item => item && typeof item.key === 'string')
      .map(item => ({ address: `${section}.${item.key}`, item })) : []);
  const nodes = new Map(rows.map(row => [row.address, row.item]));
  for (const { item } of rows) {
    const rule = item.rule;
    if (rule?.status !== 'PROPOSED' || !['UNCERTAIN', 'INSTANCE'].includes(rule.scope) ||
        rule.relation?.kind !== 'DUPLICATE') continue;
    const target = nodes.get(rule.relation.target)?.rule;
    if (target?.status !== 'ACTIVE' || target.scope !== 'REUSABLE') continue;
    delete rule.relation;
  }
}
