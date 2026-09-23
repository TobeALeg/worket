import { currentSourceEvents } from "../core/source-revisions.js";
import { buildHandoffContextV2, buildHandoffContextV3, readHandoffEvidence } from "./handoff-context.js";
import type { WorkCore } from "../core/index.js";
import type { ContinuationSnapshot } from "../handoff/continuation.js";

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export type JsonRpcResponse = Record<string, unknown> | null;

function toolResult(value: unknown): Record<string, unknown> {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

export class WorkPetMcpHandler {
  readonly #core: WorkCore;
  readonly #proofToken: string | null;
  readonly #prepareContinuation: ((workId: string) => Promise<ContinuationSnapshot>) | undefined;

  constructor(core: WorkCore, options: { proofToken?: string; prepareContinuation?: (workId: string) => Promise<ContinuationSnapshot> } = {}) {
    this.#core = core;
    this.#proofToken = options.proofToken ?? null;
    this.#prepareContinuation = options.prepareContinuation;
  }

  async handle(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    if (request.id === undefined || request.id === null) return null;
    const id = request.id;
    try {
      if (request.method === "initialize") {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "workpet", version: "0.1.0" },
          },
        };
      }
      if (request.method === "tools/list") {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            tools: [
              {
                name: "get_work_context",
                description:
                  "读取可直接接力的上下文。context_version=2 返回精简旧版主包；context_version=3 返回有来源与版本校验的阶段接续快照；省略时兼容旧版结构。",
                inputSchema: {
                  type: "object",
                  properties: { work_id: { type: "string" }, delivery_id: { type: "string", description: "确认接手时必须带启动指令中的 DELIVERY 标识；省略仅查看，不确认读取。" }, context_version: { type: "integer", enum: [1, 2, 3], description: "3 返回整体目标、阶段成果、当前阶段、适用约束、证据和未解析缺口。" } },
                  required: ["work_id"],
                },
              },
              {
                name: "get_work_evidence",
                description: "按事件 ID 或序号分页读取当前有效来源证据；默认每页 20 条，最多 100 条。",
                inputSchema: {
                  type: "object",
                  properties: {
                    work_id: { type: "string" },
                    event_ids: { type: "array", items: { type: "string" }, maxItems: 100 },
                    after_sequence: { type: "integer", minimum: 0 },
                    limit: { type: "integer", minimum: 1, maximum: 100 },
                  },
                  required: ["work_id"],
                },
              },
              {
                name: "get_work_archive",
                description:
                  "需要核验来源时，显式读取 Work 的可见 Source Archive。",
                inputSchema: {
                  type: "object",
                  properties: {
                    work_id: { type: "string" },
                    after_sequence: { type: "number" },
                  },
                  required: ["work_id"],
                },
              },
              {
                name: "get_artifact_refs",
                description: "读取当前工作引用的本地资料路径和校验信息。",
                inputSchema: {
                  type: "object",
                  properties: { work_id: { type: "string" } },
                  required: ["work_id"],
                },
              },
            ],
          },
        };
      }
      if (request.method === "tools/call") {
        const name = request.params?.name;
        const args = (request.params?.arguments ?? {}) as Record<
          string,
          unknown
        >;
        const workId = typeof args.work_id === "string" ? args.work_id : "";
        const work = this.#core.getWork(workId);
        if (!work) throw new Error("WORK_NOT_FOUND");
        if (name === "get_work_context") {
          const deliveryId = args.delivery_id;
          if (deliveryId !== undefined && (typeof deliveryId !== 'string' ||
              work.instance.status !== 'OPEN' || deliveryId !== work.packageDeliveryId)) throw new Error('DELIVERY_MISMATCH');
          const version = args.context_version;
          if (version !== undefined && version !== 1 && version !== 2 && version !== 3) throw new Error("UNSUPPORTED_CONTEXT_VERSION");
          // Historical handoffs stay immutable; a current read must also recheck
          // the pinned materials and input files before recording read success.
          if (version === 3 && !this.#prepareContinuation) throw new Error("CONTINUATION_PREPARER_UNAVAILABLE");
          const continuation = version === 3 ? await this.#prepareContinuation!(workId) : undefined;
          const currentWork = this.#core.getWork(workId);
          if (!currentWork) throw new Error("WORK_NOT_FOUND");
          const handoff = this.#core.createHandoffPackage(workId, continuation ? { continuation } : {});
          const acknowledged = typeof deliveryId === "string";
          const legacyContext = buildHandoffContextV2(currentWork, handoff);
          const result = toolResult(version === 3
            ? {
                ...buildHandoffContextV3(currentWork, handoff, legacyContext),
                deliveryReceipt: { acknowledged },
                ...(this.#proofToken ? { qaProofToken: this.#proofToken } : {}),
              }
            : version === 2
              ? {
                ...legacyContext,
                deliveryReceipt: { acknowledged },
                ...(this.#proofToken ? { qaProofToken: this.#proofToken } : {}),
              }
              : {
                ...handoff,
                deliveryReceipt: { acknowledged },
                executionEpisodes: currentWork.episodes,
                captureBindings: currentWork.bindings,
                ...(this.#proofToken ? { qaProofToken: this.#proofToken } : {}),
              });
          this.#recordToolReadSuccess(workId, name, request.id, acknowledged, typeof deliveryId === "string" ? deliveryId : undefined);
          if (acknowledged && !this.#core.recordPackageRead(workId, deliveryId)) throw new Error("DELIVERY_MISMATCH");
          return { jsonrpc: "2.0", id, result };
        }
        if (name === "get_work_evidence") {
          const ids = args.event_ids;
          if (ids !== undefined && (!Array.isArray(ids) || ids.length > 100 || ids.some(id => typeof id !== "string")))
            throw new Error("INVALID_EVENT_IDS");
          const afterSequence = args.after_sequence;
          const limit = args.limit;
          if (afterSequence !== undefined && (typeof afterSequence !== "number" || !Number.isInteger(afterSequence) || afterSequence < 0)) throw new Error("INVALID_AFTER_SEQUENCE");
          if (limit !== undefined && (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 100)) throw new Error("INVALID_EVIDENCE_LIMIT");
          return { jsonrpc: "2.0", id, result: toolResult(readHandoffEvidence(work, {
            ...(Array.isArray(ids) ? { eventIds: ids as string[] } : {}),
            ...(typeof afterSequence === "number" ? { afterSequence } : {}),
            ...(typeof limit === "number" ? { limit } : {}),
          })) };
        }
        if (name === "get_work_archive") {
          const after =
            typeof args.after_sequence === "number" ? args.after_sequence : 0;
          return {
            jsonrpc: "2.0",
            id,
            result: toolResult({
              workInstanceId: workId,
              currentEventIds: currentSourceEvents(work.sourceArchive).map(event => event.id),
              revisionPolicy: "events 保留观察历史；当前有效内容按 currentEventIds 顺序读取，修订的 metadata.worketSource.previousEventId 指向旧观察；source.absent 仅表示当前来源中不可见，不表示撤销已确认约定。",
              events: work.sourceArchive.filter(
                (event) => event.sequence > after,
              ),
            }),
          };
        }
        if (name === "get_artifact_refs") {
          const result = toolResult({
            workInstanceId: workId,
            artifacts: work.artifactRefs,
          });
          this.#recordToolReadSuccess(workId, name, request.id);
          return { jsonrpc: "2.0", id, result };
        }
        throw new Error("UNKNOWN_TOOL");
      }
      throw new Error("METHOD_NOT_FOUND");
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  #recordToolReadSuccess(
    workId: string,
    toolName: string,
    requestId: string | number | null,
    deliveryMatched = false,
    deliveryId?: string,
  ): void {
    const work = this.#core.getWork(workId);
    if (
      work?.instance.status !== "OPEN" ||
      !work.activeBinding ||
      !work.activeEpisode
    )
      return;
    const sequence =
      Math.max(0, ...work.sourceArchive.map((event) => event.sequence)) + 1;
    const auditId = `workpet:mcp:${work.activeBinding.id}:${toolName}:${String(requestId)}`;
    const timestamp = new Date().toISOString();
    const metadata = {
      toolName,
      access: "read",
      outcome: "success",
      deliveryMatched,
      ...(deliveryId ? { deliveryId } : {}),
      auditId,
      bindingId: work.activeBinding.id,
      conversationId: work.activeBinding.conversationId,
    };
    this.#core.appendSourceEvents(workId, [
      {
        externalId: `${auditId}:call`,
        sequence,
        kind: "tool.call",
        content: `MCP 调用 ${toolName}`,
        timestamp,
        executorType: "TOOL",
        environmentType: work.activeEpisode.environment.type,
        metadata,
        artifactRefs: [],
        episodeId: work.activeEpisode.id,
      },
      {
        externalId: `${auditId}:result`,
        sequence: sequence + 1,
        kind: "tool.result",
        content: `MCP 已成功读取 ${toolName}${deliveryMatched ? "（本次交接已确认读取）" : "（仅查看）"}`,
        timestamp,
        executorType: "TOOL",
        environmentType: work.activeEpisode.environment.type,
        metadata,
        artifactRefs: [],
        episodeId: work.activeEpisode.id,
      },
    ]);
  }
}
