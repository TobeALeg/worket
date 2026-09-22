// Isolated desktop + HTTP + real model + persistence + dispatch acceptance.
// Uses synthetic records only. QA confirmation is not a human acceptance of real work.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, renameSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { _electron as electron } from 'playwright';
import { createWorkCore } from '../dist/core/index.js';
import { createAIService } from '../server/service.mjs';
import { hash } from '../dist/definitions/storage.js';
import { ruleItems, effectiveRules } from '../dist/contracts/rules.js';
import { source } from '../test/distillation/fixtures.ts';
const run = new Date().toISOString().replace(/[:.]/g, '-');
const output = join(process.cwd(), 'output', 'contract-e2e', run); mkdirSync(output, { recursive: true });
const directory = mkdtempSync(join(tmpdir(), 'worket-contract-e2e-'));
const scenarios = {
  video: { norm: '# 系列视频规范\n每个平台交付文案不超过 50 words。\n成片交付 MP4。\n', unit: 'words', supplement: /同步|对齐/,
    conversation: '以后所有这类视频都按 FRAME.md 制作：每个平台文案最多五十个英文单词。以后动画内容还必须与对应口播同步。本次视频在 48 秒修正时钟；48 秒只属于本次。新的视频只需要提供新脚本即可，其他不明确的制作参数交由执行者按既有 skill 处理，不增加必填输入。' },
  report: { norm: '# 调研报告规范\n每节英文摘要不超过 50 words。\n报告交付 Markdown。\n', unit: 'words', supplement: /来源|出处/,
    conversation: '以后所有调研报告都按 FRAME.md 制作，每节英文摘要最多五十个词。以后每条结论都必须标注资料来源。本次报告在 48 页补一张插图，48 页只属于本次。下次只需提供新调研问题，其他由执行者按既有 skill 处理，不增加必填输入。' },
  code: { norm: '# 代码改动规范\n每个函数不超过 50 行。\n交付 Git patch。\n', unit: '行', supplement: /测试/,
    conversation: '以后所有这类代码改动都按 FRAME.md，每个函数最多五十行。以后每个修复必须有对应的回归测试。本次只修正 48 行的拼写，48 行只属于本次。下一次只需要提供新改动需求，其他由执行者按既有 skill 处理，不增加必填输入。' },
};
const scenario = process.env.WORKET_E2E_SCENARIO ?? 'video';
assert.ok(scenarios[scenario], 'unknown QA scenario');
const { norm, unit, supplement, conversation } = scenarios[scenario];
const oldLimit = `50 ${unit}`, newLimit = `30 ${unit}`, overrideLimit = `80 ${unit}`;
const path = join(directory, 'FRAME.md'); writeFileSync(path, norm);
const core = createWorkCore({ databasePath: join(directory, 'workpet.sqlite') });
const original = source(core, conversation);
core.addArtifactRef(original.instance.id, { path, filename: 'FRAME.md', role: 'REFERENCE', mimeType: 'text/markdown', size: Buffer.byteLength(norm), sha256: hash(norm), lastModifiedAt: new Date().toISOString(), availability: 'AVAILABLE' });
core.completeWork(original.instance.id); core.close();
let calls = 0;
const usage = [], errors = [];
const remoteCode = `import {readFileSync} from 'node:fs'; import {AdminStore} from '/app/server/admin/store.mjs'; import {ModelProvider} from '/app/server/workflow.mjs'; const store=Object.create(AdminStore.prototype); store.data=JSON.parse(readFileSync('/data/settings.json','utf8')); store.master=readFileSync('/data/encryption.key'); const config=store.data.provider; const provider=new ModelProvider({baseUrl:config.baseUrl,model:config.model,apiKey:store.apiKey()}); const chunks=[]; for await(const chunk of process.stdin)chunks.push(chunk); try {const value=await provider.call(JSON.parse(Buffer.concat(chunks)).messages,AbortSignal.timeout(180000)); process.stdout.write(JSON.stringify(value));}catch{process.stderr.write('MODEL_CALL_FAILED');process.exitCode=1;}`;
const quote = text => "'" + text.replaceAll("'", "'\\''") + "'";
const provider = { model: 'deepseek-flash', async call(messages, signal) {
  assert.ok(++calls <= 2, 'E2E budget: at most two real provider calls; no hidden retries');
  writeFileSync(join(output, `request-${calls}.json`), JSON.stringify(messages, null, 2));
  if (process.env.WORKET_E2E_REPLAY) {
    const response = JSON.parse(readFileSync(join(process.env.WORKET_E2E_REPLAY, `response-${calls}.json`), 'utf8'));
    usage.push({ replay: true }); return response;
  }
  console.log(`provider call ${calls} started`);
  const response = await new Promise((resolve, reject) => {
    const child = spawn('ssh', ['-o', 'BatchMode=yes', 'jp-server', `sudo docker exec -i worket node --input-type=module -e ${quote(remoteCode)}`], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', d => out += d); child.stderr.on('data', d => err += d);
    const abort = () => child.kill('SIGTERM'); signal?.addEventListener('abort', abort, { once: true });
    child.once('error', reject);
    child.once('close', code => { signal?.removeEventListener('abort', abort); if (code !== 0) reject(new Error(`provider bridge failed (${code}): ${err.slice(-300)}`)); else { try { resolve(JSON.parse(out)); } catch { reject(new Error('provider bridge returned invalid JSON')); } } });
    child.stdin.end(JSON.stringify({ messages }));
  });
  usage.push(response.usage); writeFileSync(join(output, `response-${calls}.json`), JSON.stringify(response, null, 2));
  console.log(`provider call ${calls} finished`); return response;
} };
const secret = 'isolated-contract-e2e';
const service = createAIService({ mode: 'development', devSecret: secret, issuer: 'qa', audience: 'qa', provider, providerName: '真实模型端到端验收', limits: { dailyCalls: 2 } });
await new Promise(r => service.server.listen(0, '127.0.0.1', r));
const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
const body = Buffer.from(JSON.stringify({ sub: 'qa-contract', iss: 'qa', aud: 'qa', exp: Date.now()/1000+3600 })).toString('base64url');
const token = `${header}.${body}.${createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')}`;
let app, panel;
const report = { run, scenario, model: provider.model, status: 'RUNNING', replay: process.env.WORKET_E2E_REPLAY ?? null, stages: [], output, directory, calls: 0, usage: [], humanAcceptance: false };
const mark = stage => { report.stages.push(stage); console.log(stage); };
try {
  app = await electron.launch({ executablePath: process.env.WORKPET_EXECUTABLE_PATH ?? join(process.cwd(), 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: ['.', `--user-data-dir=${directory}`, '--dev'], cwd: process.cwd(), env: { ...process.env, WORKPET_SKIP_INTEGRATIONS: '1', WORKPET_DATA_DIR: directory, WORKPET_BRIDGE_CONFIG: join(directory, 'bridge.json') } });
  const windowDeadline = Date.now() + 15000;
  while (!panel && Date.now() < windowDeadline) {
    panel = app.windows().find(p => p.url().endsWith('/panel.html'));
    if (!panel) await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(panel); panel.setDefaultTimeout(15000); panel.on('pageerror', e => errors.push(e.message)); panel.on('dialog', d => d.accept());
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/panel.html')); w.setSize(760, 820); w.show(); });
  await panel.evaluate(({url,token}) => window.workpet.configureWorketService({url,token}), { url: `http://127.0.0.1:${service.server.address().port}`, token });
  await panel.locator('#tab-completed').click(); await panel.locator('[data-distill-work]').check(); await panel.locator('#distill-selected').click();
  await panel.locator('[data-file-id]').check(); await panel.locator('#apply-range').click();
  await panel.locator('[data-file-role]').selectOption('NORMATIVE'); await panel.locator('#apply-range').click();
  await panel.locator('#improvement-consent').uncheck(); await panel.locator('#consent').check();
  await panel.screenshot({ path: join(output, '01-source-scope.png') });
  await panel.locator('#start-distillation').click(); mark('desktop → explicit normative file selection → HTTP submitted');
  let job;
  const deadline = Date.now() + 420000;
  while (Date.now() < deadline) {
    const jobs = await panel.evaluate(() => window.workpet.distillation('jobs'));
    job = jobs[0];
    if (job && ['AWAITING_REVIEW', 'FAILED'].includes(job.status)) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.equal(job?.status, 'AWAITING_REVIEW', job?.error);
  let draft = await panel.evaluate(id => window.workpet.distillation('draft', {id}), job.draftId);
  writeFileSync(join(output, 'draft.json'), JSON.stringify(draft, null, 2));
  assert.equal(draft.content.inputs.length, 1, 'exactly the requested fresh input role, no omitted input or invented mandatory parameters');
  assert.ok(draft.content.inputs[0].required);
  assert.equal(draft.content.inputs[0].defaultValue, undefined, 'do not carry an old task value into new defaults');
  const active = ruleItems(effectiveRules(draft.content).content);
  assert.ok(active.some(r => r.item.document), 'real model must bind a normative clause');
  assert.ok(active.some(r => supplement.test(r.item.text)), 'additional durable rule retained');
  assert.ok(!active.some(r => /48/.test(r.item.text)), 'one-time timestamp does not become permanent');
  const limits = active.filter(r => /50|五十/.test(r.item.text)); assert.equal(limits.length, 1, 'one effective copy limit');
  const firstAddress = limits[0].address;
  mark(`${process.env.WORKET_E2E_REPLAY ? 'recorded real-model response' : 'real model'} → grounded clauses + dedup + reusable/instance separation`);
  // Open the actual draft UI, then explicitly review synthetic QA candidates.
  await panel.evaluate(async id => { const m = await import('./distillation.js'); await m.openJob(id); }, job.id);
  await panel.screenshot({ path: join(output, '02-draft.png') });
  // Do not invent new user requirements to make the generated output pass.
  assert.equal(draft.issues.filter(i => i.blocking).length, 0, 'unexpected blocking decisions require investigation');
  for (const issue of draft.issues) {
    const button = panel.locator(`[data-review-action="accept"][data-issue="${issue.id}"]`);
    if (await button.count()) await button.click();
  }
  await panel.locator('#publish-definition').click(); await panel.locator('#use-definition').waitFor();
  const contractText = await panel.locator('.definition-summary').innerText();
  assert.ok(!/48\s*(秒|页|行)/.test(contractText), 'saved contract UI shows effective rules only');
  assert.equal(contractText.split(oldLimit).length - 1, 1);
  const defs = await panel.evaluate(() => window.workpet.distillation('definitions'));
  const definition = defs.items[0]; writeFileSync(join(output,'definition.json'), JSON.stringify(definition,null,2));
  mark('draft review → published test definition');
  await panel.locator('#use-definition').click();
  for (const spec of definition.content.inputs) {
    const loc = panel.locator(`[data-input="${spec.key}"]`);
    if (spec.valueType === 'BOOLEAN') await loc.selectOption('true');
    else if (spec.valueType === 'CHOICE') await loc.selectOption(spec.choices[0]);
    else { assert.notEqual(spec.valueType,'FILE','synthetic test expects script as text'); await loc.fill(spec.valueType === 'NUMBER' ? '1' : '全新的脚本：介绍睡眠。'); }
  }
  await panel.locator('#create-defined-work').click();
  const dashboard = await panel.evaluate(() => window.workpet.getDashboard());
  const newId = dashboard.selectedWorkId;
  const pkg = await panel.evaluate(workId => window.workpet.distillation('package', {workId}), newId);
  writeFileSync(join(output,'package.json'),JSON.stringify(pkg.json,null,2)); writeFileSync(join(output,'package.md'),pkg.markdown);
  assert.equal(pkg.json.purpose,'START'); assert.ok(pkg.json.ruleSources.length); assert.ok(!/48\s*(秒|页|行)/.test(pkg.markdown));
  assert.equal(pkg.markdown.split(oldLimit).length - 1,1);
  await panel.evaluate(workId => window.workpet.copyWorkPackage(workId), newId);
  const clipboard = await app.evaluate(({clipboard})=>clipboard.readText()); assert.ok(clipboard.includes(oldLimit));
  mark('new instance → actual exported/copied execution package');
  // Explicit instance exception through the same UI; next instance defaults must remain intact.
  await panel.locator('#tab-definitions').click(); await panel.locator(`[data-definition="${definition.id}"]`).click(); await panel.locator('#use-definition').click();
  for(const spec of definition.content.inputs) { const loc=panel.locator(`[data-input="${spec.key}"]`); if(spec.valueType==='BOOLEAN')await loc.selectOption('true'); else if(spec.valueType==='CHOICE')await loc.selectOption(spec.choices[0]); else await loc.fill(spec.valueType==='NUMBER'?'1':'另一期新脚本'); }
  await panel.getByText('仅本次的特殊要求',{exact:true}).click(); await panel.locator(`[data-rule-override="${firstAddress}"]`).fill(`仅本次，上述限制改为不超过 ${overrideLimit}。`);
  await panel.locator('#create-defined-work').click();
  const overridden = await panel.evaluate(async () => { const d=await window.workpet.getDashboard(); return window.workpet.distillation('package',{workId:d.selectedWorkId}); });
  assert.ok(overridden.markdown.includes(overrideLimit)); assert.ok(!overridden.markdown.includes(oldLimit));
  const unchanged = await panel.evaluate(workId => window.workpet.distillation('package',{workId}),newId); assert.ok(unchanged.markdown.includes(oldLimit));
  mark('instance-only override → old/default definition unchanged');
  await panel.screenshot({ path:join(output,'03-new-instance.png') });
  // File evolution and invalid dependency through the shipped renderer/IPC routes.
  await panel.locator('#tab-definitions').click(); await panel.locator(`[data-definition="${definition.id}"]`).click(); await panel.locator('#revise-definition').click();
  const renamed = join(directory, 'RENAMED-FRAME.md'); renameSync(path, renamed);
  await app.evaluate(({dialog}, path) => { dialog.showOpenDialog = async () => ({canceled:false,filePaths:[path]}); }, renamed);
  await panel.locator(`[data-review-action="document-version"][data-address="${firstAddress}"]`).click();
  await panel.getByText('内容未变化，继续引用当前固定版本',{exact:true}).waitFor();
  mark('renamed source → unchanged fixed version');
  writeFileSync(renamed, norm.replace(oldLimit,newLimit));
  await panel.locator(`[data-review-action="document-version"][data-address="${firstAddress}"]`).click();
  await panel.locator('#doc-start-line').fill('2'); await panel.locator('#doc-end-line').fill('2');
  await panel.screenshot({path:join(output,'04-document-diff.png')});
  await panel.locator('[data-review-action="adopt-document"]').click();
  while (await panel.locator('[data-review-action="exclude"][data-issue^="document-change-"]').count()) await panel.locator('[data-review-action="exclude"][data-issue^="document-change-"]').first().click();
  await panel.locator('#publish-definition').click(); await panel.locator('#use-definition').waitFor();
  const versions = await panel.evaluate(key=>window.workpet.distillation('versions',{key}),definition.definitionKey);
  const v2 = versions.find(v=>v.version===2); assert.ok(v2);
  const old = await panel.evaluate(workId=>window.workpet.distillation('package',{workId}),newId); assert.ok(old.markdown.includes(oldLimit));
  await panel.locator('#use-definition').click();
  for(const spec of v2.content.inputs) { const loc=panel.locator(`[data-input="${spec.key}"]`); if(spec.valueType==='BOOLEAN')await loc.selectOption('true'); else if(spec.valueType==='CHOICE')await loc.selectOption(spec.choices[0]); else await loc.fill(spec.valueType==='NUMBER'?'1':'新版标准下的新脚本'); }
  await panel.locator('#create-defined-work').click();
  const v2Id = (await panel.evaluate(()=>window.workpet.getDashboard())).selectedWorkId;
  const updated=await panel.evaluate(workId=>window.workpet.distillation('package',{workId}),v2Id); assert.ok(updated.markdown.includes(newLimit)); assert.ok(!updated.markdown.includes(oldLimit));
  unlinkSync(renamed);
  await panel.evaluate(workId=>window.workpet.copyWorkPackage(workId),v2Id);
  mark('adopt file revision → v2 new instance; v1 stable; removed original still dispatches');
  const pinned=v2.materials.find(m=>m.role===`document:${hash(norm.replace(oldLimit,newLimit))}`); assert.ok(pinned);
  const bytes=readFileSync(pinned.path); unlinkSync(pinned.path);
  const missing=await panel.evaluate(async workId=>{try{await window.workpet.copyWorkPackage(workId);return 'unexpected success';}catch(e){return e.message;}},v2Id);
  assert.match(missing,/MATERIAL_MISSING/); writeFileSync(pinned.path,bytes);
  mark('missing pinned dependency → actual export refuses incomplete instructions');

  // Verify the acceptance route with a clearly synthetic attachment, not a claimed real delivery.
  const outputPath = join(directory, 'QA-only-delivery.txt'); writeFileSync(outputPath, 'Synthetic lifecycle fixture; not a completed user deliverable.');
  await app.evaluate(({dialog}, path) => { dialog.showOpenDialog = async () => ({canceled:false,filePaths:[path]}); }, outputPath);
  await panel.locator('[data-action="complete"]').click();
  assert.ok(await panel.locator('[data-criterion]').count(), 'deduplicated contract still requires acceptance');
  await panel.locator('#attach-output').click(); await panel.locator('[data-output]').check();
  for (const check of await panel.locator('[data-criterion]').all()) await check.selectOption('PASS');
  await panel.locator('[data-criterion]').first().selectOption('NEEDS_REVISION');
  await panel.locator('#accept-output').click();
  assert.equal((await panel.evaluate(()=>window.workpet.getDashboard())).selectedWork.status,'OPEN');
  await panel.locator('[data-action="complete"]').click();
  for (const check of await panel.locator('[data-criterion]').all()) await check.selectOption('PASS');
  await panel.locator('[data-output]').check(); await panel.locator('#accept-output').click();
  assert.equal((await panel.evaluate(()=>window.workpet.getDashboard())).selectedWork.status,'COMPLETED');
  mark('synthetic attachment → needs-revision stays open → explicit checklist pass completes instance');

  assert.deepEqual(errors,[]);
  report.status='PASSED';
} catch(error) { report.status='FAILED'; report.error=error.message; if(panel) { await panel.screenshot({path:join(output,'failure.png')}).catch(()=>{}); writeFileSync(join(output,'failure-dom.txt'),await panel.locator('body').innerText().catch(()=>'')); } process.exitCode=1; console.error(error.message); }
finally { report.calls=calls;report.usage=usage;writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2)); await app?.close(); await service.close(); console.log(JSON.stringify(report)); }
