import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { extractDefinition } from '../../server/workflow.mjs';
import { effectiveRules, ruleItems } from '../../dist/contracts/rules.js';
import { hash } from '../../dist/definitions/storage.js';
import { contractReplay } from '../../scripts/lib/contract-replay.mjs';

const root = fileURLToPath(new URL('../fixtures/contracts/', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
for (const entry of manifest.cases) test(`frozen real response: ${entry.id} (${entry.outcome})`, async () => {
  const directory = join(root, entry.id), replay = contractReplay(directory);
  const messages = JSON.parse(readFileSync(join(directory, 'request-1.json'), 'utf8'));
  const events = JSON.parse(messages[1].content).events;
  const sources = [...new Set(events.map(e => e.sourceKey))].map(key => ({ key,
    events: events.filter(e => e.sourceKey === key).map(({ sourceKey, ...event }) => event),
  }));
  const request = { schemaVersion: 1, ruleSchemaVersion: 1, snapshotHash: hash(sources), sources };
  let calls = 0;
  const run = () => extractDefinition(request, { model: 'recorded-deepseek-flash',
    async call(input) { assert.ok(++calls <= 2); return replay(input, calls); },
  }, new AbortController().signal);
  if (entry.outcome === 'INVALID_SOURCE_REF') {
    await assert.rejects(run(), { code: 'INVALID_SOURCE_REF' });
  } else {
    const result = await run(), rules = ruleItems(effectiveRules(result.content).content);
    const limits = rules.filter(r => /50|五十/.test(r.item.text));
    // A recorded semantic error remains visible; this is not a passing quality score.
    assert.equal(limits.length, entry.outcome === 'REPEATED_LIMIT' ? 2 : 1);
    assert.ok(rules.some(r => r.item.document));
    assert.ok(!rules.some(r => /48/.test(r.item.text)));
    assert.equal(result.content.inputs.length, 1);
    assert.equal(result.content.inputs[0].required, true);
    assert.equal(result.content.inputs[0].defaultValue, undefined);
  }
  assert.equal(calls, 2);
});

test('replay refuses changed input instead of making an unrelated case pass', () => {
  const directory = join(root, 'video');
  const messages = JSON.parse(readFileSync(join(directory, 'request-1.json'), 'utf8'));
  const body = JSON.parse(messages[1].content); body.events[0].content += '新增要求';
  messages[1].content = JSON.stringify(body);
  assert.throws(() => contractReplay(directory)(messages, 1), /replay input differs/);
});
