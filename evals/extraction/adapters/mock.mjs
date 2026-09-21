export function createMockAdapter(options = {}) {
  return {
    id: "mock",
    live: false,
    estimatedProviderCalls: 0,
    async execute({ caseData }) {
      if (options.failCaseId === caseData.case_id) throw new Error("MOCK_FAILURE");
      return {
        track: "S",
        stage: "raw",
        model: null,
        prompt_version: "mock-v1",
        raw_request: { events: caseData.events },
        raw_response: { units: [] },
        product_output: { units: [] },
        usage: { provider_calls_observed: 0, provider_calls_reserved: 0, input_tokens: 0, output_tokens: 0, cost: null },
      };
    },
  };
}
