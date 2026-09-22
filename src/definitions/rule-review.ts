import type { DefinitionContent } from '../contracts/definition.js';
import { ruleItems } from '../contracts/rules.js';

/** A changed obligation invalidates downstream semantic judgements, not unrelated rows. */
export function invalidateRuleDependents(previous: DefinitionContent, content: DefinitionContent): string[] {
  const before = new Map(ruleItems(previous).map(row => [row.address, row.item]));
  const rows = ruleItems(content);
  const meaning = (item: typeof rows[number]['item']) => JSON.stringify({
    text: item.text, scope: item.rule?.scope ?? 'REUSABLE',
    condition: item.rule?.condition ?? '', relation: item.rule?.relation ?? null,
    retired: item.rule?.status === 'RETIRED',
    document: item.document ? [item.document.hash, item.document.startLine, item.document.endLine] : null,
    obligation: 'obligation' in item ? item.obligation : null,
  });
  const changed = new Set(rows.filter(row => {
    const old = before.get(row.address);
    return old && meaning(old) !== meaning(row.item);
  }).map(row => row.address));
  const affected = new Set<string>();
  // Include transitive aliases/checks; stop at a relation explicitly removed by the editor.
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const row of rows) {
      const target = row.item.rule?.relation?.target;
      if (!target || !changed.has(target) || affected.has(row.address)) continue;
      affected.add(row.address); changed.add(row.address); expanded = true;
    }
  }
  for (const row of rows) if (affected.has(row.address)) row.item.rule!.status = 'PROPOSED';
  return [...affected];
}
