import type { WorkPackage } from '../definitions/work-package.js';
import type { Material } from '../definitions/storage.js';

export type LocalStatus = 'STARTING' | 'RUNNING' | 'WAITING_APPROVAL' | 'TURN_ENDED' | 'FAILED' | 'INTERRUPTED' | 'UNKNOWN';
export type LocalDefaults = { directory: string; files: string[]; origin: 'REMEMBERED' | 'SOURCE' | 'DEFAULT'; sourceWorkIds?: string[] };
export type LocalManifest = {
  id: string; workId: string; episodeId: string; deliveryId: string; createdAt: string;
  project: { id: string; directory: string; resolution?: LocalDefaults['origin']; sourceWorkIds?: string[] }; executorId: 'codex';
  host: { name: string; platform: string; arch: string };
  worketBuild: Record<string, unknown>;
  projectVersion: Record<string, unknown>;
  permissionRequest: { sandbox: 'workspace-write'; approvalPolicy: 'on-request' };
  workPackage: WorkPackage; projectMaterials: Material[]; prompt: string;
};
export type LocalObservation = { at: string; kind: string; data: Record<string, unknown> };
export type LocalApproval = { id: string; method: string; title: string; detail: string };
export type LocalExecutionRecord = {
  manifest: LocalManifest; manifestHash: string; status: LocalStatus;
  threadId?: string; turnId?: string; model?: string; runtime?: string;
  sessionPolicy?: unknown; error?: string; lastMessage?: string;
  approvals: LocalApproval[]; events: LocalObservation[];
};
export type LocalRunnerEvent =
  | { type: 'thread'; threadId: string; model?: string; runtime?: string; sessionPolicy?: unknown }
  | { type: 'turn'; turnId: string; status: LocalStatus; error?: string }
  | { type: 'approval'; approval: LocalApproval }
  | { type: 'observation'; kind: string; data: Record<string, unknown> }
  | { type: 'disconnected'; error: string };
export type LocalStartRequest = { prompt: string; cwd: string; onEvent: (event: LocalRunnerEvent) => void };
export interface LocalRunner {
  start(input: LocalStartRequest): Promise<void>;
  continue(threadId: string, input: LocalStartRequest): Promise<void>;
  inspect(threadId: string, onEvent: LocalStartRequest['onEvent']): Promise<void>;
  approve(threadId: string, requestId: string, accept: boolean): void;
  interrupt(threadId: string, turnId: string): Promise<void>;
  close(): void;
}
