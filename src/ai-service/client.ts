import { hash } from "../definitions/storage.js";
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { validateContinuationRequest, type ContinuationRequest } from '../contracts/continuation.js';
import type { ServiceConfig } from "./connection.js";
import type { SampleUpload } from "../contracts/improvement.js";
import {
  ContractError,
  ensure,
  type ExtractionRequest,
  type ExtractionResult,
} from "../contracts/definition.js";
export type RemoteJob = {
  progress?: import("../distillation/activity.js").ExtractionProgress;
  requestId: string;
  status: string;
  result?: ExtractionResult;
  error?: { code: string; message: string; retryable: boolean };
};
export interface AIClient {
  continuation?(request: ContinuationRequest, beforeSend: () => void): Promise<unknown>;
  capabilities(): Promise<unknown>;
  improvementIdentity?(): string;
  uploadSample?(input: SampleUpload, beforeSend?: () => void): Promise<unknown>;
  deleteSample?(id: string, beforeSend?: () => void): Promise<unknown>;
  submit(request: ExtractionRequest, key: string, beforeSend?: () => void): Promise<RemoteJob>;
  get(id: string, beforeSend?: () => void): Promise<RemoteJob>;
  cancel(id: string, beforeSend?: () => void): Promise<unknown>;
  ack(id: string, beforeSend?: () => void): Promise<unknown>;
}
export class WorketAIClient implements AIClient {
  constructor(
    readonly config: () => ServiceConfig,
    readonly connect?: () => Promise<void>,
  ) {}
  async request(
    path: string,
    method = "GET",
    body?: unknown,
    key?: string,
    beforeSend?: () => void,
  ): Promise<any> {
    await this.connect?.();
    beforeSend?.();
    const config = this.config();
    ensure(config.url, "MODEL_UNAVAILABLE", "请先配置 Worket 服务并登录");
    ensure(config.token, "AUTH_REQUIRED");
    const url = new URL(config.url);
    ensure(
      url.protocol === "https:" ||
        (config.development &&
          url.protocol === "http:" &&
          ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)),
      "INVALID_SERVICE_URL",
    );
    ensure(!url.username && !url.password, "INVALID_SERVICE_URL");
    try {
      const response = await fetch(`${config.url.replace(/\/$/, "")}${path}`, {
        method,
        redirect: "error",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(20_000),
      });
      const value = (await response.json()) as Record<string, unknown>;
      if (!response.ok)
        throw new ContractError(
          typeof value.code === "string" ? value.code : "MODEL_UNAVAILABLE",
          typeof value.message === "string" ? value.message : "服务暂不可用",
          !!value.retryable,
        );
      return value;
    } catch (error) {
      if (error instanceof ContractError) throw error;
      throw new ContractError(
        "MODEL_UNAVAILABLE",
        "网络不可用；已确认的本地材料仍然保留",
        true,
      );
    }
  }
  improvementIdentity() {
    const c = this.config();
    return hash([c.url.replace(/\/$/, ""), c.recoveryCode ?? c.userId ?? c.installationSecret ?? c.token]);
  }
  uploadSample(input: SampleUpload, beforeSend?: () => void) {
    return this.request("/v1/improvement-samples", "POST", input, undefined, beforeSend);
  }
  deleteSample(id: string, beforeSend?: () => void) {
    return this.request(`/v1/improvement-samples/${encodeURIComponent(id)}`, "DELETE", undefined, undefined, beforeSend);
  }
  capabilities() {
    return this.request("/v1/capabilities");
  }
  async continuation(request: ContinuationRequest, beforeSend: () => void): Promise<unknown> {
    validateContinuationRequest(request);
    const identity = this.improvementIdentity();
    const authorize = () => {
      beforeSend();
      ensure(this.improvementIdentity() === identity, 'AUTH_CHANGED', '服务身份已改变，请重新整理');
    };
    const capabilities = await this.request('/v1/capabilities', 'GET', undefined, undefined, authorize);
    ensure(capabilities.continuationSchemaVersions?.includes(1), 'SERVICE_UPGRADE_REQUIRED', '后台尚不支持工作整理，请升级后台');
    const key = randomUUID();
    let job = await this.request('/v1/continuations', 'POST', request, key, authorize);
    const path = `/v1/continuations/${encodeURIComponent(job.requestId)}`;
    const deadline = Date.now() + 600_000;
    try {
      while (job.status === 'RUNNING') {
        ensure(Date.now() < deadline, 'MODEL_TIMEOUT');
        await delay(400);
        job = await this.request(path, 'GET', undefined, undefined, authorize);
      }
      authorize();
      ensure(job.status === 'SUCCEEDED' && job.result, job.error?.code ?? 'MODEL_UNAVAILABLE');
      const result: unknown = job.result;
      await this.request(path + '/ack', 'POST', undefined, undefined, authorize);
      return result;
    } catch (error) {
      // Do not issue cleanup against a newly selected account/server.
      if (this.improvementIdentity() === identity)
        await this.request(path, 'DELETE').catch(() => {});
      throw error;
    }
  }
  submit(request: ExtractionRequest, key: string, beforeSend?: () => void): Promise<RemoteJob> {
    return this.request("/v1/definition-extractions", "POST", request, key, beforeSend);
  }
  get(id: string, beforeSend?: () => void): Promise<RemoteJob> {
    return this.request(`/v1/definition-extractions/${encodeURIComponent(id)}`, "GET", undefined, undefined, beforeSend);
  }
  cancel(id: string, beforeSend?: () => void) {
    return this.request(
      `/v1/definition-extractions/${encodeURIComponent(id)}`,
      "DELETE", undefined, undefined, beforeSend,
    );
  }
  ack(id: string, beforeSend?: () => void) {
    return this.request(
      `/v1/definition-extractions/${encodeURIComponent(id)}/ack`,
      "POST", undefined, undefined, beforeSend,
    );
  }
}
