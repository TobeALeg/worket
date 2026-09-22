// Real Electron settings + durable outbox + managed HTTP stores. Only connection timing
// and synthetic enrollment are controlled; no real user content or model calls.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from 'playwright';
import { createManagedService } from '../server/managed.mjs';
import { WorketAIClient } from '../dist/ai-service/client.js';
import { IMPROVEMENT_POLICY } from '../dist/contracts/improvement.js';
const run = new Date().toISOString().replace(/[:.]/g, '-');
const output = join(process.cwd(), 'output/improvement-boundary', run); mkdirSync(output, { recursive: true });
const directory = mkdtempSync(join(tmpdir(), 'worket-upload-e2e-'));
const report = { run, status: 'RUNNING', packaged: !!process.env.WORKPET_EXECUTABLE_PATH, actualProviderCalls: 0, syntheticEnrollment: true, controlledConnectionDelay: true, checks: {} };
const servers = [], configs = [], requests = [[], []]; let app, panel;
try {
  for (let i = 0; i < 2; i++) {
    const service = createManagedService({ directory: join(directory, `server-${i}`), providerFactory: () => ({ model: 'unused', async call() { report.actualProviderCalls++; throw Error('No model expected'); } }) });
    servers.push(service); await new Promise(r => service.server.listen(0, '127.0.0.1', r));
    service.server.on('request', req => { if (req.url.startsWith('/v1/improvement-samples')) requests[i].push(req.method); });
    service.store.setup('synthetic-password'); const user = service.store.issue({ name: 'synthetic', days: 1 });
    configs.push({ url: `http://127.0.0.1:${service.server.address().port}`, token: user.token });
  }
  app = await electron.launch({ executablePath: process.env.WORKPET_EXECUTABLE_PATH ?? join(process.cwd(), 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: [...(process.env.WORKPET_EXECUTABLE_PATH ? ['--use-mock-keychain'] : ['.']), `--user-data-dir=${directory}`, '--dev'], cwd: process.cwd(), env: { ...process.env, WORKPET_DATA_DIR: directory, WORKPET_BRIDGE_CONFIG: join(directory, 'bridge.json'), WORKPET_SKIP_INTEGRATIONS: '1' } });
  const deadline = Date.now() + 15000;
  while (!panel && Date.now() < deadline) { panel = app.windows().find(p => p.url().endsWith('/panel.html')); if (!panel) await new Promise(r => setTimeout(r, 100)); }
  assert.ok(panel); panel.setDefaultTimeout(15000);
  await app.evaluate(({ app, BrowserWindow }) => {
    const require = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/package.json');
    const { ImprovementCollector } = require('./dist/improvement/collector.js');
    const { WorketAIClient } = require('./dist/ai-service/client.js');
    const flush = ImprovementCollector.prototype.flush;
    ImprovementCollector.prototype.flush = function (...args) { globalThis.qaCollector = this; return flush.apply(this, args); };
    const request = WorketAIClient.prototype.request;
    WorketAIClient.prototype.request = function (...args) {
      if (globalThis.qaArm && args[0].startsWith('/v1/improvement-samples')) {
        globalThis.qaArm = false;
        const gated = new WorketAIClient(this.config, async () => {
          globalThis.qaWaiting = true;
          await new Promise(resolve => { globalThis.qaRelease = resolve; });
          globalThis.qaWaiting = false;
          await this.connect?.();
        });
        return request.apply(gated, args);
      }
      return request.apply(this, args);
    };
    const window = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/panel.html')); window.setSize(800, 850); window.show();
  });
  const configure = config => panel.evaluate(c => window.workpet.configureWorketService(c), config);
  await configure(configs[0]); await panel.evaluate(() => window.workpet.distillation('syncImprovement'));
  const start = id => app.evaluate((_, id) => {
    globalThis.qaCollector.setEnabled(true);
    globalThis.qaCollector.enroll(id, 'REUSE', '合成上传边界验收', { inputs: { topic: 'synthetic-only' } });
    globalThis.qaArm = true; globalThis.qaFlushing = globalThis.qaCollector.flush();
  }, id);
  const waiting = async () => {
    const until = Date.now() + 10000;
    while (Date.now() < until) { if (await app.evaluate(() => !!globalThis.qaWaiting)) return; await new Promise(r => setTimeout(r, 50)); }
    throw Error('Connection gate not reached');
  };
  const release = () => app.evaluate(async () => { globalThis.qaRelease(); await globalThis.qaFlushing; });
  const samples = () => panel.evaluate(() => window.workpet.distillation('improvementSamples'));
  await start('stopped'); await waiting();
  await panel.locator('#app-menu > summary').click(); await panel.locator('#service-settings').click(); await panel.locator('#improvement-data').click();
  await panel.locator('#improvement-consent').uncheck();
  await panel.waitForFunction(() => document.querySelector('#definition-dialog')?.textContent.includes('已停止'));
  await release(); assert.deepEqual(requests, [[], []], 'stopped upload must not reach either service');
  assert.equal((await samples())[0].pending, 0);
  await panel.screenshot({ path: join(output, 'stopped-before-send.png') }); report.checks.stopBeforeSend = true;

  await start('destination'); await waiting(); await configure(configs[1]); await release();
  assert.deepEqual(requests, [[], []]);
  assert.equal((await samples()).find(s => s.id === 'destination').error, 'SERVICE_CHANGED');
  await configure(configs[0]); await panel.evaluate(() => window.workpet.distillation('syncImprovement'));
  assert.deepEqual(requests, [['POST'], []]); report.checks.originalDestinationRetry = true;

  // Seed the same opaque sample ID in the second isolated account to detect wrong deletion.
  const seed = { schemaVersion: 1, sampleId: 'destination', consent: { version: IMPROVEMENT_POLICY.version, at: new Date().toISOString(), scope: 'REUSE' }, event: { id: 'seed', kind: 'REUSE', at: new Date().toISOString(), data: { inputs: {} } } };
  await new WorketAIClient(() => ({ ...configs[1], development: true })).uploadSample(seed);
  await panel.locator('#sync-improvement').click();
  await panel.locator('[data-delete-confirm="destination"]').locator('xpath=ancestor::details').locator('summary').click();
  await panel.locator('[data-delete-confirm="destination"]').fill('删除样本');
  await app.evaluate(() => { globalThis.qaArm = true; });
  await panel.locator('[data-delete-sample="destination"]').click(); await waiting();
  await configure(configs[1]); await app.evaluate(async () => { globalThis.qaRelease(); while (globalThis.qaCollector.busy) await new Promise(r => setTimeout(r, 20)); });
  assert.deepEqual(requests, [['POST'], ['POST']], 'deletion must not move to another service');
  assert.equal((await samples()).find(s => s.id === 'destination').state, 'DELETE_PENDING');
  await panel.evaluate(() => window.workpet.distillation('stopImprovement')); await configure(configs[0]);
  await panel.evaluate(() => window.workpet.distillation('syncImprovement'));
  assert.deepEqual(requests, [['POST', 'DELETE'], ['POST']]);
  assert.equal((await samples()).find(s => s.id === 'destination').state, 'DELETED');
  report.checks.deleteOriginalDespiteOptOut = true;
  report.requestMethods = requests; assert.equal(report.actualProviderCalls, 0); report.status = 'PASSED';
} catch (error) { report.status = 'FAILED'; report.error = error.message; process.exitCode = 1; if (panel) await panel.screenshot({ path: join(output, 'failure.png') }).catch(() => {}); }
finally { await app?.close().catch(() => {}); for (const service of servers) await service.close(); writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)); }
