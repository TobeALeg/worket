import { sourceAvailabilityNotice, assertSourcePresenceReady } from "../core/source-revisions.js";
import { dirname } from 'node:path';
import { resolveRuleDocuments } from "./document-rules.js";
import { ruleText, acceptanceChecks, type InstanceOverride } from "../contracts/rules.js";
import type { WorkSnapshot, WorkState } from "../core/types.js";
import type { Definition, DefinitionRepository, Inputs } from "./repository.js";
import type { Material } from "./storage.js";
export type WorkPackage = {
  packageVersion: 1;
  purpose: "START" | "CONTINUE";
  workId: string;
  generatedAt: string;
  definition: Definition | null;
  inputs: Inputs;
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
  const skills = (definition?.materials ?? []).filter(m => m.bundle).map(m => ({
    name: definition!.content.materialRoles.find(role => role.key === m.role)!.text,
    required: definition!.content.materialRoles.find(role => role.key === m.role)!.required,
    entrypoint: m.path, directory: dirname(m.path), hash: m.hash, files: m.bundle!.files.map(file => file.path),
  }));
  const binding = repository.inputs(work.instance.id);
  const checks = definition ? acceptanceChecks(definition.content, binding.ruleOverrides ?? []).map(({ key, rule }) => ({ key, rule })) : [];
  const resolved = definition ? resolveRuleDocuments(definition.content, definition.materials, repository.materials, binding.ruleOverrides ?? []) : null;
  if (definition && resolved) { definition.content = resolved.content; definition.materials = definition.materials.filter(m => !m.role.startsWith("document:") && !m.bundle); }
  for (const spec of definition?.content.inputs ?? [])
    if (spec.valueType === "FILE" && binding.inputs[spec.key])
      repository.materials.read(String(binding.inputs[spec.key]));
  const sourceNotice = sourceAvailabilityNotice(work.sourceArchive);
  return {
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
}
const escapeMarkdown = (value: string) =>
  value.replace(/[\\`*_{}\[\]<>()#!|]/g, "\\$&");
export function packageMarkdown(value: WorkPackage): string {
  const lines = [
    `# ${escapeMarkdown(value.definition?.content.name ?? value.state.objective[0]?.text ?? "工作")}`,
    `意图：${value.purpose} · 工作 ID：${value.workId}`,
    value.fileAccess,
    ...(value.sourceNotice ? [`来源变化：${value.sourceNotice}`] : []),
  ];
  const content = value.definition?.content;
  if (content) {
    lines.push(`\n## 目的\n${escapeMarkdown(content.purpose.text)}`);
    for (const [label, items] of [
      ["交付", content.deliverables],
      ["约束", content.constraints],
      ["验收", content.acceptanceCriteria],
      ["方法", content.methods],
    ] as const)
      lines.push(
        `\n## ${label}\n${items.map((i) => `- ${escapeMarkdown(ruleText(i))}${"obligation" in i ? ` (${i.obligation})` : ""}`).join("\n")}`,
      );
  }
  if (value.ruleSources?.length) lines.push(`\n## 规范来源（版本固定）\n${value.ruleSources.map(s => `- ${escapeMarkdown(s.name)} L${s.startLine}–${s.endLine} · SHA256 ${s.hash}`).join("\n")}`);
  lines.push(
    `\n## 本次输入\n${Object.entries(value.inputs)
      .map(([k, v]) => `- ${escapeMarkdown(k)}: ${escapeMarkdown(String(v))}`)
      .join("\n")}`,
  );
  if (value.skills?.length) lines.push(`\n## 执行技能\n${value.skills.map(skill => `- ${escapeMarkdown(skill.name)}（${skill.required ? "必需" : "参考"}）\n  入口：${escapeMarkdown(skill.entrypoint)}\n  目录：${escapeMarkdown(skill.directory)} · SHA256 ${skill.hash} · ${skill.files.length} 个文件`).join("\n")}\n先读取技能入口，按该固定目录解析配套文件。这里只验证目录文件完整性；技能依赖的其他插件、工具和运行环境仍需执行者核验，缺少时应明确报告。`);
  lines.push(
    `\n## 固定资料\n${value.fixedMaterials.map((m) => `- ${escapeMarkdown(m.role)}: ${escapeMarkdown(m.path)} (SHA256 ${m.hash})`).join("\n")}`,
  );
  lines.push(
    `\n## 当前状态\n${Object.entries(value.state)
      .map(
        ([k, items]) =>
          `### ${k}\n${items.map((i) => `- ${escapeMarkdown(i.text)}`).join("\n")}`,
      )
      .join("\n")}`,
  );
  if (value.referenceExamples.length)
    lines.push(
      `\n## 用户选择的旧参考案例\n${escapeMarkdown(JSON.stringify(value.referenceExamples))}`,
    );
  return lines.join("\n");
}
