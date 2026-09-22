#!/usr/bin/env node
import { createServer } from "node:http";
import { existsSync, linkSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertPathInside, buildReviewState, normalizeReviewDocument, parseReviewDraft, readSourceCaseJsonl, validateReviewDocument } from "./review/schema.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const REVIEW_HTML = readFileSync(new URL("./review/index.html", import.meta.url), "utf8");
const REVIEW_JS = readFileSync(new URL("./review/app.js", import.meta.url), "utf8");
const REVIEW_CSS = readFileSync(new URL("./review/styles.css", import.meta.url), "utf8");
const MAX_REQUEST_BYTES = 10 * 1024 * 1024;

function jsonResponse(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

function textResponse(response, status, body, contentType) {
  response.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

function readBody(request) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {
        reject(new Error("REQUEST_TOO_LARGE"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function atomicWriteJson(path, value, { exclusive = false } = {}) {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    if (exclusive) {
      // link() creates the final directory entry atomically and fails with EEXIST.
      // The temporary file and the destination are on the same filesystem.
      linkSync(temporary, path);
      unlinkSync(temporary);
    } else {
      renameSync(temporary, path);
    }
  } catch (error) {
    try { if (existsSync(temporary)) unlinkSync(temporary); } catch { /* preserve the original error */ }
    if (exclusive && error.code === "EEXIST") {
      const conflict = new Error("FINAL_OUTPUT_EXISTS");
      conflict.code = "FINAL_OUTPUT_EXISTS";
      throw conflict;
    }
    throw error;
  }
}

function loadDraft(path) {
  if (!existsSync(path)) return null;
  return parseReviewDraft(JSON.parse(readFileSync(path, "utf8")));
}

function normalizeOptions(options) {
  if (!options?.sourcePath || !options?.draftPath || !options?.outputPath) {
    throw new Error("SOURCE_DRAFT_OUTPUT_REQUIRED");
  }
  const root = resolve(options.root ?? ROOT);
  const fromRoot = (path) => isAbsolute(path) ? path : resolve(root, path);
  const sourcePath = assertPathInside(root, fromRoot(options.sourcePath), "source", { mustExist: true });
  const draftPath = assertPathInside(root, fromRoot(options.draftPath), "draft");
  const outputPath = assertPathInside(root, fromRoot(options.outputPath), "output");
  return {
    root,
    sourcePath,
    draftPath,
    outputPath,
    host: options.host ?? "127.0.0.1",
    port: options.port ?? 0,
  };
}

function buildState(options) {
  const sourceCases = readSourceCaseJsonl(options.sourcePath);
  return buildReviewState(sourceCases, loadDraft(options.draftPath));
}

export function createReviewServer(rawOptions) {
  const options = normalizeOptions(rawOptions);
  let state = buildState(options);
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        textResponse(response, 200, REVIEW_HTML, "text/html; charset=utf-8");
        return;
      }
      if (request.method === "GET" && url.pathname === "/app.js") {
        textResponse(response, 200, REVIEW_JS, "text/javascript; charset=utf-8");
        return;
      }
      if (request.method === "GET" && url.pathname === "/styles.css") {
        textResponse(response, 200, REVIEW_CSS, "text/css; charset=utf-8");
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/state") {
        state = buildState(options);
        jsonResponse(response, 200, {
          ...state,
          paths: {
            source: options.sourcePath,
            draft: options.draftPath,
            output: options.outputPath,
          },
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/save") {
        const payload = JSON.parse(await readBody(request));
        const mode = payload?.mode === "final" ? "final" : "draft";
        const document = normalizeReviewDocument(payload?.document);
        const sourceCases = readSourceCaseJsonl(options.sourcePath);
        const checked = validateReviewDocument(document, { final: mode === "final", sourceCases });
        if (!checked.valid) {
          jsonResponse(response, 400, { status: "INVALID", errors: checked.errors });
          return;
        }
        const path = mode === "final" ? options.outputPath : options.draftPath;
        try {
          atomicWriteJson(path, document, { exclusive: mode === "final" });
        } catch (error) {
          if (error.code === "FINAL_OUTPUT_EXISTS") {
            jsonResponse(response, 409, { status: "CONFLICT", message: error.message });
            return;
          }
          throw error;
        }
        state = buildReviewState(sourceCases, document);
        jsonResponse(response, 200, {
          status: mode === "final" ? "FINAL_SAVED" : "DRAFT_SAVED",
          path,
          document: {
            ...state,
            paths: { source: options.sourcePath, draft: options.draftPath, output: options.outputPath },
          },
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/reload") {
        state = buildState(options);
        jsonResponse(response, 200, {
          status: "RELOADED",
          document: {
            ...state,
            paths: { source: options.sourcePath, draft: options.draftPath, output: options.outputPath },
          },
        });
        return;
      }
      jsonResponse(response, 404, { status: "NOT_FOUND" });
    } catch (error) {
      const status = error.message === "REQUEST_TOO_LARGE" ? 413 : 400;
      jsonResponse(response, status, { status: "ERROR", message: error.message });
    }
  });

  return {
    server,
    options,
    async start() {
      await new Promise((resolveStart, rejectStart) => {
        const onError = (error) => { server.off("listening", onListening); rejectStart(error); };
        const onListening = () => { server.off("error", onError); resolveStart(); };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(options.port, options.host);
      });
      const address = server.address();
      return {
        host: options.host,
        port: typeof address === "object" && address ? address.port : options.port,
        url: `http://${options.host}:${typeof address === "object" && address ? address.port : options.port}/`,
      };
    },
    async close() {
      if (!server.listening) return;
      await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
    },
  };
}

function parseCli(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`未知参数：${token}`);
    const key = token.slice(2).replaceAll("-", "_");
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) values[key] = true;
    else { values[key] = next; index += 1; }
  }
  return values;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    const values = parseCli(process.argv.slice(2));
    const instance = createReviewServer({
      root: values.root ? resolve(values.root) : ROOT,
      sourcePath: values.source,
      draftPath: values.draft,
      outputPath: values.output,
      host: values.host ?? "127.0.0.1",
      port: values.port ? Number(values.port) : 4173,
    });
    const address = await instance.start();
    console.log(JSON.stringify({ status: "LISTENING", ...address, source: instance.options.sourcePath, draft: instance.options.draftPath, output: instance.options.outputPath }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ status: "ERROR", message: error.message }, null, 2));
    process.exitCode = 1;
  }
}
