import type { WorkCore } from "../core/index.js";

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

  constructor(core: WorkCore, options: { proofToken?: string } = {}) {
    this.#core = core;
    this.#proofToken = options.proofToken ?? null;
  }

  handle(request: JsonRpcRequest): JsonRpcResponse {
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
                  "读取可直接接力的结构化 Work State；不包含完整聊天历史。",
                inputSchema: {
                  type: "object",
                  properties: { work_id: { type: "string" }, delivery_id: { type: "string", description: "确认接手时必须带启动指令中的 DELIVERY 标识；省略仅查看，不确认读取。" } },
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
          // Historical handoffs stay immutable; a current read must also recheck
          // the pinned materials and input files before recording read success.
          const handoff = this.#core.createHandoffPackage(workId);
          const acknowledged = typeof deliveryId === "string";
          const result = toolResult({
            ...handoff,
            deliveryReceipt: { acknowledged },
            executionEpisodes: work.episodes,
            captureBindings: work.bindings,
            ...(this.#proofToken ? { qaProofToken: this.#proofToken } : {}),
          });
          this.#recordToolReadSuccess(workId, name, request.id, acknowledged, typeof deliveryId === "string" ? deliveryId : undefined);
          if (acknowledged && !this.#core.recordPackageRead(workId, deliveryId)) throw new Error("DELIVERY_MISMATCH");
          return { jsonrpc: "2.0", id, result };
        }
        if (name === "get_work_archive") {
          const after =
            typeof args.after_sequence === "number" ? args.after_sequence : 0;
          return {
            jsonrpc: "2.0",
            id,
            result: toolResult({
              workInstanceId: workId,
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
