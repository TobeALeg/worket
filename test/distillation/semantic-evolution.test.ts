import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractDefinition } from '../../server/workflow.mjs';
import { mergeEvolution } from '../../dist/definitions/evolution.js';
import { hash } from '../../dist/definitions/storage.js';
import { semanticCases, semanticBaseline } from '../../scripts/lib/evolution-semantic-cases.mjs';
import { contractReplay } from '../../scripts/lib/contract-replay.mjs';
const root = fileURLToPath(new URL('../fixtures/semantic-evolution', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
for (const entry of manifest.cases.filter(c => c.outcome !== 'SERVICE_FAILURE')) test(`semantic evolution frozen output: ${entry.id} (${entry.outcome})`, async () => {
  const directory = join(root, entry.id), replay = contractReplay(directory);
  const first = JSON.parse(JSON.parse(readFileSync(join(directory, 'request-1.json'), 'utf8'))[1].content);
  const final = JSON.parse(JSON.parse(readFileSync(join(directory, 'request-2.json'), 'utf8'))[1].content);
  const sources = [...new Set(first.events.map(e => e.sourceKey))].map(key => ({ key, events: first.events.filter(e => e.sourceKey === key).map(({ sourceKey, ...event }) => event) }));
  const request = { schemaVersion: 1, ruleSchemaVersion: 1, ...(entry.evidenceSchemaVersion ? { evidenceSchemaVersion: 1 } : {}), snapshotHash: hash(sources), sources, evolution: final.baseline };
  let calls = 0;
  const run = () => extractDefinition(request, { model: 'frozen-provider-response', async call(messages) { assert.ok(++calls <= 2); return replay(messages, calls); } }, new AbortController().signal);
  if (entry.outcome === 'INCOMPLETE_COVERAGE') await assert.rejects(run(), { code: 'INCOMPLETE_COVERAGE' });
  else {
    const result = await run();
    const merged = mergeEvolution({ content: structuredClone(semanticBaseline), contentHash: request.evolution.contentHash } as any, result);
    if (entry.outcome === "UNSUPPORTED_SOURCE") assert.ok(merged.issues.some(i => i.type === "UNSUPPORTED_SOURCE" && i.blocking));
    else {
      semanticCases.find(c => c.id === entry.scenario).verify(merged);
      if (entry.id === 'partial-adoption') for (const item of merged.content.constraints.filter(i => i.rule?.status === 'PROPOSED')) {
        const questions = merged.issues.filter(i => i.field === `constraints.${item.key}` && i.type === 'UNCERTAIN_GENERALIZATION');
        assert.equal(questions.length, 1, 'one adoption decision must not produce both a generic and a specific question');
        assert.ok(!questions[0].id.startsWith('evolution-'), 'retain the source-specific explanation');
      }
    }
  }
  assert.equal(calls, 2);
});
