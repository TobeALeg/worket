import { validateRule, validateRuleGraph, clauseText, type RulePolicy, type DocumentClause, type DocumentRole } from "./rules.js";
import { validateEvolution, type EvolutionBaseline, type EvolutionResult } from './evolution.js';
// Versioned, runtime-validated data contract shared by desktop and service.
export type Origin = "USER_STATED" | "AGENT_PROPOSED" | "SYSTEM_INFERRED" | "DOCUMENT_STATED";
export type SourceRef = {
  snapshotId: string;
  workId: string;
  eventId: string;
  excerpt?: string;
  role?: "CONTEXT";
  deleted?: boolean;
};
export type Basis =
  | { type: "SOURCE"; origin: Origin; refs: SourceRef[] }
  | { type: "INFERRED"; refs: SourceRef[]; rationale: string }
  | { type: "USER_AUTHORED"; reviewEventId: string };
export type DefinedItem = { key: string; text: string; basis: Basis; rule?: RulePolicy; document?: DocumentClause };
export type InputSpec = DefinedItem & {
  valueType: "TEXT" | "NUMBER" | "BOOLEAN" | "CHOICE" | "FILE";
  required: boolean;
  choices?: string[];
  defaultValue?: string | number | boolean;
};
export type DefinitionContent = {
  schemaVersion: 1;
  name: string;
  purpose: DefinedItem;
  inputs: InputSpec[];
  deliverables: DefinedItem[];
  constraints: DefinedItem[];
  acceptanceCriteria: DefinedItem[];
  methods: (DefinedItem & { obligation: "REFERENCE" | "REQUIRED" })[];
  materialRoles: (DefinedItem & { required: boolean })[];
};
export type Issue = {
  id: string;
  type:
    | "MISSING_INFORMATION"
    | "CONFLICT"
    | "UNCERTAIN_GENERALIZATION"
    | "UNSUPPORTED_SOURCE";
  field: string;
  message: string;
  blocking: boolean;
};
export type Resolution = {
  issueId: string;
  action: "REWRITE" | "DELETE" | "CHOOSE" | "ACCEPT";
  explanation: string;
};
export type WireEvent = {
  document?: { name: string; role: DocumentRole };
  key: string;
  sequence: number;
  kind: string;
  content: string;
  hash: string;
};
export type ExtractionRequest = {
  schemaVersion: 1;
  ruleSchemaVersion?: 1;
  evidenceSchemaVersion?: 1;
  evolution?: EvolutionBaseline;
  snapshotHash: string;
  sources: { key: string; events: WireEvent[] }[];
};
export type ExtractionResult = {
  schemaVersion: 1;
  compatibility: "COMPATIBLE" | "CONFLICTING" | "UNRELATED";
  content: DefinitionContent | null;
  evolution?: EvolutionResult;
  issues: Issue[];
  groups: { sourceKeys: string[]; reason: string }[];
  requirements: {
    id: string;
    text: string;
    scope: "INSTANCE" | "REUSABLE" | "UNCERTAIN";
    sourceKeys: string[];
    replacedBy: string | null;
  }[];
  coverage: {
    inputEvents: number;
    processedEvents: number;
    processedChunks: number;
    eventKeys: string[];
    exclusions: { key: string; reason: string }[];
  };
  versions: { schema: number; prompt: string; model: string };
};
export const LIMITS = {
  maxSources: 5,
  maxBytes: 2 * 1024 * 1024,
  maxConcurrency: 1,
  maxGlobalConcurrency: 4,
  maxCalls: 20,
  timeoutMs: 600_000,
  resultTtlMs: 600_000,
  metadataTtlMs: 30 * 86400_000,
  chunkBytes: 24_000,
  maxMaterials: 20,
  maxMaterialBytes: 50 * 1024 * 1024,
  dailyCalls: 100,
};
export class ContractError extends Error {
  constructor(
    public code: string,
    message = code,
    public retryable = false,
  ) {
    super(`${code}: ${message}`);
  }
}
// Shared validation helpers also guard local and user-supplied data, so a structural failure
// defaults to INVALID_INPUT. Model output is reported as INVALID_MODEL_OUTPUT by validateResult.
export function ensure(
  condition: unknown,
  code = "INVALID_INPUT",
  message?: string,
): asserts condition {
  if (!condition) throw new ContractError(code, message);
}
export function object(
  value: unknown,
): asserts value is Record<string, unknown> {
  ensure(value && typeof value === "object" && !Array.isArray(value));
}
export function string(value: unknown): asserts value is string {
  ensure(
    typeof value === "string" &&
      value.trim().length > 0 &&
      value.length <= LIMITS.maxBytes,
  );
}
export function array(value: unknown): asserts value is unknown[] {
  ensure(Array.isArray(value) && value.length <= 10000);
}
export function validateContent(
  value: unknown,
  options: { model?: boolean; refs?: Set<string> } = {},
): asserts value is DefinitionContent {
  object(value);
  ensure(value.schemaVersion === 1);
  string(value.name);
  object(value.purpose);
  const collections = [
    "inputs",
    "deliverables",
    "constraints",
    "acceptanceCriteria",
    "methods",
    "materialRoles",
  ] as const;
  for (const collection of collections) array(value[collection]);
  const inputs = value.inputs as unknown[];
  const keys = new Set(
    inputs.map((v) => {
      object(v);
      return v.key;
    }),
  );
  const all = [
    value.purpose,
    ...collections.flatMap((c) => value[c] as unknown[]),
  ];
  for (const item of all) {
    object(item);
    string(item.key);
    ensure(/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(item.key));
    string(item.text);
    validateRule(item as DefinedItem);
    object(item.basis);
    for (const match of item.text.matchAll(/\{\{([^}]+)\}\}/g))
      ensure(
        keys.has(match[1]),
        "INVALID_INPUT",
        `存在未声明的输入变量：{{${match[1]}}}`,
      );
    const basis = item.basis;
    if (basis.type === "USER_AUTHORED") {
      ensure(!options.model);
      string(basis.reviewEventId);
    } else {
      ensure(basis.type === "SOURCE" || basis.type === "INFERRED");
      array(basis.refs);
      if (basis.type === "SOURCE") {
        ensure(basis.refs.length > 0);
        ensure(basis.refs.some(ref => !!ref && typeof ref === "object" && (!("role" in ref) || ref.role !== "CONTEXT")), "INVALID_SOURCE_REF", "背景引用不能代替直接依据");
        ensure(
          ["USER_STATED", "AGENT_PROPOSED", "SYSTEM_INFERRED", "DOCUMENT_STATED"].includes(
            String(basis.origin),
          ),
        );
      } else string(basis.rationale);
      for (const ref of basis.refs) {
        object(ref);
        string(ref.snapshotId);
        string(ref.workId);
        string(ref.eventId);
        if (ref.excerpt !== undefined) string(ref.excerpt);
        ensure(ref.role === undefined || ref.role === "CONTEXT", "INVALID_SOURCE_REF");
        if (options.refs)
          ensure(
            options.refs.has(`${ref.workId}/${ref.eventId}`),
            "INVALID_SOURCE_REF",
          );
      }
    }
  }
  for (const item of [value.purpose, ...(value.inputs as DefinedItem[]), ...(value.materialRoles as DefinedItem[])]) {
    const nonRule = item as DefinedItem;
    ensure(nonRule.rule === undefined && nonRule.document === undefined, "INVALID_INPUT", "范围与条款引用仅用于交付、约束、验收或方法");
  }
  validateRuleGraph(value as DefinitionContent);
  for (const c of collections) {
    const items = value[c] as DefinedItem[];
    ensure(new Set(items.map((i) => i.key)).size === items.length);
  }
  for (const input of inputs) {
    object(input);
    ensure(
      ["TEXT", "NUMBER", "BOOLEAN", "CHOICE", "FILE"].includes(
        String(input.valueType),
      ),
    );
    ensure(typeof input.required === "boolean");
    if (input.valueType === "CHOICE") {
      array(input.choices);
      ensure(input.choices.length > 0);
      input.choices.forEach(string);
    }
    if (input.defaultValue !== undefined) {
      ensure(input.valueType !== "FILE");
      ensure(
        input.valueType === "NUMBER"
          ? typeof input.defaultValue === "number" &&
              Number.isFinite(input.defaultValue)
          : input.valueType === "BOOLEAN"
            ? typeof input.defaultValue === "boolean"
            : typeof input.defaultValue === "string",
      );
      if (input.valueType === "CHOICE")
        ensure(
          (input.choices as string[]).includes(input.defaultValue as string),
        );
    }
  }
  for (const item of value.methods as Record<string, unknown>[])
    ensure(["REFERENCE", "REQUIRED"].includes(String(item.obligation)));
  for (const item of value.materialRoles as Record<string, unknown>[])
    ensure(typeof item.required === "boolean");
}
export function validateRequest(
  value: unknown,
): asserts value is ExtractionRequest {
  object(value);
  ensure(value.evidenceSchemaVersion === undefined || value.evidenceSchemaVersion === 1, "INVALID_INPUT");
  ensure(value.schemaVersion === 1);
  string(value.snapshotHash);
  if (value.ruleSchemaVersion !== undefined) ensure(value.ruleSchemaVersion === 1);
  if (value.evolution !== undefined) {
    ensure(value.ruleSchemaVersion === 1); object(value.evolution); string(value.evolution.contentHash);
    validateContent(value.evolution.content);
  }
  array(value.sources);
  ensure(
    value.sources.length > 0 && value.sources.length <= LIMITS.maxSources,
    "INPUT_TOO_LARGE",
  );
  ensure(
    new TextEncoder().encode(JSON.stringify(value)).length <= LIMITS.maxBytes,
    "INPUT_TOO_LARGE",
  );
  const keys = new Set<string>();
  for (const source of value.sources) {
    object(source);
    string(source.key);
    ensure(!keys.has(source.key));
    keys.add(source.key);
    array(source.events);
    ensure(source.events.length > 0);
    const events = new Set<string>();
    let last = -Infinity;
    for (const event of source.events) {
      object(event);
      string(event.key);
      string(event.kind);
      string(event.content);
      string(event.hash);
      if (event.document !== undefined) { object(event.document); string(event.document.name); ensure(["NORMATIVE", "REFERENCE", "INPUT"].includes(String(event.document.role))); ensure(event.kind === "file.content"); }
      ensure(
        typeof event.sequence === "number" &&
          Number.isFinite(event.sequence) &&
          event.sequence >= last,
      );
      last = event.sequence;
      ensure(!events.has(event.key));
      events.add(event.key);
    }
  }
}
export function validateResult(
  value: unknown,
  request: ExtractionRequest,
): asserts value is ExtractionResult {
  try {
    validateModelResult(value, request);
  } catch (error) {
    // Any structural violation inside model output is one failure mode for callers: unusable output.
    if (error instanceof ContractError && error.code === "INVALID_INPUT")
      throw new ContractError(
        "INVALID_MODEL_OUTPUT",
        error.message.replace(/^INVALID_INPUT:\s*/, ""),
        error.retryable,
      );
    throw error;
  }
}
function validateModelResult(
  value: unknown,
  request: ExtractionRequest,
): asserts value is ExtractionResult {
  object(value);
  ensure(value.schemaVersion === 1);
  ensure(
    ["COMPATIBLE", "CONFLICTING", "UNRELATED"].includes(
      String(value.compatibility),
    ),
  );
  const refs = new Set(
    request.sources.flatMap((s) => s.events.map((e) => `${s.key}/${e.key}`)),
  );
  object(value.coverage);
  array(value.coverage.eventKeys);
  array(value.coverage.exclusions);
  const coverage = value.coverage;
  ensure(
    coverage.inputEvents === refs.size &&
      coverage.processedEvents === refs.size &&
      typeof coverage.processedChunks === "number" &&
      coverage.processedChunks > 0 &&
      (coverage.exclusions as unknown[]).length === 0 &&
      (coverage.eventKeys as unknown[]).length === refs.size &&
      refs.size === new Set(coverage.eventKeys as string[]).size &&
      (coverage.eventKeys as string[]).every((k) => refs.has(k)),
    "INCOMPLETE_COVERAGE",
  );
  array(value.issues);
  const ids = new Set();
  for (const issue of value.issues) {
    object(issue);
    string(issue.id);
    string(issue.field);
    string(issue.message);
    ensure(typeof issue.blocking === "boolean");
    ensure(
      [
        "MISSING_INFORMATION",
        "CONFLICT",
        "UNCERTAIN_GENERALIZATION",
        "UNSUPPORTED_SOURCE",
      ].includes(String(issue.type)),
    );
    ensure(!ids.has(issue.id));
    ids.add(issue.id);
  }
  array(value.groups);
  for (const group of value.groups) {
    object(group);
    array(group.sourceKeys);
    string(group.reason);
    ensure(
      group.sourceKeys.length > 0 &&
        group.sourceKeys.every((k) => request.sources.some((s) => s.key === k)),
    );
  }
  array(value.requirements);
  for (const requirement of value.requirements) {
    object(requirement);
    string(requirement.id);
    string(requirement.text);
    ensure(
      ["INSTANCE", "REUSABLE", "UNCERTAIN"].includes(String(requirement.scope)),
    );
    array(requirement.sourceKeys);
    ensure(
      requirement.sourceKeys.length > 0 &&
        requirement.sourceKeys.every((k) => refs.has(String(k))),
    );
    ensure(
      requirement.replacedBy === null ||
        typeof requirement.replacedBy === "string",
    );
  }
  ensure(
    new Set(value.requirements.map((r) => (r as { id: string }).id)).size ===
      value.requirements.length,
  );
  for (const r of value.requirements as ExtractionResult["requirements"])
    ensure(
      r.replacedBy === null ||
        value.requirements.some(
          (q) => (q as { id: string }).id === r.replacedBy,
        ),
    );
  if (value.compatibility === "UNRELATED")
    ensure(value.content === null && value.groups.length > 0 && value.evolution === undefined);
  else if (request.evolution) { ensure(value.content === null); validateEvolution(value.evolution, request.evolution, refs); }
  else { ensure(value.evolution === undefined); validateContent(value.content, { model: true, refs }); }
  {
    for (const item of resultItems(value as ExtractionResult)) {
      if (item.document) {
        const d = item.document;
        const event = request.sources.find(s => s.key === d.source.workId)?.events.find(e => e.key === d.source.eventId);
        ensure(event?.kind === "file.content" && event.document?.role === "NORMATIVE" && event.hash === d.hash, "INVALID_SOURCE_REF", "条款引用必须指向已选择采用的规范正文版本");
        clauseText(event.content, d);
        ensure(item.basis.type !== "USER_AUTHORED" && item.basis.refs.some(r => r.workId === d.source.workId && r.eventId === d.source.eventId), "INVALID_SOURCE_REF");
      }
      if (item.basis.type === "SOURCE" && item.basis.origin === "DOCUMENT_STATED") ensure(item.document, "INVALID_SOURCE_REF");
    }
  }
  if (value.compatibility === "CONFLICTING")
    ensure(
      value.issues.some(
        (i) => (i as Issue).type === "CONFLICT" && (i as Issue).blocking,
      ),
    );
  object(value.versions);
  ensure(value.versions.schema === 1);
  string(value.versions.prompt);
  string(value.versions.model);
}
export function resultItems(value: ExtractionResult): DefinedItem[] {
  const content = value.content;
  return content ? [content.purpose, ...content.inputs, ...content.deliverables, ...content.constraints, ...content.acceptanceCriteria, ...content.methods, ...content.materialRoles] : value.evolution?.changes.map(change => change.item) ?? [];
}
