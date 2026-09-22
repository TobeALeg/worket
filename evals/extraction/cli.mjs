#!/usr/bin/env node
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDefinitionServiceAdapter } from "./adapters/definition-service.mjs";
import { createMockAdapter } from "./adapters/mock.mjs";
import { createWorkStateAdapter } from "./adapters/work-state.mjs";
import { curateCases } from "./curation.mjs";
import { gradeDocument } from "./grader.mjs";
import { importCodexConversations } from "./importers/codex-conversations.mjs";
import { parseArgs, readJson, writeJson, writeJsonl } from "./lib.mjs";
import { approvalDocument, preflight } from "./policy.mjs";
import { runExperiment } from "./runner.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));

function adapterFor(id, config) {
  if (id === "mock") return createMockAdapter();
  if (id === "work-state-local") return createWorkStateAdapter();
  if (id === "work-state-live") return createWorkStateAdapter({ live: true });
  if (id === "definition-service") return createDefinitionServiceAdapter({ root, config });
  throw new Error(`未知 adapter：${id}`);
}

function load(values) {
  if (!values.config) throw new Error("缺少 --config");
  const configPath = resolve(root, values.config);
  const config = readJson(configPath);
  const sourcePath = resolve(root, config.source_manifest);
  const adapter = adapterFor(values.adapter ?? "mock", config);
  const approval = values.approval ? readJson(resolve(root, values.approval)) : null;
  return { configPath, config, sourcePath, adapter, approval };
}

async function main() {
  const { command, values } = parseArgs(process.argv.slice(2));
  if (command === "import-codex") {
    for (const key of ["sessions_root", "authorized_cwd", "authorization_ref", "output", "inventory"])
      if (!values[key]) throw new Error(`import-codex 缺少 --${key.replaceAll("_", "-")}`);
    const imported = importCodexConversations({
      sessionsRoot: resolve(values.sessions_root),
      authorizedCwd: resolve(values.authorized_cwd),
      authorizationRef: values.authorization_ref,
      taskFamily: values.task_family ?? "video-production",
    });
    const outputPath = resolve(root, values.output);
    const inventoryPath = resolve(root, values.inventory);
    writeJsonl(outputPath, imported.cases, { exclusive: true, mode: 0o600 });
    writeJson(inventoryPath, { ...imported.provenance, cases: imported.inventory }, { exclusive: true, mode: 0o600 });
    console.log(JSON.stringify({ status: "IMPORTED", cases: imported.cases.length, output: values.output, inventory: values.inventory }, null, 2));
    return;
  }
  if (command === "curate") {
    for (const key of ["source", "plan", "output"])
      if (!values[key]) throw new Error(`curate 缺少 --${key}`);
    const selected = curateCases(resolve(root, values.source), resolve(root, values.plan));
    writeJsonl(resolve(root, values.output), selected, { exclusive: true, mode: 0o600 });
    console.log(JSON.stringify({ status: "CURATED", cases: selected.length, splits: Object.groupBy(selected, (item) => item.split), output: values.output }, (_key, value) => Array.isArray(value) && value.length && value[0]?.case_id ? value.length : value, 2));
    return;
  }
  if (["preflight", "freeze", "run"].includes(command)) {
    const loaded = load(values);
    if (!existsSync(loaded.sourcePath)) throw new Error(`来源不存在：${loaded.sourcePath}`);
    if (command === "preflight") {
      console.log(JSON.stringify(preflight(loaded), null, 2));
      return;
    }
    if (command === "freeze") {
      if (!values.output) throw new Error("freeze 缺少 --output");
      const document = approvalDocument(loaded);
      writeJson(resolve(root, values.output), document, { exclusive: true, mode: 0o600 });
      console.log(JSON.stringify({ status: "FROZEN", output: values.output, fingerprint: document.fingerprint }, null, 2));
      return;
    }
    const result = await runExperiment({ root, ...loaded, retryOf: values.retry_of ?? null });
    console.log(JSON.stringify({ run_directory: result.runDirectory, report: result.report }, null, 2));
    return;
  }
  if (command === "grade") {
    for (const key of ["run", "gold", "adjudication"]) if (!values[key]) throw new Error(`grade 缺少 --${key}`);
    const runDirectory = resolve(root, values.run);
    const grade = gradeDocument(readJson(resolve(root, values.gold)), readJson(resolve(root, values.adjudication)));
    writeJson(resolve(runDirectory, "grade.json"), grade, { exclusive: true });
    console.log(JSON.stringify(grade, null, 2));
    return;
  }
  throw new Error("用法：eval:extraction <import-codex|curate|preflight|freeze|run|grade> [参数]");
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "ERROR", message: error.message, gate: error.gate ?? null }, null, 2));
  process.exitCode = 1;
});
