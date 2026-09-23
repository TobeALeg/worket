/** Shared mechanical evidence rules. These validate attribution, not semantic truth. */
export function hasExactExcerpt(content: string | null | undefined, excerpt: unknown): boolean {
  return typeof excerpt === 'string' && excerpt.length > 0 && !!content?.includes(excerpt);
}
export function isUserEvidence(kind: string): boolean {
  return kind === 'user.prompt' || kind.startsWith('work.');
}
export function coversExactly(actual: unknown, expected: readonly string[]): boolean {
  return Array.isArray(actual) && actual.length === expected.length &&
    new Set(actual).size === expected.length && expected.every(id => actual.includes(id));
}
