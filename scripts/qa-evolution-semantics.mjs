// New synthetic semantic trials through real Electron, HTTP, model, review and immutable versions.
// Expected behavior is evaluated locally only; it is never included in model messages.
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { _electron as electron } from 'playwright';
import { createWorkCore } from '../dist/core/index.js';
import { createAIService } from '../server/service.mjs';
const { semanticCases, semanticBaseline } = await import(process.env.WORKET_SEMANTIC_SUITE === 'obligations' ? './lib/obligation-semantic-cases.mjs' : './lib/evolution-semantic-cases.mjs');
import { recordedModelProvider } from './lib/recorded-model-provider.mjs';
import { contractReplay } from './lib/contract-replay.mjs';
assert.ok(process.env.WORKET_SEMANTIC_REPLAY_ROOT || process.env.WORKET_SEMANTIC_LIVE === '1', 'Select replay or explicitly set WORKET_SEMANTIC_LIVE=1');
const run = new Date().toISOString().replace(/[:.]/g, '-');
const output = join(process.cwd(), 'output/evolution-semantics', run); mkdirSync(output, { recursive: true });
const summary = { run, kind: process.env.WORKET_SEMANTIC_REPLAY_ROOT ? 'frozen synthetic model responses + desktop; no new semantic measurement' : 'new synthetic sources, real model + desktop; not blind or business acceptance', status: 'RUNNING', cases: [] };
const selected = process.env.WORKET_SEMANTIC_CASE ? semanticCases.filter(c => c.id === process.env.WORKET_SEMANTIC_CASE) : semanticCases;
assert.ok(selected.length, 'unknown semantic case');
for (const trial of selected) {
  const out = join(output, trial.id); mkdirSync(out);
  const directory = mkdtempSync(join(tmpdir(), 'worket-semantic-'));
  const core = createWorkCore({ databasePath: join(directory, 'workpet.sqlite') });
  const draft = { id: randomUUID(), revision: 1, content: structuredClone(semanticBaseline), originalContent: structuredClone(semanticBaseline), refs: [], issues: [], resolutions: [] };
  core.definitions.db.prepare('INSERT INTO definition_drafts VALUES (?,?)').run(draft.id, JSON.stringify(draft));
  core.definitions.db.prepare('INSERT INTO review_events VALUES (?,?,?)').run('synthetic-baseline', draft.id, JSON.stringify({ type: 'QA_BASELINE', synthetic: true, content: semanticBaseline }));
  const definition = core.definitions.publish({ draftId: draft.id, expectedRevision: 1, materialBindings: {}, commandId: randomUUID() });
  const workIds = [];
  for (const [index, conversation] of trial.conversations.entries()) {
    const work = core.createWorkFromDefinition({ definitionId: definition.id, inputs: { script: `全新脚本 ${index + 1}` }, referenceExampleIds: [], commandId: randomUUID() });
    workIds.push(work.instance.id);
    core.startExecutionEpisode(work.instance.id, { executor: { type: 'AGENT', name: 'Codex QA' }, environment: { type: 'CODEX_DESKTOP', name: 'Codex QA' }, source: { adapter: 'codex', conversationId: randomUUID() } });
    const offset = core.getWork(work.instance.id).sourceArchive.length;
    core.appendSourceEvents(work.instance.id, conversation.map((event, index) => ({ externalId: randomUUID(), sequence: offset + index + 1, ...event, timestamp: new Date().toISOString(), executorType: event.kind === 'user.prompt' ? 'HUMAN' : 'AGENT', environmentType: 'CODEX_DESKTOP', metadata: {}, artifactRefs: [] })));
  }
  core.close();
  const replayRoot = process.env.WORKET_SEMANTIC_REPLAY_ROOT;
  const replay = replayRoot ? contractReplay(join(replayRoot, trial.id)) : null;
  const live = replay ? null : recordedModelProvider({ directory: out, maxCalls: 2 });
  let replayCalls = 0;
  const provider = live ?? { model: 'frozen-semantic-trial', usages: [], get calls() { return 0; }, async call(messages) {
    const response = replay(messages, ++replayCalls);
    writeFileSync(join(out, `request-${replayCalls}.json`), JSON.stringify(messages, null, 2));
    writeFileSync(join(out, `response-${replayCalls}.json`), JSON.stringify(response, null, 2));
    return response;
  } };
  const secret = randomUUID();
  const service = createAIService({ mode: 'development', devSecret: secret, issuer: 'qa', audience: 'qa', provider, providerName: '真实模型语义验收', limits: { dailyCalls: 2 } });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ sub: 'qa-semantic', iss: 'qa', aud: 'qa', exp: Date.now() / 1000 + 3600 })).toString('base64url');
  const token = `${header}.${body}.${createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')}`;
  const report = { id: trial.id, status: 'RUNNING', packaged: !!process.env.WORKPET_EXECUTABLE_PATH, credentialStorage: process.env.WORKPET_EXECUTABLE_PATH ? 'isolated mock keychain; OS approval not tested' : 'OS safeStorage', directory, output: out, actualProviderCalls: 0, usage: [], humanAcceptance: false };
  let app, panel;
  try {
    app = await electron.launch({ executablePath: process.env.WORKPET_EXECUTABLE_PATH ?? join(process.cwd(), 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: [...(process.env.WORKPET_EXECUTABLE_PATH ? ['--use-mock-keychain'] : ['.']), `--user-data-dir=${directory}`, '--dev'], timeout: 30000, cwd: process.cwd(), env: { ...process.env, WORKPET_SKIP_INTEGRATIONS: '1', WORKPET_DATA_DIR: directory, WORKPET_BRIDGE_CONFIG: join(directory, 'bridge.json') } });
    const until = Date.now() + 15000;
    while (!panel && Date.now() < until) { panel = app.windows().find(p => p.url().endsWith('/panel.html')); if (!panel) await new Promise(r => setTimeout(r, 100)); }
    assert.ok(panel); panel.setDefaultTimeout(15000);
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/panel.html')); w.setSize(760, 820); w.show(); });
    await panel.evaluate(({ url, token }) => window.workpet.configureWorketService({ url, token }), { url: `http://127.0.0.1:${service.server.address().port}`, token });
    await panel.locator('#tab-definitions').click(); await panel.locator(`[data-definition="${definition.id}"]`).click();
    await panel.locator('#evolve-definition').click();
    for (const id of workIds) await panel.locator(`[data-evolution-work="${id}"]`).check();
    await panel.locator('#prepare-evolution').click(); await panel.locator('#improvement-consent').uncheck(); await panel.locator('#consent').check();
    await panel.locator('#start-distillation').click();
    let job; const deadline = Date.now() + 420000;
    while (Date.now() < deadline) {
      [job] = await panel.evaluate(() => window.workpet.distillation('jobs'));
      if (job && ['AWAITING_REVIEW', 'FAILED', 'INTERRUPTED', 'NEEDS_SELECTION'].includes(job.status)) break;
      await new Promise(r => setTimeout(r, 1000));
    }
    writeFileSync(join(out, 'job.json'), JSON.stringify(job, null, 2));
    assert.equal(job?.status, 'AWAITING_REVIEW', job?.error);
    const candidate = await panel.evaluate(id => window.workpet.distillation('draft', { id }), job.draftId);
    writeFileSync(join(out, 'draft.json'), JSON.stringify(candidate, null, 2));
    const verdict = trial.verify(candidate); report.semantic = verdict;
    await panel.evaluate(async id => (await import('./distillation.js')).openJob(id), job.id);
    await panel.locator('#evolution-summary').waitFor();
    const contextRule = ['constraints', 'deliverables', 'methods'].flatMap(section => candidate.content[section].map(item => ({ section, item }))).find(({ item }) => item.basis.refs?.some(ref => ref.role === 'CONTEXT'));
    if (contextRule) {
      await panel.locator(`[data-review-action="evidence"][data-address="${contextRule.section}.${contextRule.item.key}"]`).click();
      assert.match(await panel.locator('body').innerText(), /背景引用/);
      assert.match(await panel.locator('body').innerText(), /直接依据/);
    }
    await panel.screenshot({ path: join(out, 'review.png') });
    if (verdict.expected === 'BLOCK') {
      assert.ok(await panel.locator('#publish-definition').isDisabled(), 'unresolved conflict blocks actual UI publication');
      const versions = await panel.evaluate(key => window.workpet.distillation('versions', { key }), definition.definitionKey);
      assert.equal(versions.length, 1);
      // A separate synthetic user decision resolves the conflict AFTER checking the block.
      // This choice never goes to the model and is not evidence of model correctness.
      for (const issue of candidate.issues.filter(i => candidate.evolution.changes.some(c => c.kind === 'CONFLICT' && c.address === i.field))) {
        const button = panel.locator(`[data-review-action="exclude"][data-issue="${issue.id}"]`);
        if (await button.count()) await button.click();
      }
      await panel.locator('#edit-all').click();
      await panel.locator('[data-text][data-address="constraints.instagram_limit"]').fill('平台文案不超过 30 words。');
      for (const issue of candidate.issues.filter(i => i.field === 'constraints.instagram_limit'))
        await panel.locator(`[data-review-action="adopt"][data-issue="${issue.id}"]`).click();
      await panel.locator('#edit-all').click();
      report.reviewDecision = 'Synthetic user explicitly chooses 30 words after the unresolved conflict was blocked';
    }
    {
      // Only explicitly undecided proposals may be declined here; never manufacture missing rules.
      if (verdict.expected === 'REVIEW_PROPOSALS') {
        for (const issue of candidate.issues.filter(i => i.blocking)) {
          const target = candidate.content[issue.field.split('.')[0]]?.find?.(i => i.key === issue.field.split('.')[1]);
          assert.ok(target && target.rule?.status === 'PROPOSED', `unexpected issue cannot be auto-resolved: ${issue.message}`);
          const button = panel.locator(`[data-review-action="exclude"][data-issue="${issue.id}"]`);
          if (await button.count()) await button.click();
        }
      }
      for (const issue of candidate.issues.filter(i => !i.blocking)) {
        const button = panel.locator(`[data-review-action="accept"][data-issue="${issue.id}"]`); if (await button.count()) await button.click();
      }
      assert.ok(await panel.locator('#publish-definition').isEnabled(), 'unexpected blocking questions remain');
      await panel.locator('#publish-definition').click(); await panel.locator('#use-definition').waitFor();
      await panel.locator('#use-definition').click(); await panel.locator('[data-input="script"]').fill('下一期完全不同的脚本'); await panel.locator('#create-defined-work').click();
      const id = (await panel.evaluate(() => window.workpet.getDashboard())).selectedWorkId;
      const pkg = await panel.evaluate(workId => window.workpet.distillation('package', { workId }), id);
      writeFileSync(join(out, 'package.json'), JSON.stringify(pkg, null, 2));
      assert.equal(pkg.json.definition.version, verdict.expectedVersion ?? 2);
      // Export already contains effective rules; do not resolve its historical graph twice.
      const effectiveRows = ['deliverables','constraints','acceptanceCriteria','methods'].flatMap(section => pkg.json.definition.content[section].map(item => ({address:section+'.'+item.key,text:item.text})));
      trial.verifyPackage?.(pkg.json.definition.content, (pkg.json.acceptanceChecks ?? []).map(check => ({...check,text:effectiveRows.find(row=>row.address===check.rule)?.text ?? ''})));
      if (trial.verifyAcceptance) {
        await panel.locator('[data-action="complete"]').click();
        const labels = await panel.locator('[data-criterion]').evaluateAll(elements => elements.map(element => [...element.parentElement.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent).join('').trim()));
        trial.verifyAcceptance(labels); report.acceptanceLabels=labels;
        await panel.locator('#definition-dialog [data-close]').click();
      } assert.match(pkg.markdown, /下一期完全不同的脚本/);
      if (verdict.expected === 'BLOCK') {
        assert.match(pkg.markdown, /30 words/); assert.ok(!pkg.markdown.includes('50 words')); assert.ok(!pkg.markdown.includes('70 words'));
      }
      assert.ok(!pkg.markdown.includes('全新脚本 1'));
      const old = await panel.evaluate(workId => window.workpet.distillation('package', { workId }), workIds[0]);
      assert.equal(old.json.definition.version, 1);
    }
    report.status = 'PASSED';
  } catch (error) {
    report.status = 'FAILED'; report.error = error.message;
    if (panel) { await panel.screenshot({ path: join(out, 'failure.png') }).catch(() => {}); writeFileSync(join(out, 'failure-dom.txt'), await panel.locator('body').innerText().catch(() => '')); }
  } finally {
    report.actualProviderCalls = provider.calls; report.usage = provider.usages;
    writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2)); summary.cases.push(report);
    console.log(JSON.stringify(report));
    await app?.close(); await service.close();
  }
}
summary.status = summary.cases.every(c => c.status === 'PASSED') ? 'PASSED' : 'FAILED';
writeFileSync(join(output, 'report.json'), JSON.stringify(summary, null, 2)); console.log(JSON.stringify(summary));
process.exitCode = summary.status === 'PASSED' ? 0 : 1;
