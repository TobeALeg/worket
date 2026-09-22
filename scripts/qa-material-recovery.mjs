// Explicit recovery through real Electron UI; inputs/skill execution are synthetic.
import assert from 'node:assert/strict';
import { randomUUID as id } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { _electron as electron } from 'playwright';
import { createWorkCore } from '../dist/core/index.js';
import { hash } from '../dist/definitions/storage.js';
import { skillContent, skillBasis, writeSkillFixture } from './lib/skill-fixture.mjs';
const run = new Date().toISOString().replace(/[:.]/g, '-'), output = join(process.cwd(), 'output/material-recovery', run);
mkdirSync(output, { recursive: true });
const directory = mkdtempSync(join(tmpdir(), 'worket-recovery-e2e-')), databasePath = join(directory, 'workpet.sqlite');
const skill = join(directory, 'builder'), wrongSkill = join(directory, 'builder-v2');
writeSkillFixture(skill); writeSkillFixture(wrongSkill, '其他版本');
const script = join(directory, 'SCRIPT.md'), template = join(directory, 'FORMAT.md'), reference = join(directory, 'REFERENCE.md'), wrong = join(directory, 'wrong.md');
for (const [path, content] of [[script, '本次脚本'], [template, '固定格式'], [reference, '参考案例'], [wrong, '不同内容']]) writeFileSync(path, content);
const core = createWorkCore({ databasePath }), content = structuredClone(skillContent);
content.inputs.push({ key: 'script', text: '本次脚本', valueType: 'FILE', required: true, basis: skillBasis });
content.materialRoles.push({ key: 'template', text: '报告格式', required: true, basis: skillBasis });
const draft = core.definitions.saveDraft({ id: id(), revision: 1, content, originalContent: structuredClone(content), refs: [], issues: [], resolutions: [] });
core.definitions.db.prepare('INSERT INTO review_events VALUES (?,?,?)').run(skillBasis.reviewEventId, draft.id, JSON.stringify({ type: 'QA_BASELINE', content }));
const definition = core.definitions.publish({ draftId: draft.id, expectedRevision: 1, materialBindings: { builder: skill, template }, commandId: id() });
const create = refs => core.createWorkFromDefinition({ definitionId: definition.id, inputs: { subject: '合成恢复验收', script }, referenceExampleIds: refs, commandId: id() });
const first = create([]);
const artifact = core.addArtifactRef(first.instance.id, { path: reference, filename: 'REFERENCE.md', role: 'DELIVERABLE', mimeType: null, size: Buffer.byteLength('参考案例'), sha256: hash('参考案例'), lastModifiedAt: new Date().toISOString(), availability: 'AVAILABLE' }).artifactRefs[0];
const work = create([artifact.id]), binding = core.definitions.inputs(work.instance.id);
const frozenSkill = dirname(definition.materials.find(m => m.bundle).path), frozenTemplate = definition.materials.find(m => m.role === 'template').path;
writeFileSync(join(frozenSkill, 'references/format.md'), '损坏'); writeFileSync(join(frozenSkill, 'extra.txt'), '多余文件');
unlinkSync(frozenTemplate); writeFileSync(binding.inputs.script, '损坏'); writeFileSync(binding.referenceExamples[0].path, '损坏');
core.close();
const report = { run, status: 'RUNNING', packaged: !!process.env.WORKPET_EXECUTABLE_PATH, directory, actualProviderCalls: 0, externalAgent: false, synthetic: true, checks: {} };
let app, panel;
try {
  app = await electron.launch({ executablePath: process.env.WORKPET_EXECUTABLE_PATH ?? join(process.cwd(), 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: [...(process.env.WORKPET_EXECUTABLE_PATH ? ['--use-mock-keychain'] : ['.']), `--user-data-dir=${directory}`, '--dev'], cwd: process.cwd(), env: { ...process.env, WORKPET_DATA_DIR: directory, WORKPET_BRIDGE_CONFIG: join(directory, 'bridge.json'), WORKPET_SKIP_INTEGRATIONS: '1' } });
  const until = Date.now() + 15000;
  while (!panel && Date.now() < until) { panel = app.windows().find(p => p.url().endsWith('/panel.html')); if (!panel) await new Promise(resolve => setTimeout(resolve, 100)); }
  assert.ok(panel); panel.setDefaultTimeout(15000);
  await app.evaluate(({BrowserWindow}) => { const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/panel.html')); w.setSize(410,700); w.show(); });
  const choose = async path => app.evaluate(({dialog}, path) => { dialog.showOpenDialog = async () => ({canceled:false,filePaths:[path]}); }, path);
  const recover = async (key, path, valid = true) => {
    await choose(path); const row = panel.locator(`[data-recovery-key="${key}"]`); await row.locator('button').click();
    if (valid) { await row.locator('button').waitFor({state:'detached'}); assert.match(await row.innerText(), /可用/); }
    else { await panel.locator('#definition-error').waitFor({state:'visible'}); assert.match(await panel.locator('#definition-error').innerText(), /固定版本不同/); }
  };
  await panel.locator('#tab-definitions').click(); await panel.locator(`[data-definition="${definition.id}"]`).click();
  await panel.locator('#repair-definition-materials').click();
  await recover('definition:template', wrong, false);
  await recover('definition:template', template);
  await recover('definition:builder', wrongSkill, false);
  assert.equal(readFileSync(join(frozenSkill,'references/format.md'),'utf8'),'损坏');
  await recover('definition:builder', skill);
  await panel.screenshot({path:join(output,'definition-restored.png')});
  report.checks.definitionAndSkillExactVersion = true;
  await panel.locator('#definition-dialog [data-close]').click(); await panel.locator('#tab-open').click();
  if(await panel.locator('#back-to-list').isVisible()) await panel.locator('#back-to-list').click();
  await panel.locator(`[data-work-id="${work.instance.id}"]`).click();
  await panel.locator('summary[aria-label="工作操作"]').click(); await panel.locator('[data-action="repair-materials"]').click();
  await recover('input:script', wrong, false);
  await recover('input:script', script); await recover(`reference:${artifact.id}`, reference);
  await panel.screenshot({path:join(output,'instance-restored.png')});
  const after = await panel.evaluate(workId => window.workpet.distillation('package',{workId}), work.instance.id);
  assert.equal(after.json.definition.id, definition.id);
  assert.equal(readFileSync(after.json.inputs.script,'utf8'),'本次脚本');
  assert.equal(readFileSync(after.json.referenceExamples[0].path,'utf8'),'参考案例');
  assert.equal(readFileSync(join(after.json.skills[0].directory,'references/format.md'),'utf8'),'固定格式 v1');
  const other = await panel.evaluate(workId => window.workpet.distillation('package',{workId}), first.instance.id);
  assert.equal(other.json.definition.id, definition.id);
  assert.equal(readFileSync(other.json.inputs.script,'utf8'),'本次脚本');
  const versions = await panel.evaluate(key => window.workpet.distillation('versions',{key}), definition.definitionKey);
  assert.equal(versions.length,1); assert.equal(versions[0].contentHash,definition.contentHash);
  const persisted = createWorkCore({databasePath});
  try { assert.deepEqual(persisted.definitions.inputs(work.instance.id), binding); } finally { persisted.close(); }
  report.checks.inputsReferencesAndContractIdentityPreserved = true;
  const bridge = JSON.parse(readFileSync(join(directory,'bridge.json'),'utf8'));
  const response = await fetch(`http://${bridge.host}:${bridge.port}/mcp`,{method:'POST',headers:{'content-type':'application/json','x-workpet-token':bridge.token},body:JSON.stringify({jsonrpc:'2.0',id:id(),method:'tools/call',params:{name:'get_work_context',arguments:{work_id:work.instance.id}}})});
  const mcp = await response.json(); assert.ok(!mcp.error,JSON.stringify(mcp));
  const context = JSON.parse(mcp.result.content[0].text); assert.equal(context.workPackage.definition.id,definition.id);
  report.checks.mcpValidatesRecoveredMaterials = true; report.status = 'PASSED';
} catch(error) { report.status='FAILED';report.error=error.stack??String(error);process.exitCode=1;if(panel)await panel.screenshot({path:join(output,'failure.png')}).catch(()=>{}); }
finally {if(app)await app.close().catch(()=>{});writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
