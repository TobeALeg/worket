import type { SourceEvent } from "../core/types.js";
import type { ExecutionEnvironment } from "../core/types.js";
import type { NormalizedThread } from "../adapters/types.js";
import type { ForegroundApplication } from "../adapters/foreground/context.js";

export interface ConversationSummary {
  id: string;
  title: string | null;
  preview: string;
  cwd: string;
  updatedAt: string;
  status: unknown;
}
export interface ConversationPage {
  threads: ConversationSummary[];
  nextCursor: string | null;
}
export interface ConversationSource {
  listThreadPage?(limit?: number, cursor?: string): Promise<ConversationPage>;
  listRecentThreads?(limit?: number): Promise<ConversationSummary[]>;
  readThread(id: string): Promise<NormalizedThread>;
  close(): void;
}
export type DeliveryMode = "MCP_REFERENCE" | "INLINE_PACKAGE";
export interface ConnectorCapabilities {
  deliveryMode: DeliveryMode;
  transport: "DEEP_LINK" | "CLIPBOARD" | "WEB_CLIPBOARD";
  source: "HISTORY" | "HOOK_EVENTS" | "SELECTED_CONTENT";
  mcp: boolean;
  manualSelection?: boolean;
  sendsAutomatically: boolean;
  files: "LOCAL_REFERENCES" | "MANUAL_UPLOAD";
}
export interface DeliveryRequest {
  workId: string;
  deliveryId: string;
  title: string;
  purpose: "START" | "CONTINUE";
  /** Final application-owned bootstrap. Adapters transport it without rewriting. */
  prompt: string;
  cwd?: string;
}
export interface DeliveryReceipt {
  /** Observed transport result; never evidence of sending or reading. */
  status?: "OPENED" | "DRAFT_PREPARED";
  conversationId?: string;
  guidance?: string;
}
export interface ExecutorAdapter {
  id: string;
  name: string;
  mark: string;
  bundleIds: readonly string[];
  environment: ExecutionEnvironment;
  source?: ConversationSource;
  capabilities?: ConnectorCapabilities;
  installation?: "EXPLICIT";
  normalizeHook?(payload: Record<string, unknown>): import("../connectors/selected-content.js").SelectedContent | null;
  reconcileHistory?(
    thread: NormalizedThread,
    archive: readonly SourceEvent[],
  ): NormalizedThread;
  resolveCurrent(
    application: ForegroundApplication,
  ): Promise<ConversationSummary | null>;
  install?(appPath: string): Promise<string>;
  inspect(): Promise<void>;
  deliver?(request: DeliveryRequest): Promise<DeliveryReceipt>;
}
