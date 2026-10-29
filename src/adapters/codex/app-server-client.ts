import { readCodexHistory } from "./history.js";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { createInterface } from "node:readline";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import { normalizeCodexThread, type CodexThreadPayload } from "./normalize.js";
import type { NormalizedThread } from "../types.js";

interface JsonRpcSuccess<T> {
  id: number;
  result: T;
}

interface JsonRpcFailure {
  id: number;
  error: { code: number; message: string; data?: unknown };
}

interface ThreadListResponse {
  data: Array<CodexThreadPayload & { turns: [] }>;
  nextCursor?: string | null;
}

export interface CodexThreadSummary {
  id: string;
  title: string | null;
  preview: string;
  cwd: string;
  updatedAt: string;
  status: unknown;
}

export function getCodexBinaryCandidates(
  homeDirectory = homedir(),
  applicationsDirectory = "/Applications",
): string[] {
  const bundles = [applicationsDirectory, join(homeDirectory, "Applications")]
    .flatMap(directory => ["ChatGPT.app", "Codex.app"].map(bundle =>
      join(directory, bundle, "Contents", "Resources")));
  return [
    ...bundles.map(bundle => join(bundle, "codex-cli", "bin", "codex")),
    ...bundles.map(bundle => join(bundle, "codex")),
    join(homeDirectory, ".codex", "plugins", ".plugin-appserver", "codex"),
    join(homeDirectory, ".codex", "plugins", ".plugin-appserver", "codex.exe"),
    ...[process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs") : "", process.env.ProgramFiles ?? ""]
      .filter(isAbsolute)
      .flatMap(directory => ["Codex", "ChatGPT"].flatMap(app => [
        join(directory, app, "resources", "codex-cli", "bin", "codex.exe"),
        join(directory, app, "resources", "codex.exe"),
      ])),
  ];
}

export const CODEX_BINARY_CANDIDATES = getCodexBinaryCandidates();

export async function findCodexBinary(candidates: string[]): Promise<string> {
  for (const candidate of candidates) {
    if (!isAbsolute(candidate)) continue;
    try {
      await access(candidate, constants.X_OK);
      if (!(await stat(candidate)).isFile()) continue;
      return candidate;
    } catch {
      // Try the next known official bundle location.
    }
  }
  throw new Error(
    "未找到 Codex App Server。请确认已安装最新版 Codex 桌面应用。",
  );
}

export class CodexAppServerClient {
  readonly #events = new Set<(method: string, params: any) => void>();
  readonly #disconnects = new Set<(error: Error) => void>();
  runtimeIdentity = "";
  requestHandler?: (id: string | number, method: string, params: any) => void;
  readonly #binaryCandidates: string[];
  #process: ChildProcessWithoutNullStreams | null = null;
  #nextRequestId = 1;
  #stateDiscovery = true;
  #serverSearch = true;
  #connecting: Promise<void> | null = null;
  #pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  constructor(binaryCandidates: string[] = CODEX_BINARY_CANDIDATES, readonly spawnProcess: typeof spawn = spawn) {
    this.#binaryCandidates = binaryCandidates;
  }

  async connect(): Promise<void> {
    if (this.#connecting) return this.#connecting;
    if (this.#process) return;
    this.#connecting = this.#connect()
      .catch((error) => {
        this.close();
        throw error;
      })
      .finally(() => {
        this.#connecting = null;
      });
    return this.#connecting;
  }
  async #connect(): Promise<void> {
    const binary = await findCodexBinary(this.#binaryCandidates);
    const child = this.spawnProcess(binary, ["app-server", "--stdio"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...(process.platform === "win32" && !process.env.HOME ? { HOME: homedir() } : {}) },
      windowsHide: true,
    });
    this.#process = child;

    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => this.#receiveLine(line));
    child.stderr.on("data", () => {
      // App Server diagnostics intentionally stay out of the JSON-RPC channel.
    });
    child.once("error", (error) => {
      for (const request of this.#pending.values()) request.reject(error);
      this.#pending.clear();
      if (this.#process === child) this.#process = null;
    });
    child.once("exit", (code, signal) => {
      const error = new Error(
        `Codex App Server 已退出（code=${String(code)}, signal=${String(signal)}）`,
      );
      for (const request of this.#pending.values()) request.reject(error);
      this.#pending.clear();
      if (this.#process === child) this.#process = null;
      for (const listener of this.#disconnects) listener(error);
    });

    const initialized = await this.#request<{ userAgent?: string }>("initialize", {
      clientInfo: { name: "workpet", title: "Worket", version: "0.1.0" },
      capabilities: {
        experimentalApi: true,
        optOutNotificationMethods: [
          "item/agentMessage/delta",
          "item/reasoning/summaryTextDelta",
          "item/commandExecution/outputDelta",
        ],
      },
    });
    this.runtimeIdentity = `${binary} · ${initialized.userAgent ?? "版本未返回"}`;
    this.#notify("initialized", {});
  }

  async listRecentThreads(limit = 20): Promise<CodexThreadSummary[]> {
    return (await this.listThreadPage(limit)).threads;
  }

  async listThreadPage(
    limit = 30,
    cursor?: string,
    searchTerm?: string,
  ): Promise<{ threads: CodexThreadSummary[]; nextCursor: string | null; notice?: string }> {
    if (searchTerm !== undefined && (typeof searchTerm !== "string" || searchTerm.length > 512))
      throw new Error("Codex 聊天搜索词无效或超过 512 字符。");
    const query = searchTerm?.trim() ?? "";
    await this.connect();
    let response: ThreadListResponse;
    for (;;) {
      try {
        // Legacy rollout scanning can omit locally indexed agent_created_thread
        // sessions. Use the official index path, without loading any history.
        response = await this.#request<ThreadListResponse>("thread/list", {
          limit,
          ...(cursor ? { cursor } : {}),
          archived: false,
          sortKey: "updated_at",
          sortDirection: "desc",
          ...(this.#stateDiscovery ? { useStateDbOnly: true } : {}),
          ...(query && this.#serverSearch ? { searchTerm: query } : {}),
        });
        break;
      } catch (error) {
        const unsupported = (field: string) => error instanceof Error &&
          "code" in error && error.code === -32602 && error.message.includes(field) &&
          /unknown|unsupported|unrecognized/iu.test(error.message);
        if (this.#stateDiscovery && unsupported("useStateDbOnly")) this.#stateDiscovery = false;
        else if (query && this.#serverSearch && unsupported("searchTerm")) this.#serverSearch = false;
        else throw error;
      }
    }
    if (!response || !Array.isArray(response.data) ||
      response.nextCursor != null && (typeof response.nextCursor !== "string" || !response.nextCursor))
      throw new Error("Codex 历史列表响应无效，未显示部分结果。");
    if (cursor && response.nextCursor === cursor)
      throw new Error("Codex 历史列表分页游标重复，请刷新列表。");
    if (response.data.some(thread => !thread || typeof thread.id !== "string" || !thread.id ||
      typeof thread.cwd !== "string" || typeof thread.updatedAt !== "number" ||
      !Number.isFinite(thread.updatedAt) || !Number.isFinite(new Date(thread.updatedAt * 1_000).getTime()) ||
      thread.name != null && typeof thread.name !== "string"))
      throw new Error("Codex 历史列表响应无效，未显示部分结果。");
    const threads = [...new Map(response.data
      .filter(thread => thread.archived !== true)
      // Also filter older servers that silently ignore unknown search fields.
      .filter(thread => !query || thread.name?.includes(query))
      .map(thread => [thread.id, thread] as const)).values()];
    const notices = [
      ...(!this.#stateDiscovery ? ["Codex 版本不支持索引发现，使用兼容历史列表；部分工具创建的聊天可能不可见。"] : []),
      ...(query && !this.#serverSearch ? ["Codex 版本不支持完整标题搜索，仅搜索已加载页面；可加载更多或升级 Codex。"] : []),
    ];
    return {
      threads: threads.map(thread => ({
        id: thread.id,
        title: thread.name?.trim() || null,
        preview: thread.preview ?? "",
        cwd: thread.cwd,
        updatedAt: new Date(thread.updatedAt * 1_000).toISOString(),
        status: thread.status,
      })),
      nextCursor: response.nextCursor ?? null,
      ...(notices.length ? { notice: notices.join("\n") } : {}),
    };
  }

  async readThread(threadId: string): Promise<NormalizedThread> {
    await this.connect();
    const thread = await readCodexHistory((method, params) => this.#request(method, params), threadId);
    return { ...normalizeCodexThread(thread), ...(thread.worketHistoryComplete === true ? { history: { complete: true as const, observedExternalIds: normalizeCodexThread(thread, true).events.map(event => event.externalId) } } : {}) };
  }

  close(): void {
    for (const request of this.#pending.values())
      request.reject(new Error("Codex connection closed"));
    this.#pending.clear();
    this.#process?.kill("SIGTERM");
    this.#process = null;
  }

  async rpc<T = any>(method: string, params: unknown): Promise<T> {
    await this.connect();
    return this.#request<T>(method, params);
  }
  onEvent(listener: (method: string, params: any) => void): () => void {
    this.#events.add(listener); return () => this.#events.delete(listener);
  }
  onDisconnect(listener: (error: Error) => void): () => void {
    this.#disconnects.add(listener); return () => this.#disconnects.delete(listener);
  }
  rejectRequest(id: string | number, message: string): void { this.#write({ id, error: { code: -32601, message } }); }
  respond(id: string | number, result: unknown): void { this.#write({ id, result }); }

  #notify(method: string, params: unknown): void {
    this.#write({ method, params });
  }

  #request<T>(method: string, params: unknown): Promise<T> {
    const id = this.#nextRequestId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Codex ${method} 超时，请重试。`));
      }, 30000);
      this.#pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value as T);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      try {
        this.#write({ id, method, params });
      } catch (error) {
        this.#pending.get(id)?.reject(error as Error);
        this.#pending.delete(id);
      }
    });
  }

  #write(message: unknown): void {
    if (!this.#process) throw new Error("Codex App Server 尚未连接");
    this.#process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #receiveLine(line: string): void {
    let message: JsonRpcSuccess<unknown> | JsonRpcFailure;
    try {
      message = JSON.parse(line) as JsonRpcSuccess<unknown> | JsonRpcFailure;
    } catch {
      return;
    }
    if ('method' in message && typeof message.method === 'string') {
      const incoming = message as unknown as { id?: string | number; method: string; params: any };
      if (incoming.id !== undefined) {
        if (this.requestHandler) this.requestHandler(incoming.id, incoming.method, incoming.params);
        else this.#write({ id: incoming.id, error: { code: -32601, message: 'Interactive requests are not supported by this connection' } });
      } else for (const listener of this.#events) listener(incoming.method, incoming.params);
      return;
    }
    if (typeof message.id !== "number") return;
    const pending = this.#pending.get(message.id);
    if (!pending) return;
    this.#pending.delete(message.id);
    if ("error" in message) {
      pending.reject(
        Object.assign(new Error(`${message.error.message} (${message.error.code})`), { code: message.error.code }),
      );
    } else {
      pending.resolve(message.result);
    }
  }
}
