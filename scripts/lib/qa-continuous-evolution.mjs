import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createWorkCore } from '../../dist/core/index.js';
import { result } from '../../test/distillation/fixtures.ts';
const instruction = '以后每期视频还需交付纯文本字幕。';

// Controlled protocol fixture, not a live model result or semantic quality measurement.
export function continuousFixture(messages) {
  const input = JSON.parse(messages[1].content);
  if (input.phase === 'extract') {
    assert.equal(input.events.filter(e => e.kind === 'user.prompt').length, 1);
    assert.ok(input.events.some(e => e.content === instruction));
    assert.ok(!input.events.some(e => e.kind === 'file.content' || e.kind === 'work.input_provided'));
    return { result: { requirements: [], issues: [], eventKeys: input.events.map(e => `${e.sourceKey}/${e.key}`) } };
  }
  const sources = input.sourceKeys.map(key => ({ key, events: input.evidence.filter(e => e.workId === key).map(e => ({ ...e, key: e.eventId })) }));
  const out = result({ sources }), evidence = input.evidence.find(e => e.content === instruction);
  assert.ok(evidence);
  out.content = null; out.requirements = [];
  out.evolution = { baseHash: input.baseline.contentHash, changes: [{ kind: 'ADD', section: 'deliverables', item: {
    key: 'plain_subtitles', text: '每期交付纯文本字幕。', rule: { scope: 'REUSABLE', status: 'ACTIVE' },
    basis: { type: 'SOURCE', origin: 'USER_STATED', refs: [{ snapshotId: 'wire', workId: evidence.workId, eventId: evidence.eventId, excerpt: instruction }] },
  } }] };
  return { result: out };
}
export async function qaContinuousEvolution({ panel, directory, definition, oldId, mark, output }) {
  const withCore = fn => {
    const core = createWorkCore({ databasePath: join(directory, 'workpet.sqlite') });
    try { return fn(core); } finally { core.close(); }
  };
  const append = text => withCore(core => {
    const capture = { executor: { type: 'AGENT', name: 'QA' }, environment: { type: 'CODEX_DESKTOP', name: 'QA' }, source: { adapter: 'codex', conversationId: randomUUID() } };
    const work = core.getWork(oldId);
    if (work.instance.status !== 'OPEN') core.resumeWork(oldId, capture);
    else if (!work.activeBinding) core.startExecutionEpisode(oldId, capture);
    core.appendSourceEvents(oldId, [{ externalId: randomUUID(), sequence: core.getWork(oldId).sourceArchive.length + 1, kind: 'user.prompt', content: text, timestamp: new Date().toISOString(), executorType: 'HUMAN', environmentType: 'CODEX_DESKTOP', metadata: {}, artifactRefs: [] }]);
  });
  append('开启前的这段历史不应自动发送。');
  await panel.locator('#tab-definitions').click(); await panel.locator(`[data-definition="${definition.id}"]`).click();
  await panel.locator('#continuous-evolution > summary').click();
  await panel.locator('#enable-continuous').click();
  assert.match(await panel.locator('#definition-error').innerText(), /确认持续比较/);
  await panel.locator('#continuous-consent').check(); await panel.locator('#enable-continuous').click();
  await panel.locator('#stop-continuous').waitFor();
  append(instruction);
  // Advance only the persisted idle observation in the isolated QA database. The app's
  // normal timer still selects the batch, dispatches HTTP and receives the review result.
  const deadline = Date.now() + 30000;
  let aged = false, job;
  while (Date.now() < deadline) {
    if (!aged) aged = withCore(core => {
      const db = core.definitions.db;
      const row = db.prepare('SELECT payload_json FROM continuous_evolution WHERE definition_key=?').get(definition.definitionKey);
      const value = JSON.parse(row.payload_json);
      if (!value.observed) return false;
      value.observedAt -= 120001;
      db.prepare('UPDATE continuous_evolution SET payload_json=? WHERE definition_key=?').run(JSON.stringify(value), definition.definitionKey);
      return true;
    });
    job = (await panel.evaluate(() => window.workpet.distillation('jobs'))).find(j => j.automatic);
    if (job && ['AWAITING_REVIEW', 'FAILED', 'INTERRUPTED'].includes(job.status)) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.equal(job?.status, 'AWAITING_REVIEW', job?.error);
  assert.equal((await panel.evaluate(key => window.workpet.distillation('versions', { key }), definition.definitionKey)).length, definition.version);
  append('待审期间继续讨论本次任务，不应再堆积一个候选。');
  await new Promise(resolve => setTimeout(resolve, 2500));
  assert.equal((await panel.evaluate(() => window.workpet.distillation('jobs'))).filter(j => j.automatic).length, 1);
  await panel.evaluate(async id => (await import('./distillation.js')).openJob(id), job.id);
  await panel.locator('#evolution-summary').waitFor();
  await panel.screenshot({ path: join(output, '07-continuous-review.png') });
  await panel.locator('#publish-definition').click(); await panel.locator('#use-definition').waitFor();
  const next = (await panel.evaluate(() => window.workpet.distillation('definitions'))).items.find(d => d.definitionKey === definition.definitionKey);
  assert.equal(next.version, definition.version + 1);
  await panel.locator('#continuous-evolution > summary').click(); await panel.locator('#stop-continuous').click();
  await panel.locator('#enable-continuous').waitFor();
  append('关闭后这段内容不应自动发送。');
  await new Promise(resolve => setTimeout(resolve, 2500));
  assert.equal((await panel.evaluate(() => window.workpet.distillation('jobs'))).filter(j => j.automatic).length, 1);
  await panel.screenshot({ path: join(output, '08-continuous-stopped.png') });
  mark('explicit future-only consent → persisted idle queue → real HTTP + controlled provider → one review → user-confirmed version → stopped; no live model call');
}
