import { mkdirSync } from "node:fs";
import { join } from "node:path";

function normalizedEvents(caseData) {
  return caseData.events.map((event) => ({
    externalId: event.id,
    sequence: event.sequence,
    kind: event.kind,
    content: event.content,
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, event.sequence)).toISOString(),
    executorType: event.kind === "user.prompt" ? "HUMAN" : event.kind === "agent.response" ? "AGENT" : "TOOL",
    environmentType: "EXTRACTION_EVAL",
    metadata: {},
    artifactRefs: [],
  }));
}

export function createWorkStateAdapter({ live = false } = {}) {
  return {
    id: live ? "work-state-live" : "work-state-local",
    live,
    estimatedProviderCalls: live ? 1 : 0,
    async execute({ caseData, runDirectory, trialId, timeoutSeconds }) {
      const [{ createWorkCore }, { LocalRuleExtractor }, { OpenAICompatibleExtractor }] = await Promise.all([
        import("../../../dist/core/index.js"),
        import("../../../dist/extractor/local-rule-extractor.js"),
        import("../../../dist/extractor/openai-compatible-extractor.js"),
      ]);
      const isolated = join(runDirectory, "isolated");
      mkdirSync(isolated, { recursive: true });
      const databasePath = join(isolated, `${trialId}.sqlite`);
      const core = createWorkCore({ databasePath });
      try {
        const created = core.createWork({
          definition: { key: "general-work", name: "通用工作", version: 1 },
          executor: { type: "AGENT", name: "Extraction Eval" },
          environment: { type: "EXTRACTION_EVAL", name: "Extraction Eval" },
          source: { adapter: "eval", conversationId: caseData.work_id },
        });
        const events = normalizedEvents(caseData);
        core.appendSourceEvents(created.instance.id, events);
        let extractor;
        if (live) {
          if (!process.env.WORKPET_LLM_API_KEY) throw new Error("WORKPET_LLM_API_KEY_MISSING");
          extractor = new OpenAICompatibleExtractor({
            apiKey: process.env.WORKPET_LLM_API_KEY,
            baseUrl: process.env.WORKPET_LLM_BASE_URL ?? "https://api.openai.com/v1",
            model: process.env.WORKPET_LLM_MODEL ?? "gpt-5.4-mini",
          });
        } else extractor = new LocalRuleExtractor();
        const request = { previousState: null, events };
        let timer;
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("MODEL_TIMEOUT")), timeoutSeconds * 1000);
        });
        let patch;
        try {
          patch = await Promise.race([extractor.extract(request), timeout]);
        } finally {
          clearTimeout(timer);
        }
        const persisted = core.applyExtractorPatch(created.instance.id, patch, events.at(-1)?.sequence);
        const handoff = core.createHandoffPackage(created.instance.id);
        return {
          track: "S",
          stage: "raw",
          model: live ? (process.env.WORKPET_LLM_MODEL ?? "gpt-5.4-mini") : null,
          prompt_version: live ? "openai-compatible-work-state-v1" : "local-rule-v1",
          raw_request: request,
          raw_response: patch,
          product_output: { persisted_state: persisted.state, handoff },
          usage: {
            provider_calls_observed: live ? 1 : 0,
            provider_calls_reserved: live ? 1 : 0,
            input_tokens: null,
            output_tokens: null,
            cost: null,
          },
        };
      } finally {
        core.close();
      }
    },
  };
}
