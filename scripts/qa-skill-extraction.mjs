// Bounded semantic trial. Raw sources and provider responses remain unmodified.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { extractDefinition } from '../server/workflow.mjs';
import { recordedModelProvider } from './lib/recorded-model-provider.mjs';
import { contractReplay } from './lib/contract-replay.mjs';
assert.ok(process.env.WORKET_SKILL_LIVE === '1' || process.env.WORKET_SKILL_REPLAY, 'Explicitly choose live or replay');
const run = new Date().toISOString().replace(/[:.]/g, '-'), directory = join(process.cwd(), 'output/skill-extraction', run); mkdirSync(directory, { recursive: true });
const text = '以后同类报告都使用 Report Builder skill，根据每次给的新主题写 Markdown 报告，每条事实注明来源。本次主题是城市交通。我这次临时用 csv-cleaner 清理数据，仅限本次；以后不用固定这个工具。Report Builder 的技能目录会由我在本机选择，不要把它内部的执行步骤变成我的报告约束。';
const request = { schemaVersion: 1, ruleSchemaVersion: 1, evidenceSchemaVersion: 1, skillSchemaVersion: 1, snapshotHash: createHash('sha256').update(text).digest('hex'), sources: [{ key: 'work-1', events: [{ key: 'event-1', sequence: 1, kind: 'user.prompt', content: text, hash: createHash('sha256').update(text).digest('hex') }] }] };
writeFileSync(join(directory, 'wire.json'), JSON.stringify(request, null, 2));
const replay = process.env.WORKET_SKILL_REPLAY ? contractReplay(process.env.WORKET_SKILL_REPLAY) : null;
let count = 0;
const provider = replay ? { model: 'frozen-skill-trial', calls: 0, usages: [], async call(messages) { const result = replay(messages, ++count); writeFileSync(join(directory, `request-${count}.json`), JSON.stringify(messages, null, 2)); writeFileSync(join(directory, `response-${count}.json`), JSON.stringify(result, null, 2)); return result; } } : recordedModelProvider({ directory, maxCalls: 2 });
const report = { run, status: 'RUNNING', kind: replay ? 'frozen semantic replay; not a new quality measurement' : 'synthetic source, actual provider through production extraction workflow; not blind or business acceptance', providerCalls: 0, usage: [] };
try {
  const result = await extractDefinition(request, provider, new AbortController().signal);
  writeFileSync(join(directory, 'result.json'), JSON.stringify(result, null, 2));
  const skills = result.content.materialRoles.filter(role => role.kind === 'SKILL');
  assert.equal(skills.length, 1); assert.match(skills[0].text, /Report Builder/i); assert.equal(skills[0].required, true);
  assert.ok(!result.content.materialRoles.some(role => /csv-cleaner/i.test(role.text)));
  assert.ok(!result.content.constraints.some(rule => /csv-cleaner|SKILL\.md/i.test(rule.text)));
  assert.equal(result.content.inputs.filter(input => /主题/.test(input.text)).length, 1, 'one generic input role, not a second field for the historical value');
  assert.ok(!result.content.inputs.some(input => /城市交通/.test(JSON.stringify({ text: input.text, choices: input.choices, defaultValue: input.defaultValue }))), 'instance value must not leak into reusable input specifications');
  assert.ok(!result.content.constraints.some(rule => /转化|变成|固定.*工具|技能内部/.test(rule.text)), 'extraction instructions must not become execution constraints');
  assert.ok(!result.content.constraints.some(rule => /城市交通/.test(rule.text)));
  report.status = 'PASSED';
} catch (error) { report.status = 'FAILED'; report.error = error instanceof Error ? error.message : String(error); process.exitCode = 1; }
finally { report.providerCalls = provider.calls; report.usage = provider.usages; writeFileSync(join(directory, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)); }
