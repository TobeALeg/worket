import { continuationBasisMatches, type ContinuationSnapshot } from '../handoff/continuation.js';
import { continuationWorkState } from '../handoff/work-state.js';
import { packageMaterialVersions } from '../handoff/material-versions.js';
import {skillEnvironment} from './skill-environment.js';
import { sourceAvailabilityNotice, assertSourcePresenceReady } from "../core/source-revisions.js";
import { dirname } from 'node:path';
import { resolveRuleDocuments } from "./document-rules.js";
import { ruleText, acceptanceChecks, type InstanceOverride } from "../contracts/rules.js";
import type { WorkSnapshot, WorkState } from "../core/types.js";
import type { Definition, DefinitionRepository, Inputs } from "./repository.js";
import type { Material } from "./storage.js";
export type WorkPackage = {
  packageVersion: 1;
  continuation?: ContinuationSnapshot;
  stateStatus?: "RESOLVED" | "PARTIAL" | "UNRESOLVED" | "STALE";
  purpose: "START" | "CONTINUE";
  workId: string;
  generatedAt: string;
  definition: Definition | null;
  inputs: Inputs;
  inputMaterials?: Material[];
  ruleOverrides?: InstanceOverride[];
  acceptanceChecks?: { key: string; rule: string }[];
  ruleSources?: { rule: string; name: string; hash: string; startLine: number; endLine: number }[];
  fixedMaterials: Material[];
  skills: { name: string; required: boolean; entrypoint: string; directory: string; hash: string; files: string[] }[];
  referenceExamples: unknown[];
  state: WorkState;
  nextStep: string | null;
  acceptanceRequired: boolean;
  fileAccess: string;
  sourceNotice?: string;
};
export function buildWorkPackage(
  work: WorkSnapshot,
  repository: DefinitionRepository,
  prepared?: ContinuationSnapshot,
): WorkPackage {
  assertSourcePresenceReady(work.sourceArchive);
  const definition =
    work.definition.kind === "REUSABLE"
      ? repository.get(work.definition.id)
      : null;
  if (definition) {
    const strip = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(strip);
      else if (value && typeof value === "object") {
        delete (value as Record<string, unknown>).excerpt;
        Object.values(value).forEach(strip);
      }
    };
    strip(definition);
  }
  if (definition)
    definition.materials.forEach((m) => repository.materials.verify(m));
  const skillPaths = definition ? skillEnvironment(repository.materials.directory, definition.id, definition.materials) : new Map<string,string>();
  const skills = (definition?.materials ?? []).filter(m => m.bundle).map(m => ({
    name: definition!.content.materialRoles.find(role => role.key === m.role)!.text,
    required: definition!.content.materialRoles.find(role => role.key === m.role)!.required,
    entrypoint: skillPaths.get(m.role)!, directory: dirname(skillPaths.get(m.role)!), hash: m.hash, files: m.bundle!.files.map(file => file.path),
  }));
  const binding = repository.inputs(work.instance.id);
  const checks = definition ? acceptanceChecks(definition.content, binding.ruleOverrides ?? []).map(({ key, rule }) => ({ key, rule })) : [];
  const resolved = definition ? resolveRuleDocuments(definition.content, definition.materials, repository.materials, binding.ruleOverrides ?? []) : null;
  if (definition && resolved) { definition.content = resolved.content; definition.materials = definition.materials.filter(m => !m.role.startsWith("document:") && !m.bundle); }
  if (definition) repository.instanceFiles.verify(work.instance.id, definition, binding);
  const sourceNotice = sourceAvailabilityNotice(work.sourceArchive);
  const pkg: WorkPackage = {
    packageVersion: 1,
    purpose:
      definition &&
      !work.sourceArchive.some((e) => e.environmentType !== "WORKPET_LOCAL")
        ? "START"
        : "CONTINUE",
    workId: work.instance.id,
    generatedAt: new Date().toISOString(),
    definition,
    ...binding,
    ...(resolved ? { ruleSources: resolved.sources, acceptanceChecks: checks } : {}),
    skills,
    fixedMaterials: (definition?.materials ?? []).filter(m => !m.role.startsWith("document:") && !m.bundle),
    state: Object.fromEntries(Object.entries(work.state).map(([field, items]) => [field,
      definition && ["constraints", "successCriteria"].includes(field)
        ? items.filter(i => !i.sourceMessageIds.length || !i.sourceMessageIds.every(id => work.sourceArchive.some(e => e.id === id && e.kind === "work.definition_applied"))) : items
    ])) as WorkState,
    nextStep: work.state.pendingActions[0]?.text ?? null,
    acceptanceRequired: !!definition,
    ...(sourceNotice ? { sourceNotice } : {}),
    fileAccess:
      "规范条款已按固定版本展开，下列要求是本次有效约定。本机二进制资料仍须另行传递。完成须由用户关联本次交付物并逐项验收。",
  };
  const candidate = prepared ?? work.handoffPackages.findLast(value => value.continuation)?.continuation;
  const current = candidate && continuationBasisMatches(work, packageMaterialVersions(pkg), candidate.basis);
  pkg.stateStatus = candidate ? (current ? candidate.resolution : "STALE") : "UNRESOLVED";
  if (current) {
    pkg.continuation = candidate;
    if (candidate.resolution === "RESOLVED") {
      pkg.state = continuationWorkState(work, candidate);
      pkg.nextStep = pkg.state.pendingActions[0]?.text ?? null;
      if (definition) pkg.fileAccess += " 定义是固定的复用基准；接续快照中有明确来源和适用范围的本次例外仅对本次优先，不改变定义或下次默认要求。范围不明的冲突须核对原话。";
    }
  }
  return pkg;
}
// The stored package keeps provenance; execution surfaces share this projection.
export { executionBrief as packageMarkdown } from '../handoff/execution-brief.js';
