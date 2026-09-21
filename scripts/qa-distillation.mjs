import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHmac } from "node:crypto";
import { _electron as electron } from "playwright";
import { createWorkCore } from "../dist/core/index.js";
import { ImprovementStore } from "../server/improvement.mjs";
import { createAIService } from "../server/service.mjs";
import { source, result } from "../test/distillation/fixtures.ts";
const directory = mkdtempSync(join(tmpdir(), "worket-distillation-desktop-"));
const improvementQA = process.argv.includes("--improvement");
const output = join(process.cwd(), "output", improvementQA ? "improvement-desktop" : "distillation");
const improvement = improvementQA ? new ImprovementStore(join(directory, "samples.sqlite")) : null;
mkdirSync(output, { recursive: true });
const core = createWorkCore({
  databasePath: join(directory, "workpet.sqlite"),
});
const original = source(core);
core.completeWork(original.instance.id);
core.close();
let forceReferenceFailure = false;
let releaseExtraction;
const extractionGate = new Promise(resolve => { releaseExtraction = resolve; });
let calls = 0,
  wire;
const service = createAIService({
  improvement,
  mode: "development",
  devSecret: "local-ui-fixture-secret",
  issuer: "ui-test",
  audience: "worket-ai",
  providerName: "合成桌面测试供应商，不是真实模型",
  provider: {
    model: "fixture",
    async call(messages) {
      calls++;
      await extractionGate;
      const data = JSON.parse(messages[1].content);
      if (data.phase === "extract") {
        wire = {
          schemaVersion: 1,
          snapshotHash: "test",
          sources: [
            {
              key: "work-1",
              events: data.events.map((e) => ({
                key: e.key,
                sequence: e.sequence,
                kind: e.kind,
                content: e.content,
                hash: e.hash,
              })),
            },
          ],
        };
        return {
          result: {
            requirements: [],
            issues: [],
            eventKeys: data.events.map((e) => `${e.sourceKey}/${e.key}`),
          },
          usage: { total_tokens: 1 },
        };
      }
      const candidate = result(wire);
      if (forceReferenceFailure) candidate.content.purpose.basis.refs[0].eventId = "missing-event";
      candidate.content.deliverables.push({ key: 'excel', text: 'Excel 数据明细', basis: structuredClone(candidate.content.purpose.basis) });
      candidate.content.methods.push({ key: 'outline', text: '先确认大纲，再撰写全文', obligation: 'REQUIRED', basis: structuredClone(candidate.content.purpose.basis) });
      candidate.issues.push({ id: 'excel-scope', type: 'UNCERTAIN_GENERALIZATION', field: 'deliverables.excel', message: 'Excel 是否每次交付？', blocking: true });
      candidate.issues.push({ id: 'method-scope', type: 'UNCERTAIN_GENERALIZATION', field: 'methods.outline', message: '是否必须等待大纲确认？', blocking: true });
      candidate.issues.push({ id: 'ui-review', type: 'UNCERTAIN_GENERALIZATION', field: 'methods', message: '请确认固定资料的使用范围', blocking: false });
      return { result: candidate, usage: { total_tokens: 1 } };
    },
  },
});
await new Promise((resolve) => service.server.listen(0, "127.0.0.1", resolve));
const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString(
    "base64url",
  ),
  body = Buffer.from(
    JSON.stringify({
      sub: "ui-user",
      iss: "ui-test",
      aud: "worket-ai",
      exp: Date.now() / 1000 + 3600,
    }),
  ).toString("base64url");
const token = `${header}.${body}.${createHmac("sha256", "local-ui-fixture-secret").update(`${header}.${body}`).digest("base64url")}`;
const unpackaged = process.argv.includes("--unpackaged");
const executable = process.env.WORKPET_EXECUTABLE_PATH ?? join(
  process.cwd(),
  unpackaged ? "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
    : "release/Worket-darwin-arm64/Worket.app/Contents/MacOS/Worket",
);
async function launch() {
  const app = await electron.launch({
    executablePath: executable,
    args: [...(unpackaged ? ["."] : []), `--user-data-dir=${directory}`, "--dev"],
    cwd: process.cwd(),
    env: {
      ...process.env,
      WORKPET_SKIP_INTEGRATIONS: "1",
      WORKPET_DATA_DIR: directory,
      WORKPET_BRIDGE_CONFIG: join(directory, "bridge.json"),
    },
  });
  let panel;
  for (let i = 0; i < 100; i++) {
    panel = app.windows().find((p) => p.url().endsWith("/panel.html"));
    if (panel) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!panel) throw new Error("Panel did not start");
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().endsWith("/panel.html"))
      ?.show(),
  );
  panel.on("dialog", (d) => d.accept());
  return { app, panel };
}
let app, panel, workId;
try {
  ({ app, panel } = await launch());
  const errors = [];
  panel.on("pageerror", (e) => errors.push(e.message));
  await panel.evaluate(
    ({ url, token }) => window.workpet.configureWorketService({ url, token }),
    { url: `http://127.0.0.1:${service.server.address().port}`, token },
  );
  await panel.locator("#tab-completed").click();
  await panel.locator("[data-distill-work]").check();
  await panel.locator("#tab-open").click();
  await panel.locator("#tab-completed").click();
  assert.equal(await panel.locator("[data-distill-work]").isChecked(), true);
  await panel.locator("#distill-selected").click();
  await panel.locator("#consent").check();
  assert.equal(await panel.locator("#improvement-consent").isChecked(), true);
  assert.equal(await panel.locator("#improvement-consent").isVisible(), true);
  // An unchecked choice survives closing, reopening, and refreshing the material range.
  await panel.locator("#improvement-consent").uncheck();
  await panel.locator("[data-close]").click();
  await panel.locator("#distill-selected").click();
  assert.equal(await panel.locator("#improvement-consent").isChecked(), false);
  await panel.locator("#apply-range").click();
  await panel.getByRole("heading", { name: "确认沉淀范围", exact: true }).waitFor();
  assert.equal(await panel.locator("#improvement-consent").isChecked(), false);
  if (improvementQA) await panel.locator("#improvement-consent").check();
  await panel.locator("#consent").check();
  assert.equal(calls, 0);
  await panel.screenshot({ path: join(output, "01-confirm-range.png") });
  await panel.locator("#start-distillation").click();
  await panel.locator("#definition-dialog").waitFor({ state: "hidden" });
  await panel.locator('#distillation-activity[data-state="running"]').waitFor();
  const pet = app.windows().find(p => p.url().endsWith('/pet.html'));
  await pet.locator('.pet.distilling-running').waitFor();
  await panel.screenshot({ path: join(output, '01a-background-running.png') });
  await panel.locator('#close-panel').click();
  releaseExtraction();
  await pet.locator('.pet.distilling-ready').waitFor({ timeout: 20000 });
  assert.equal(await panel.locator('#definition-dialog').evaluate(el => el.open), false, 'Completion must not force open a modal');
  await pet.screenshot({ path: join(output, '01b-pet-ready.png') });
  // The pet opens the result directly, including when the panel was hidden.
  await pet.locator('#paper-action').click();
  await panel.locator('#definition-dialog.draft-review').waitFor({ timeout: 20000 });
  await panel.screenshot({ path: join(output, '02-review-draft.png') });
  assert.equal(await panel.locator('[data-text]').count(), 0, 'Read mode hides editor controls');
  const bounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/panel.html')).getBounds());
  await panel.locator('.dr-resize').focus();
  await panel.keyboard.press('ArrowRight');
  await panel.waitForFunction(width => innerWidth > width, bounds.width);
  const resized = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/panel.html')).getBounds());
  assert.equal(resized.x, bounds.x);
  assert.equal(resized.width, bounds.width + 20);
  await panel.locator('[data-review-action="optional"][data-issue="excel-scope"]').click();
  assert.equal(await panel.locator('.dr-item[data-section="inputs"]').count(), 3, 'Conditional delivery creates an input');
  await panel.locator('[data-review-action="undo"]').click();
  assert.equal(await panel.locator('.dr-item[data-section="inputs"]').count(), 2, 'Undo removes the generated input');
  await panel.locator('[data-review-action="exclude"][data-issue="excel-scope"]').click();
  await panel.locator('.dr-removed').waitFor();
  await panel.locator('[data-review-action="undo"]').click();
  await panel.locator('[data-review-action="keep"][data-issue="excel-scope"]').click();
  await panel.locator('[data-review-action="reference"][data-issue="method-scope"]').click();
  await panel.locator('#edit-all').click();
  await panel.locator('#definition-name').fill('可复用竞品报告');
  const purpose = panel.locator('.dr-item[data-section="purpose"]');
  const originalPurpose = await purpose.locator('[data-text]').inputValue();
  await purpose.locator('[data-text]').fill(originalPurpose + '，便于复核');
  await purpose.locator('[data-review-action="evidence"]').click();
  await purpose.locator('[data-review-action="load-evidence"]').click();
  await purpose.locator('.dr-evidence pre').waitFor();
  const firstInput = panel.locator('.dr-item[data-section="inputs"]').first();
  await firstInput.locator('[data-review-action="toggle-property"]').click();
  assert.match(await firstInput.locator('.dr-meta-toggle').textContent(), /选填/);
  await firstInput.locator('[data-review-action="toggle-property"]').click();
  await firstInput.locator('[data-review-action="settings"]').click();
  await firstInput.locator('[data-property="valueType"]').selectOption('CHOICE');
  await firstInput.locator('[data-property="choices"]').fill('客户丙\n客户丁');
  await firstInput.locator('[data-property="choices"]').blur();
  await firstInput.locator('[data-property="valueType"]').selectOption('TEXT');
  assert.equal(await firstInput.locator('[data-property="choices"]').count(), 0);
  await panel.locator('[data-review-action="accept"][data-issue="ui-review"]').click();
  await panel.locator('[data-review-action="add"][data-section="materialRoles"]').click();
  const material = panel.locator('.dr-item[data-section="materialRoles"]').last();
  await material.locator('[data-text]').fill('报告格式');
  const materialPath = join(directory, 'report-format.txt');
  writeFileSync(materialPath, '合成固定格式：摘要、证据、建议。');
  await app.evaluate(({ dialog }, path) => {
    globalThis.__worketQAOpenDialog = dialog.showOpenDialog;
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, materialPath);
  await material.locator('[data-review-action="material"]').click();
  await panel.getByText('report-format.txt', { exact: true }).waitFor();
  await app.evaluate(({ dialog }) => { dialog.showOpenDialog = globalThis.__worketQAOpenDialog; delete globalThis.__worketQAOpenDialog; });
  await panel.locator('#save-draft').click();
  await panel.waitForFunction(() => document.querySelector('#dr-status')?.textContent === '已暂存');
  assert.equal(await panel.locator('#definition-name').inputValue(), '可复用竞品报告');
  assert.equal(await panel.locator('[data-review-action="reopen"]').count(), 3, 'Unrelated additions preserve decisions');
  await panel.locator('[data-review-action="reopen"][data-issue="ui-review"]').click();
  await panel.locator('#save-draft').click();
  await panel.waitForFunction(() => document.querySelector('#dr-status')?.textContent === '已暂存');
  const reviewDraft = await panel.evaluate(async () => {
    const jobs = await window.workpet.distillation('jobs');
    return window.workpet.distillation('draft', { id: jobs.find(j => j.draftId).draftId });
  });
  assert.equal(reviewDraft.resolutions.length, 2, 'Revoked decisions stay revoked in storage');
  await panel.locator('[data-review-action="accept"][data-issue="ui-review"]').click();
  await panel.locator('#save-draft').click();
  await panel.waitForFunction(() => document.querySelector('#dr-status')?.textContent === '已暂存');
  assert.equal(await panel.getByText('report-format.txt', { exact: true }).count(), 1);
  await panel.screenshot({ path: join(output, '02a-review-edit.png') });
  await panel.locator('#edit-all').click();
  assert.equal(await panel.locator('[data-text]').count(), 0);
  assert.equal(await panel.locator('#definition-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true);
  await panel.screenshot({ path: join(output, '02b-review-ready.png') });
  await panel.locator('#publish-definition').click();
  await panel.locator("#use-definition").waitFor();
  await panel.screenshot({ path: join(output, "03-saved-definition.png") });
  await panel.locator("#use-definition").click();
  await panel.locator('[data-input="customer"]').fill("客户丙");
  await panel.locator('[data-input="market"]').fill("欧洲市场");
  assert.equal(await panel.locator("#improvement-consent").isChecked(), improvementQA);
  await panel.locator("#create-defined-work").click();
  await panel.locator("#definition-dialog").waitFor({ state: "hidden" });
  const dashboard = await panel.evaluate(() => window.workpet.getDashboard());
  workId = dashboard.selectedWorkId;
  assert.notEqual(workId, original.instance.id);
  assert.equal(dashboard.selectedWork.captureStatus, "stopped");
  const pkg = await panel.evaluate(
    (workId) => window.workpet.distillation("package", { workId }),
    workId,
  );
  assert.equal(pkg.json.inputs.customer, "客户丙");
  assert.equal(pkg.json.purpose, "START");
  assert.ok(!JSON.stringify(pkg).includes("客户甲"));
  assert.ok(!pkg.markdown.includes("[WORKPET:"));
  await panel.screenshot({ path: join(output, "04-new-instance.png") });
  const delivery = join(directory, "new-delivery.md");
  writeFileSync(
    delivery,
    "客户丙 / 欧洲市场：合成验收交付物，仅用于 UI 流程验证。",
  );
  await panel.evaluate(
    ({ workId, path }) =>
      window.workpet.distillation("attach", { workId, path }),
    { workId, path: delivery },
  );
  await panel.locator('#back-to-list').click();
  await app.evaluate(({ BrowserWindow }, id) => {
    BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/panel.html')).webContents.send('panel:shown', id);
  }, workId);
  await panel.locator('[data-action="complete"]').click();
  await panel.locator("[data-criterion]").selectOption("PASS");
  await panel.locator("[data-output]").check();
  await panel.screenshot({ path: join(output, "05-user-acceptance.png") });
  await panel.locator("#accept-output").click();
  await panel.locator("#definition-dialog").waitFor({ state: "hidden" });
  assert.equal(
    (await panel.evaluate(() => window.workpet.getDashboard())).selectedWork
      .status,
    "COMPLETED",
  );
  if (improvementQA) {
    await panel.evaluate(() => window.workpet.distillation("syncImprovement"));
    const samples = improvement.list();
    assert.equal(samples.length, 2);
    const events = samples.flatMap(s => improvement.get(s.id).events);
    for (const kind of ["SOURCE", "CANDIDATE", "EDIT", "PUBLISH", "REUSE", "ACCEPTANCE"]) assert.ok(events.some(e => e.kind === kind), kind);
    assert.ok(Object.values(events.find(e => e.kind === "ACCEPTANCE").data.criteriaResults).every(v => v === "PASS"));
  }
  assert.deepEqual(errors, []);
  await app.close();
  app = null;
  ({ app, panel } = await launch());
  const recovered = await panel.evaluate(
    (workId) => window.workpet.getDashboard(workId),
    workId,
  );
  assert.equal(recovered.selectedWork.status, "COMPLETED");
  assert.equal(
    (await panel.evaluate(() => window.workpet.distillation("definitions")))
      .items.length,
    1,
  );
  await panel.locator("#tab-definitions").click();
  await panel.getByRole("heading", { name: "可复用竞品报告" }).waitFor();
  await panel.screenshot({
    path: join(output, "06-restarted-definitions.png"),
  });
  if (improvementQA) {
    await panel.locator(".secondary-menu summary").click();
    await panel.locator("#service-settings").click();
    await panel.locator("#improvement-data").click();
    await panel.getByRole("heading", { name: "改进数据", exact: true }).waitFor();
    await panel.locator("#improvement-consent").uncheck();
    await panel.waitForFunction(() => !document.querySelector("#improvement-consent")?.disabled);
    assert.ok((await panel.evaluate(() => window.workpet.distillation("improvementSamples"))).every(s => s.state === "STOPPED"));
    await panel.screenshot({ path: join(output, "07-stop-collection.png") });
    const sampleId = improvement.list()[0].client_id;
    const section = panel.locator("section").filter({ has: panel.locator(`[data-delete-confirm="${sampleId}"]`) });
    await section.locator("summary").click();
    await panel.locator(`[data-delete-confirm="${sampleId}"]`).fill("删除样本");
    await panel.locator(`[data-delete-sample="${sampleId}"]`).click();
    await panel.locator("#sync-improvement").click();
    assert.equal(improvement.list().length, 1);
    await panel.screenshot({ path: join(output, "08-delete-sample.png") });
  }
  // Persist the opt-out across a full process restart, including the reuse page.
  await app.close();
  app = null;
  ({ app, panel } = await launch());
  assert.deepEqual(await panel.evaluate(() => window.workpet.distillation("improvementPreference")), { enabled: false });
  await panel.locator("#tab-definitions").click();
  await panel.locator("[data-definition]").click();
  await panel.locator("#use-definition").click();
  assert.equal(await panel.locator("#improvement-consent").isChecked(), false);
  await panel.screenshot({ path: join(output, "09-opt-out-after-restart.png") });
  await panel.locator('[data-close]').click();
  // A source file deleted from disk must still let the user open the range dialog and start.
  const existingJobs = await panel.evaluate(
    () => window.workpet.distillation('jobs').then(jobs => jobs.map(j => j.id)),
  );
  const gonePath = join(directory, 'cleaned-up.png');
  writeFileSync(gonePath, 'synthetic image bytes');
  await panel.evaluate(
    ({ workId, path }) => window.workpet.distillation('attach', { workId, path }),
    { workId, path: gonePath },
  );
  unlinkSync(gonePath);
  await panel.evaluate(workId => window.workpet.refreshWork(workId), workId);
  const goneRefs = await panel.evaluate(
    workId => window.workpet.distillation('artifacts', { workId }),
    workId,
  );
  assert.equal(goneRefs.at(-1).availability, 'MISSING');
  await app.evaluate(({ BrowserWindow }, id) => {
    BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/panel.html')).webContents.send('panel:shown', id);
  }, workId);
  await panel.locator('[data-action="distill"]').click();
  await panel.getByRole('heading', { name: '确认沉淀范围', exact: true }).waitFor();
  const goneChoice = panel.locator('[data-file-id]').last();
  assert.equal(await goneChoice.isDisabled(), true);
  await panel.getByText(/文件已不可用，仅保留文件信息/).waitFor();
  await panel.screenshot({ path: join(output, '09a-unavailable-file.png') });
  // The same range submits normally: the missing file is described, never read.
  await panel.locator('#consent').check();
  await panel.locator('#start-distillation').click();
  await panel.locator('#definition-dialog').waitFor({ state: 'hidden' });
  await panel.locator('#distillation-activity[data-state="running"]').waitFor();
  const prepared = await panel.evaluate(async workId => {
    const snapshot = await window.workpet.distillation('prepare', { workIds: [workId], includedFileIds: [] });
    return snapshot.sources.flatMap(s => s.files);
  }, workId);
  const gonePrepared = prepared.find(f => f.name === 'cleaned-up.png');
  assert.equal(gonePrepared.availability, 'MISSING');
  assert.equal(gonePrepared.content, undefined, 'a missing file never sends analyzed content');
  // Clear this extra job so the later failure scenario owns the pet and activity button.
  await panel.evaluate(async existing => {
    for (const job of await window.workpet.distillation('jobs'))
      if (!existing.includes(job.id) && job.status !== 'CANCELLED')
        await window.workpet.distillation('cancel', { jobId: job.id });
  }, existingJobs);
  forceReferenceFailure = true;
  await panel.evaluate(async workId => {
    const snapshot = await window.workpet.distillation('prepare', { workIds: [workId], includedFileIds: [] });
    await window.workpet.distillation('start', { preparationId: snapshot.id, expectedContentHash: snapshot.contentHash, consentVersion: 'worket-data-v1', commandId: crypto.randomUUID() });
  }, original.instance.id);
  await panel.locator('#distillation-activity[data-state="failed"]').waitFor({ timeout: 20000 });
  const failurePet = app.windows().find(p => p.url().endsWith('/pet.html'));
  await failurePet.locator('.pet.distilling-failed').waitFor();
  await failurePet.locator('#paper-action').click();
  await panel.locator('#definition-dialog').getByText('生成内容的引用未通过核验，未保存为候选。可以重试，原始记录仍然保留。', { exact: true }).waitFor();
  forceReferenceFailure = false;
  await panel.locator('#retry-job').click();
  await panel.locator('#definition-dialog').waitFor({ state: 'hidden' });
  await failurePet.locator('.pet.distilling-ready').waitFor({ timeout: 20000 });
  await failurePet.locator('#paper-action').click();
  await panel.locator('#definition-dialog.draft-review').waitFor();
  const metrics = await panel.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.equal(metrics.scrollWidth, metrics.width);
  const report = {
    passed: true,
    mode: improvementQA ? "synthetic-improvement-desktop-test" : "synthetic-model-desktop-test",
    realModelAcceptance: false,
    realExecutorAcceptance: false,
    calls,
    workId,
    directory,
    metrics,
    restart: true,
    screenshots: readdirSync(output).filter(name => name.endsWith(".png")).length,
    unpackaged,
    defaultEnabled: true,
    persistentOptOut: true,
  };
  writeFileSync(
    join(output, "desktop-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await app?.close();
  await service.close();
}
