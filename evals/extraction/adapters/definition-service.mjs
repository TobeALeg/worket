import { randomBytes, createHash } from "node:crypto";
import { chmodSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { readJson, writeJson } from "../lib.mjs";

const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function extractionRequest(caseData) {
  const sources = [{
    key: caseData.work_id,
    events: caseData.events.map((event) => ({
      key: event.id,
      sequence: event.sequence,
      kind: event.kind,
      content: event.content,
      hash: hash(event.content ?? ""),
    })),
  }];
  return { schemaVersion: 1, snapshotHash: hash(JSON.stringify(sources)), sources };
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, { ...options, redirect: "error" });
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.code === "string" ? body.code : `HTTP_${response.status}`);
  return body;
}

async function credentials(root, config) {
  const path = resolve(root, config.definition_service.credentials_file);
  let value = existsSync(path) ? readJson(path) : {
    secret: randomBytes(32).toString("hex"),
    recoveryCode: randomBytes(32).toString("base64url"),
  };
  const needsToken = !value.token || Date.parse(value.expiresAt ?? "") <= Date.now() + 86400000;
  if (needsToken) {
    const enrolled = await jsonRequest(`${config.definition_service.url.replace(/\/$/u, "")}/v1/installations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: value.secret, recoveryCode: value.recoveryCode }),
    });
    value = { ...value, token: enrolled.token, userId: enrolled.userId, deviceId: enrolled.deviceId, expiresAt: enrolled.expiresAt };
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeJson(path, value, { mode: 0o600 });
    chmodSync(path, 0o600);
  }
  return value;
}

export function createDefinitionServiceAdapter({ root, config }) {
  return {
    id: "definition-service",
    live: true,
    estimatedProviderCalls: 2,
    async execute({ caseData, runId, trialId, timeoutSeconds }) {
      const auth = await credentials(root, config);
      const base = config.definition_service.url.replace(/\/$/u, "");
      const request = extractionRequest(caseData);
      let job = await jsonRequest(`${base}/v1/definition-extractions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth.token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `${runId}:${trialId}`,
        },
        body: JSON.stringify(request),
      });
      const deadline = Date.now() + timeoutSeconds * 1000;
      while (["RUNNING", "PREPARED", "SUBMITTED"].includes(job.status)) {
        if (Date.now() >= deadline) throw new Error("MODEL_TIMEOUT");
        await wait(1000);
        job = await jsonRequest(`${base}/v1/definition-extractions/${encodeURIComponent(job.requestId)}`, {
          headers: { Authorization: `Bearer ${auth.token}` },
        });
      }
      if (job.status !== "SUCCEEDED" || !job.result) throw new Error(job.error?.code ?? `JOB_${job.status}`);
      return {
        track: "D",
        stage: "raw",
        model: job.result.versions?.model ?? null,
        prompt_version: job.result.versions?.prompt ?? null,
        raw_request: request,
        raw_response: job.result,
        product_output: job.result,
        usage: {
          provider_calls_observed: 2,
          provider_calls_reserved: 2,
          provider_calls_basis: "该小型 case 的现有产品路径固定为一次分块提取加一次聚合；托管接口不返回服务端 usage 账本。",
          input_tokens: null,
          output_tokens: null,
          cost: null,
        },
        async afterPersist() {
          await jsonRequest(`${base}/v1/definition-extractions/${encodeURIComponent(job.requestId)}/ack`, {
            method: "POST",
            headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
          });
        },
      };
    },
  };
}
