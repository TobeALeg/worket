import type { DefinitionSection } from "../definitions/review.js";

export const definitionLabels: Record<DefinitionSection, [string, string]> = {
  purpose: ["◎", "目的"], inputs: ["↳", "输入"], deliverables: ["↗", "交付"], constraints: ["⊙", "约束"],
  acceptanceCriteria: ["✓", "验收"], methods: ["⇢", "方法"], materialRoles: ["▤", "资料"],
};
