// Real Electron publication/reuse/MCP/execution/acceptance, using an explicit synthetic skill.
// The runner executes its own fixture script; this is not an external Agent or business delivery.
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { _electron as electron } from 'playwright';
import { createAIService } from '../server/service.mjs';
import { contractReplay } from './lib/contract-replay.mjs';
import { source } from '../test/distillation/fixtures.ts';
import { createWorkCore } from '../dist/core/index.js';
import { skillContent, skillBasis, writeSkillFixture } from './lib/skill-fixture.mjs';
const run = new Date().toISOString().replace(/[:.]/g, '-'), output = join(process.cwd(), 'output/skill-dependencies', run);
mkdirSync(output, { recursive: true });
const directory = mkdtempSync(join(tmpdir(), 'worket-skill-e2e-')), skillDirectory = join(directory, 'report-builder');
writeSkillFixture(skillDirectory);
const core = createWorkCore({ databasePath: join(directory, 'workpet.sqlite') });
const replayRoot = process.env.WORKET_SKILL_REPLAY;
let base, original, service, token, roleKey = 'builder', inputKey = 'subject';
if (replayRoot) {
  const recorded = JSON.parse(readFileSync(join(replayRoot, 'wire.json'), 'utf8'));
  original = source(core, recorded.sources[0].events[0].content);
  const replay = contractReplay(replayRoot); let calls = 0;
  const secret = randomUUID(), header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ sub: 'qa-skill', iss: 'qa', aud: 'qa', exp: Date.now()/1000+3600 })).toString('base64url');
  token = `${header}.${body}.${createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')}`;
  service = createAIService({ mode: 'development', devSecret: secret, issuer: 'qa', audience: 'qa', providerName: '技能回放', limits: { dailyCalls: 2 }, provider: { model: 'frozen-skill-trial', async call(messages) {
    assert.ok(++calls <= 2); const response = replay(messages, calls);
    writeFileSync(join(output, `request-${calls}.json`), JSON.stringify(messages, null, 2)); writeFileSync(join(output, `response-${calls}.json`), JSON.stringify(response, null, 2)); return response;
  } } });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
} else {
  const content = structuredClone(skillContent); content.materialRoles[0].required = false;
  const draft = core.definitions.saveDraft({ id: randomUUID(), revision: 1, content, originalContent: structuredClone(content), refs: [], issues: [], resolutions: [] });
  core.definitions.db.prepare('INSERT INTO review_events VALUES (?,?,?)').run(skillBasis.reviewEventId, draft.id, JSON.stringify({ type: 'QA_BASELINE', synthetic: true, content }));
  base = core.definitions.publish({ draftId: draft.id, expectedRevision: 1, materialBindings: {}, commandId: randomUUID() });
}
core.close();
const report = { run, status: 'RUNNING', packaged: !!process.env.WORKPET_EXECUTABLE_PATH, directory, actualProviderCalls: 0, humanAcceptance: false, targetAgent: false, kind: `${replayRoot ? 'frozen actual model response through local HTTP; ' : ''}synthetic skill executed by QA; real Electron UI and HTTP MCP`, checks: {} };
let app, panel;
try {
  app = await electron.launch({ executablePath: process.env.WORKPET_EXECUTABLE_PATH ?? join(process.cwd(), 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: [...(process.env.WORKPET_EXECUTABLE_PATH ? ['--use-mock-keychain'] : ['.']), `--user-data-dir=${directory}`, '--dev'], timeout: 30000, cwd: process.cwd(), env: { ...process.env, WORKPET_SKIP_INTEGRATIONS: '1', WORKPET_DATA_DIR: directory, WORKPET_BRIDGE_CONFIG: join(directory, 'bridge.json') } });
  const deadline = Date.now() + 15000;
  while (!panel && Date.now() < deadline) { panel = app.windows().find(p => p.url().endsWith('/panel.html')); if (!panel) await new Promise(r => setTimeout(r, 100)); }
  assert.ok(panel); panel.setDefaultTimeout(15000);
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/panel.html')); w.setSize(800, 850); w.show(); });
  if (replayRoot) {
    await panel.evaluate(({ url, token }) => window.workpet.configureWorketService({ url, token }), { url: `http://127.0.0.1:${service.server.address().port}`, token });
    await panel.evaluate(async workId => (await import('./distillation.js')).openPreparation([workId]), original.instance.id);
    await panel.locator('#improvement-consent').uncheck(); await panel.locator('#consent').check(); await panel.locator('#start-distillation').click();
    let job; const until = Date.now() + 30000;
    while (Date.now() < until) { [job] = await panel.evaluate(() => window.workpet.distillation('jobs')); if (job && ['AWAITING_REVIEW', 'FAILED'].includes(job.status)) break; await new Promise(resolve => setTimeout(resolve, 200)); }
    assert.equal(job?.status, 'AWAITING_REVIEW', job?.error);
    const draft = await panel.evaluate(id => window.workpet.distillation('draft', { id }), job.draftId);
    assert.equal(draft.issues.length, 0, 'this frozen accepted fixture requires no fabricated resolutions');
    assert.equal(draft.content.inputs.length, 1); inputKey = draft.content.inputs[0].key;
    roleKey = draft.content.materialRoles.find(role => role.kind === 'SKILL').key;
    await panel.evaluate(async id => (await import('./distillation.js')).openJob(id), job.id);
  } else {
    await panel.locator('#tab-definitions').click(); await panel.locator(`[data-definition="${base.id}"]`).click(); await panel.locator('#revise-definition').click();
    await panel.locator('#edit-all').click();
    await panel.locator('[data-review-action="toggle-property"][data-address="materialRoles.builder"]').click();
  }
  // Exercise the real selector route, substituting only the native dialog choice.
  await app.evaluate(({ dialog }, directory) => { dialog.showOpenDialog = async options => { if (!options.properties.includes('openDirectory')) throw new Error('Expected directory chooser'); return { canceled: false, filePaths: [directory] }; }; }, skillDirectory);
  await panel.locator(`[data-review-action="material"][data-address="materialRoles.${roleKey}"]`).click();
  if (!replayRoot) await panel.locator('#edit-all').click(); await panel.screenshot({ path: join(output, 'skill-review.png') });
  await panel.locator('#publish-definition').click(); await panel.locator('#use-definition').waitFor();
  const versions = replayRoot ? (await panel.evaluate(() => window.workpet.distillation('definitions'))).items : await panel.evaluate(key => window.workpet.distillation('versions', { key }), base.definitionKey);
  assert.equal(versions.length, replayRoot ? 1 : 2); assert.equal(versions[0].materials[0].bundle.files.length, 4);
  rmSync(skillDirectory, { recursive: true });
  await panel.locator('#use-definition').click(); await panel.locator(`[data-input="${inputKey}"]`).fill('全新主题：城市交通'); await panel.locator('#improvement-consent').uncheck(); await panel.locator('#create-defined-work').click();
  { const until = Date.now() + 15000; while (Date.now() < until) { if ((await panel.evaluate(() => window.workpet.getDashboard())).selectedWork?.reusableDefinitionId) break; await new Promise(resolve => setTimeout(resolve, 100)); } }
  const dashboard = await panel.evaluate(() => window.workpet.getDashboard()), workId = dashboard.selectedWorkId;
  const bridge = JSON.parse(readFileSync(join(directory, 'bridge.json'), 'utf8'));
  const readContext = async () => {
    const response = await fetch(`http://${bridge.host}:${bridge.port}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-workpet-token': bridge.token }, body: JSON.stringify({ jsonrpc: '2.0', id: randomUUID(), method: 'tools/call', params: { name: 'get_work_context', arguments: { work_id: workId } } }), signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200); return response.json();
  };
  const rpc = await readContext(); assert.ok(!rpc.error, JSON.stringify(rpc.error));
  const pkg = JSON.parse(rpc.result.content[0].text).workPackage;
  assert.equal(pkg.definition.version, replayRoot ? 1 : 2); assert.equal(pkg.skills.length, 1); assert.equal(pkg.fixedMaterials.length, 0);
  assert.match(readFileSync(pkg.skills[0].entrypoint, 'utf8'), /references\/format.md/);
  writeFileSync(join(output, 'package.json'), JSON.stringify(pkg, null, 2));
  const delivered = join(directory, 'new-report.md');
  execFileSync(process.execPath, [join(pkg.skills[0].directory, 'scripts/report.mjs'), pkg.inputs[inputKey], delivered]);
  const actual = readFileSync(delivered, 'utf8'); assert.match(actual, /全新主题：城市交通/); assert.match(actual, /固定格式 v1/); assert.match(actual, /来源/);
  writeFileSync(join(output, 'synthetic-delivery.md'), actual); report.checks.relativeCompanionsExecuted = true;
  const companion = join(pkg.skills[0].directory, 'references/format.md'), saved = readFileSync(companion); unlinkSync(companion);
  assert.match((await readContext()).error?.message ?? '', /MATERIAL_MISSING/); writeFileSync(companion, saved);
  report.checks.missingCompanionBlocked = true;
  await panel.evaluate(async () => { const dashboard = await window.workpet.getDashboard(); await (await import('./distillation.js')).workDefinitionAction(dashboard.selectedWork, 'complete'); });
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async options => { if (!options.properties.includes('openFile')) throw new Error('Expected file chooser'); return { canceled: false, filePaths: [path] }; }; }, delivered);
  await panel.locator('#attach-output').click(); await panel.locator('[data-output]').check();
  for (const select of await panel.locator('[data-criterion]').all()) await select.selectOption('PASS');
  await panel.screenshot({ path: join(output, 'synthetic-acceptance.png') });
  await panel.locator('#accept-output').click();
  { const until = Date.now() + 15000; while (Date.now() < until) { if ((await panel.evaluate(() => window.workpet.getDashboard())).selectedWork?.status === 'COMPLETED') break; await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.equal((await panel.evaluate(() => window.workpet.getDashboard())).selectedWork?.status, 'COMPLETED'); }
  report.checks.syntheticAcceptanceCompleted = true; report.status = 'PASSED';
} catch (error) { report.status = 'FAILED'; report.error = error instanceof Error ? error.message : String(error); if (panel) await panel.screenshot({ path: join(output, 'failure.png') }).catch(() => {}); process.exitCode = 1; }
finally { if (service) await new Promise(resolve => service.server.close(resolve)); if (app) await app.close().catch(() => {}); writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)); }
