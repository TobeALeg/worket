import type { DefinitionContent, DefinedItem } from "../contracts/definition.js";

export const definitionSections = ["purpose", "inputs", "deliverables", "constraints", "acceptanceCriteria", "methods", "materialRoles"] as const;
export type DefinitionSection = typeof definitionSections[number];
export type ItemAddress = { section: DefinitionSection; key: string };
export type FieldTarget = { section: DefinitionSection; key?: string };
export function sectionItems(content: DefinitionContent, section: DefinitionSection): DefinedItem[] {
  return section === "purpose" ? [content.purpose] : content[section];
}
// Resolve against the ORIGINAL draft: array positions must not shift when a row is deleted.
// Bare keys that occur in multiple sections are ambiguous and must stay unlinked.
export function resolveReviewField(original: DefinitionContent, field: string, current?: DefinitionContent): FieldTarget | null {
  const parts = field.replace(/^content\./u, "").replace(/\[(\d+)\]/gu, ".$1").split(".");
  const section = definitionSections.find(s => s === parts[0]);
  if (section) {
    if (parts.length === 1) return section === "purpose" ? { section, key: original.purpose.key } : { section };
    const key = /^\d+$/u.test(parts[1]!) ? sectionItems(original, section)[Number(parts[1])]?.key : parts[1];
    if (key && (sectionItems(original, section).some(i => i.key === key) ||
      !/^\d+$/u.test(parts[1]!) && current && sectionItems(current, section).some(i => i.key === key))) return { section, key };
    return null;
  }
  const matches = definitionSections.flatMap(s => sectionItems(original, s).filter(i => i.key === field).map(i => ({ section: s, key: i.key })));
  return matches.length === 1 ? matches[0]! : null;
}
export function reviewFieldValue(content: DefinitionContent, original: DefinitionContent, field: string): unknown {
  const target = resolveReviewField(original, field, content);
  if (!target) return field === "name" ? content.name : undefined;
  return target.key ? sectionItems(content, target.section).find(i => i.key === target.key) : sectionItems(content, target.section);
}
export function reviewFingerprint(value: unknown): string {
  return JSON.stringify(value, (key, item: unknown) => key === "basis" ? undefined : item) ?? "undefined";
}
export function sameAddress(a: FieldTarget, b: ItemAddress): boolean {
  return a.section === b.section && (!a.key || a.key === b.key);
}
