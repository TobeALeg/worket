import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createWorkCore } from '../../dist/core/index.js';
import { effectiveRules, ruleItems } from '../../dist/contracts/rules.js';
import { verifyReplay } from './contract-replay.mjs';

export function replayEvolution(directory, messages, call) {
  verifyReplay(directory);
  const recorded = JSON.parse(readFileSync(join(directory, `request-${call}.json`), 'utf8'));
  const oldInput = JSON.parse(recorded[1].content), current = JSON.parse(messages[1].content);
  // Fixture-local definition hashes include random source identities. Rebind only that
  // opaque identity after verifying all contract text/specs, new evidence and intermediates.
  const priorHash = oldInput.baseline?.contentHash;
  if (priorHash) oldInput.baseline.contentHash = current.baseline?.contentHash;
  assert.deepEqual(current, oldInput, 'evolution replay input changed');
  const response = JSON.parse(readFileSync(join(directory, `response-${call}.json`), 'utf8'));
  if (priorHash && response.result.evolution) {
    assert.equal(response.result.evolution.baseHash, priorHash);
    response.result.evolution.baseHash = current.baseline.contentHash;
  }
  return response;
}

export async function qaContractEvolution({ panel, directory, definition, oldId, mark, output }) {
  const append = (workId, text) => {
    const core = createWorkCore({ databasePath: join(directory, 'workpet.sqlite') });
    try {
      const work = core.getWork(workId);
      const capture = { executor: { type: 'AGENT', name: 'Codex QA' }, environment: { type: 'CODEX_DESKTOP', name: 'Codex QA' }, source: { adapter: 'codex', conversationId: randomUUID() } };
      if (work.instance.status !== 'OPEN') core.resumeWork(workId, capture);
      else if (!work.activeBinding) core.startExecutionEpisode(workId, capture);
      core.appendSourceEvents(workId, [{ externalId: randomUUID(), sequence: core.getWork(workId).sourceArchive.length + 1,
        kind: 'user.prompt', content: text, timestamp: new Date().toISOString(), executorType: 'HUMAN', environmentType: 'CODEX_DESKTOP', metadata: {}, artifactRefs: [] }]);
    } finally { core.close(); }
  };
  const compare = async (base, workId, text) => {
    append(workId, text);
    await panel.locator('#tab-definitions').click(); await panel.locator(`[data-definition="${base.id}"]`).click();
    await panel.locator('#evolve-definition').click(); await panel.locator(`[data-evolution-work="${workId}"]`).check();
    await panel.locator('#prepare-evolution').click(); await panel.locator('#improvement-consent').uncheck(); await panel.locator('#consent').check();
    await panel.locator('#start-distillation').click();
    let job;
    const deadline = Date.now() + 420000;
    while (Date.now() < deadline) {
      [job] = await panel.evaluate(() => window.workpet.distillation('jobs'));
      if (job && ['AWAITING_REVIEW', 'FAILED', 'NEEDS_SELECTION', 'INTERRUPTED', 'CANCELLED'].includes(job.status)) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    assert.equal(job?.status, 'AWAITING_REVIEW', job?.error);
    const draft = await panel.evaluate(id => window.workpet.distillation('draft', { id }), job.draftId);
    assert.equal(draft.issues.filter(i => i.blocking).length, 0, 'real incremental candidate requires investigation; no fabricated resolutions');
    await panel.evaluate(async id => { const module = await import('./distillation.js'); await module.openJob(id); }, job.id);
    await panel.locator('#evolution-summary').waitFor();
    return draft;
  };
  const publish = async draft => {
    for (const issue of draft.issues) {
      const button = panel.locator(`[data-review-action="accept"][data-issue="${issue.id}"]`);
      if (await button.count()) await button.click();
    }
    await panel.locator('#publish-definition').click(); await panel.locator('#use-definition').waitFor();
    return (await panel.evaluate(() => window.workpet.distillation('definitions'))).items.find(d => d.definitionKey === definition.definitionKey);
  };
  const draft = await compare(definition, oldId,
    '以后这类视频的平台文案上限从 30 words 改成 20 words，其他已有要求保持。以后每期还要提供逐句的中英双语字幕。仍然交付 MP4。本次只在 12 秒切换画面，这不是以后的视频规范。');
  writeFileSync(join(output, 'evolution-change-draft.json'), JSON.stringify(draft, null, 2));
  assert.deepEqual(draft.content.inputs, definition.content.inputs);
  assert.deepEqual(draft.content.purpose, definition.content.purpose);
  const rules = ruleItems(effectiveRules(draft.content).content);
  assert.equal(rules.filter(r => /20|二十/.test(r.item.text)).length, 1);
  assert.ok(!rules.some(r => /30|三十|12\s*秒/.test(r.item.text)));
  assert.ok(rules.some(r => /中英|双语/.test(r.item.text) && /字幕/.test(r.item.text)));
  assert.equal(rules.filter(r => /MP4/.test(r.item.text)).length, 1);
  await panel.screenshot({ path: join(output, '05-evolution-diff.png') });
  const next = await publish(draft); assert.equal(next.version, definition.version + 1);
  assert.ok(next.materials.some(m => m.hash === definition.materials[0].hash));
  const previous = await panel.evaluate(workId => window.workpet.distillation('package', { workId }), oldId);
  assert.ok(previous.markdown.includes('30 words'));
  await panel.locator('#use-definition').click();
  for (const input of next.content.inputs) await panel.locator(`[data-input="${input.key}"]`).fill('全新脚本：讲解运动。');
  await panel.locator('#create-defined-work').click();
  const newId = (await panel.evaluate(() => window.workpet.getDashboard())).selectedWorkId;
  const pkg = await panel.evaluate(workId => window.workpet.distillation('package', { workId }), newId);
  writeFileSync(join(output, 'evolution-package.md'), pkg.markdown);
  assert.match(pkg.markdown, /20|二十/); assert.ok(!pkg.markdown.includes('30 words'));
  mark('new interactions → explicit delta review → new version/input instance; fixed material and old version preserved');

  const repeated = await compare(next, newId, '以后仍然交付 MP4，平台文案不超过 20 words，并提供逐句的中英双语字幕。没有其他新增或修改要求。');
  writeFileSync(join(output, 'evolution-duplicate-draft.json'), JSON.stringify(repeated, null, 2));
  assert.equal(repeated.evolution.changes.length, 0, 'repeated requirements must not grow the contract');
  assert.ok(repeated.evolution.evidence.length > 0);
  await panel.screenshot({ path: join(output, '06-evolution-evidence.png') });
  const same = await publish(repeated); assert.equal(same.id, next.id);
  const history = await panel.evaluate(definitionId => window.workpet.distillation('evolutionHistory', { definitionId }), same.id);
  assert.equal(history.length, 2);
  const sources = await panel.evaluate(definitionId => window.workpet.distillation('evolutionSources', { definitionId }), same.id);
  assert.equal(sources.find(s => s.workId === newId).count, 0);
  await panel.locator('#evolution-evidence > summary').click();
  await panel.locator('[data-evolution-evidence]').first().click();
  await panel.locator('#evolution-evidence pre').waitFor();
  assert.match(await panel.locator('#evolution-evidence pre').first().innerText(), /MP4/);
  mark('repeat-only interaction → evidence confirmed without new version; confirmed events are not resubmitted');
}
