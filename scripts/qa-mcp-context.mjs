// Isolated Electron + authenticated HTTP MCP acceptance. No model or external Agent.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from 'playwright';
import { createWorkCore } from '../dist/core/index.js';
const run = new Date().toISOString().replace(/[:.]/g, '-');
const output = join(process.cwd(), 'output/mcp-context', run); mkdirSync(output, { recursive: true });
const directory = mkdtempSync(join(tmpdir(), 'worket-mcp-context-'));
const databasePath = join(directory, 'workpet.sqlite');
const core = createWorkCore({ databasePath });
const basis = { type: 'USER_AUTHORED', reviewEventId: 'synthetic-mcp-baseline' };
const item = (key, text) => ({ key, text, basis });
const content = { schemaVersion: 1, name: '报告接力验收', purpose: item('purpose', '依据本次资料完成报告'), inputs: [{ ...item('subject', '本次主题'), valueType: 'TEXT', required: true }], deliverables: [item('report', 'Markdown 报告')], constraints: [item('sources', '事实标注来源')], acceptanceCriteria: [item('traceable', '事实可追溯')], methods: [], materialRoles: [{ ...item('template', '固定报告模板'), required: true }] };
const draft = { id: randomUUID(), revision: 1, content, originalContent: structuredClone(content), refs: [], issues: [], resolutions: [] };
core.definitions.db.prepare('INSERT INTO definition_drafts VALUES (?,?)').run(draft.id, JSON.stringify(draft));
core.definitions.db.prepare('INSERT INTO review_events VALUES (?,?,?)').run(basis.reviewEventId, draft.id, JSON.stringify({ type: 'QA_BASELINE', synthetic: true, content }));
const original = join(directory, 'template.md'), template = '# 固定模板\n每条结论附来源。\n'; writeFileSync(original, template);
const definition = core.definitions.publish({ draftId: draft.id, expectedRevision: 1, materialBindings: { template: original }, commandId: randomUUID() });
const freshWork = () => core.createWorkFromDefinition({ definitionId: definition.id, inputs: { subject: '全新主题：城市交通' }, referenceExampleIds: [], commandId: randomUUID() });
const work = freshWork(), blocked = freshWork();
for (const w of [work, blocked]) core.definitions.db.prepare("INSERT INTO pending_dispatches VALUES (?,?,'WAITING',NULL)").run(w.instance.id, randomUUID());
const prior = core.createHandoffPackage(work.instance.id), priorBlocked = core.createHandoffPackage(blocked.instance.id);
const priorRow = core.definitions.db.prepare('SELECT payload_json FROM handoff_packages WHERE id=?').get(prior.id).payload_json;
const outputPath = join(directory, 'new-report.md'), reportText = '# 本次报告\n城市交通来源待核验。'; writeFileSync(outputPath, reportText);
core.addArtifactRef(work.instance.id, { path: outputPath, filename: 'new-report.md', role: 'OUTPUT', mimeType: 'text/markdown', size: Buffer.byteLength(reportText), sha256: createHash('sha256').update(reportText).digest('hex'), lastModifiedAt: new Date().toISOString(), availability: 'AVAILABLE' });
core.applyExtractorPatch(work.instance.id, { pendingActions: [{ id: randomUUID(), text: '核验本次报告来源', origin: 'USER_STATED', sourceMessageIds: [work.sourceArchive[1].id] }] });
core.close(); unlinkSync(original); // Pinning must survive deletion of the original path.
const result = { run, status: 'RUNNING', packaged: !!process.env.WORKPET_EXECUTABLE_PATH, kind: 'synthetic instance; real Electron and authenticated MCP HTTP; no target Agent or business acceptance', directory, actualProviderCalls: 0, checks: {} };
let app, panel;
try {
  app = await electron.launch({ executablePath: process.env.WORKPET_EXECUTABLE_PATH ?? join(process.cwd(), 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: [...(process.env.WORKPET_EXECUTABLE_PATH ? ['--use-mock-keychain'] : ['.']), `--user-data-dir=${directory}`, '--dev'], timeout: 30000, cwd: process.cwd(), env: { ...process.env, WORKPET_SKIP_INTEGRATIONS: '1', WORKPET_DATA_DIR: directory, WORKPET_BRIDGE_CONFIG: join(directory, 'bridge.json') } });
  const deadline = Date.now() + 15000;
  while (!panel && Date.now() < deadline) { panel = app.windows().find(p => p.url().endsWith('/panel.html')); if (!panel) await new Promise(r => setTimeout(r, 100)); }
  assert.ok(panel, 'real desktop panel opened');
  await panel.locator('#tab-definitions').waitFor();
  const bridge = JSON.parse(readFileSync(join(directory, 'bridge.json'), 'utf8'));
  const request = async (id, token = bridge.token) => {
    const response = await fetch(`http://${bridge.host}:${bridge.port}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-workpet-token': token }, body: JSON.stringify({ jsonrpc: '2.0', id: randomUUID(), method: 'tools/call', params: { name: 'get_work_context', arguments: { work_id: id } } }), signal: AbortSignal.timeout(10000) });
    return { status: response.status, value: response.status === 200 ? await response.json() : null };
  };
  assert.equal((await request(work.instance.id, 'invalid')).status, 401);
  const first = await request(work.instance.id); assert.equal(first.status, 200); assert.ok(!first.value.error);
  const current = JSON.parse(first.value.result.content[0].text);
  writeFileSync(join(output, 'context.json'), JSON.stringify(current, null, 2));
  assert.equal(current.nextStep, '核验本次报告来源', 'current state must replace cached state');
  assert.equal(current.workPackage.nextStep, current.nextStep);
  assert.equal(current.neededArtifacts.length, 1, 'later artifact must be included');
  assert.equal(current.neededArtifacts[0].sha256, createHash('sha256').update(reportText).digest('hex'));
  assert.equal(current.workPackage.inputs.subject, '全新主题：城市交通');
  assert.equal(current.workPackage.definition.id, definition.id);
  assert.equal(readFileSync(current.workPackage.fixedMaterials[0].path, 'utf8'), template);
  result.checks.freshStateArtifactsAndPinnedVersion = true;
  unlinkSync(definition.materials[0].path);
  const missing = await request(blocked.instance.id);
  assert.match(missing.value.error?.message ?? '', /MATERIAL_MISSING/, 'cache must not bypass missing fixed material');
  writeFileSync(join(output, 'missing-material.json'), JSON.stringify(missing.value, null, 2));
  result.checks.missingMaterialBlocked = true;
  // Restore then corrupt the same fixed file: both failures must revalidate each read.
  writeFileSync(definition.materials[0].path, 'corrupted material');
  assert.match((await request(blocked.instance.id)).value.error?.message ?? '', /MATERIAL_MISSING/);
  result.checks.corruptMaterialBlocked = true;
  writeFileSync(definition.materials[0].path, template);
  await panel.screenshot({ path: join(output, 'desktop.png') });
  await app.close(); app = null;
  const after = createWorkCore({ databasePath });
  try {
    assert.equal(after.definitions.db.prepare('SELECT payload_json FROM handoff_packages WHERE id=?').get(prior.id).payload_json, priorRow);
    assert.ok(after.getWork(work.instance.id).packageReadAt);
    assert.equal(after.getWork(blocked.instance.id).packageReadAt, null);
    assert.equal(after.getLatestHandoffPackage(blocked.instance.id).id, priorBlocked.id);
    result.checks.immutableHistoryAndNoFalseReceipt = true;
  } finally { after.close(); }
  result.status = 'PASSED';
} catch (error) { result.status = 'FAILED'; result.error = error instanceof Error ? error.message : String(error); process.exitCode = 1; }
finally { if (app) await app.close().catch(() => {}); writeFileSync(join(output, 'report.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result)); }
