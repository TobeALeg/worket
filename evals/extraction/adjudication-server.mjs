#!/usr/bin/env node
import { createServer } from "node:http";
import { existsSync, linkSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertPathInside } from "./review/schema.mjs";
import { buildAdjudicationState, buildFinalAdjudication, normalizeReviewDocument, parseReviewDraft, readTrials, validateReviewDocument } from "./adjudication/schema.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const HTML = readFileSync(new URL("./adjudication/index.html", import.meta.url), "utf8");
const JS = readFileSync(new URL("./adjudication/app.js", import.meta.url), "utf8");
const CSS = readFileSync(new URL("./adjudication/styles.css", import.meta.url), "utf8");
const MAX_REQUEST_BYTES = 10 * 1024 * 1024;

function respond(response, status, body, contentType) {
  response.writeHead(status, { "content-type": contentType, "cache-control": "no-store", "content-length": Buffer.byteLength(body) });
  response.end(body);
}
const json = (response, status, value) => respond(response, status, JSON.stringify(value), "application/json; charset=utf-8");

function readBody(request) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) { reject(new Error("REQUEST_TOO_LARGE")); request.destroy(); return; }
      chunks.push(chunk);
    });
    request.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function atomicWriteJson(path, value, { exclusive = false } = {}) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    if (exclusive) { linkSync(temporary, path); unlinkSync(temporary); }
    else renameSync(temporary, path);
  } catch (error) {
    try { if (existsSync(temporary)) unlinkSync(temporary); } catch { /* retain original */ }
    if (exclusive && error.code === "EEXIST") { const conflict = new Error("FINAL_OUTPUT_EXISTS"); conflict.code = "FINAL_OUTPUT_EXISTS"; throw conflict; }
    throw error;
  }
}

function normalizeOptions(options) {
  for (const key of ["goldPath", "runDirectory", "proposalPath", "draftPath", "outputPath"]) if (!options?.[key]) throw new Error("GOLD_RUN_PROPOSAL_DRAFT_OUTPUT_REQUIRED");
  const root = resolve(options.root ?? ROOT);
  const inside = (value, label, mustExist = false) => assertPathInside(root, isAbsolute(value) ? value : resolve(root, value), label, { mustExist });
  return {
    root,
    goldPath: inside(options.goldPath, "gold", true),
    runDirectory: inside(options.runDirectory, "run", true),
    proposalPath: inside(options.proposalPath, "proposal", true),
    draftPath: inside(options.draftPath, "draft"),
    outputPath: inside(options.outputPath, "output"),
    host: options.host ?? "127.0.0.1",
    port: options.port ?? 0,
  };
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

function load(options, overrideDraft = undefined) {
  const gold = readJson(options.goldPath);
  const proposal = readJson(options.proposalPath);
  const draft = overrideDraft === undefined ? (existsSync(options.draftPath) ? readJson(options.draftPath) : null) : overrideDraft;
  return { gold, proposal, state: buildAdjudicationState({ gold, trials: readTrials(options.runDirectory), proposal, draft: parseReviewDraft(draft) }) };
}

export function createAdjudicationServer(rawOptions) {
  const options = normalizeOptions(rawOptions);
  let loaded = load(options);
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) { respond(response, 200, HTML, "text/html; charset=utf-8"); return; }
      if (request.method === "GET" && url.pathname === "/app.js") { respond(response, 200, JS, "text/javascript; charset=utf-8"); return; }
      if (request.method === "GET" && url.pathname === "/styles.css") { respond(response, 200, CSS, "text/css; charset=utf-8"); return; }
      if (request.method === "GET" && url.pathname === "/api/state") {
        loaded = load(options);
        json(response, 200, { ...loaded.state, paths: { gold: options.goldPath, run: options.runDirectory, proposal: options.proposalPath, draft: options.draftPath, output: options.outputPath } });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/save") {
        const payload = JSON.parse(await readBody(request));
        const mode = payload?.mode === "final" ? "final" : "draft";
        const document = normalizeReviewDocument(payload?.document);
        const checked = validateReviewDocument(document, loaded.state, { final: mode === "final" });
        if (!checked.valid) { json(response, 400, { status: "INVALID", errors: checked.errors }); return; }
        if (mode === "final") {
          const final = buildFinalAdjudication({ state: loaded.state, proposal: loaded.proposal, review: document });
          try { atomicWriteJson(options.outputPath, final, { exclusive: true }); }
          catch (error) { if (error.code === "FINAL_OUTPUT_EXISTS") { json(response, 409, { status: "CONFLICT", message: error.message }); return; } throw error; }
          atomicWriteJson(options.draftPath, document);
        } else atomicWriteJson(options.draftPath, document);
        loaded = load(options, document);
        json(response, 200, { status: mode === "final" ? "FINAL_SAVED" : "DRAFT_SAVED", document: { ...loaded.state, paths: { gold: options.goldPath, run: options.runDirectory, proposal: options.proposalPath, draft: options.draftPath, output: options.outputPath } } });
        return;
      }
      json(response, 404, { status: "NOT_FOUND" });
    } catch (error) {
      json(response, error.message === "REQUEST_TOO_LARGE" ? 413 : 400, { status: "ERROR", message: error.message });
    }
  });
  return {
    server,
    options,
    async start() {
      await new Promise((resolveStart, rejectStart) => {
        server.once("error", rejectStart);
        server.listen(options.port, options.host, () => { server.off("error", rejectStart); resolveStart(); });
      });
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : options.port;
      return { host: options.host, port, url: `http://${options.host}:${port}/` };
    },
    async close() { if (server.listening) await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose())); },
  };
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`未知参数：${token}`);
    const key = token.slice(2).replaceAll("-", "_");
    values[key] = argv[index + 1];
    index += 1;
  }
  return values;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    const values = parseArgs(process.argv.slice(2));
    const instance = createAdjudicationServer({
      root: values.root ? resolve(values.root) : ROOT,
      goldPath: values.gold,
      runDirectory: values.run,
      proposalPath: values.proposal,
      draftPath: values.draft,
      outputPath: values.output,
      host: values.host ?? "127.0.0.1",
      port: values.port ? Number(values.port) : 4173,
    });
    const address = await instance.start();
    console.log(JSON.stringify({ status: "LISTENING", ...address, ...instance.options }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ status: "ERROR", message: error.message }, null, 2));
    process.exitCode = 1;
  }
}
