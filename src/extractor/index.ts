import { LocalRuleExtractor } from "./local-rule-extractor.js";
import type { WorkStateExtractor } from "./types.js";
/** Single construction seam for the local work-state strategy. Capture adapters never extract. */
export function createWorkStateExtractor(): WorkStateExtractor { return new LocalRuleExtractor(); }
export type { WorkStateExtractionInput, WorkStateExtractor } from "./types.js";
