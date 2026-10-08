/** A UI projection of an already-confirmed WorkDefinition, not a new domain object. */
export interface ContractView {
  id: string;
  title: string;
  /** Already formatted display version, e.g. v1.0. */
  version: string;
  purpose?: string;
  /** An ISO 8601 time from the confirmed definition; never generate it at render time. */
  confirmedAt: string;
  color?: string;
  categoryLabel?: string;
  sections: Array<{
    kind: 'context' | 'inputs' | 'deliverables' | 'constraints' | 'acceptance' | 'methods' | 'materials';
    label: string;
    items: string[];
  }>;
}
export interface ContractActions {
  onReuse?: (identity: {id: string; version: string}) => void;
  onDetails?: (identity: {id: string; version: string}) => void;
}
export const TAB_PRESETS: ReadonlyArray<{name: string; color: string}>;
export function normalizeColor(value: string): string;
export function tabTextColor(value: string): '#000000' | '#ffffff';
export function setTabColor(element: HTMLElement, color: string): string;
export function createWorkContract(view: ContractView, actions?: ContractActions): HTMLElement;
