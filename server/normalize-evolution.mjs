// The model sometimes repeats the SAME delta relationship in the ordinary rule schema.
// Collapse only exact duplicates. Ambiguous, conflicting or unsupported shapes stay invalid.
export function normalizeEvolutionRelations(result) {
  if (!Array.isArray(result?.evolution?.changes)) return;
  for (const change of result.evolution.changes) {
    const relation = change?.item?.rule?.relation;
    if (!relation || typeof relation !== 'object' || Array.isArray(relation)) continue;
    if (!['DUPLICATE', 'SUPPLEMENTS', 'REPLACES', 'CONFLICT'].includes(change.kind) || typeof change.target !== 'string') continue;
    if (relation.kind === change.kind && relation.target === change.target &&
        Object.keys(relation).every(key => key === 'kind' || key === 'target')) delete change.item.rule.relation;
  }
}
