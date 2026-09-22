import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createWorkCore } from '../../dist/core/index.js';
import { buildWorkPackage } from '../../dist/definitions/work-package.js';
import { evolutionBaseline } from '../../dist/definitions/evolution.js';
import { validateEvolution } from '../../dist/contracts/evolution.js';
import { skillContent, skillBasis, writeSkillFixture } from '../../scripts/lib/skill-fixture.mjs';
import { extractDefinition } from '../../server/workflow.mjs';
import { result } from './fixtures.ts';
const id = randomUUID;
function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'worket-skills-')), core = createWorkCore({ databasePath: join(directory, 'work.sqlite') });
  const content = structuredClone(skillContent), draft = core.definitions.saveDraft({ id: id(), revision: 1, content, originalContent: structuredClone(content), refs: [], issues: [], resolutions: [] });
  core.definitions.db.prepare('INSERT INTO review_events VALUES (?,?,?)').run(skillBasis.reviewEventId, draft.id, JSON.stringify({ type: 'QA_BASELINE', synthetic: true, content }));
  const path = join(directory, 'report-builder'); writeSkillFixture(path);
  const publish = (value = draft, materialBindings: Record<string,string> = { builder: path }) => core.definitions.publish({ draftId: value.id, expectedRevision: value.revision, materialBindings, commandId: id() });
  const create = (definition: any) => core.createWorkFromDefinition({ definitionId: definition.id, inputs: { subject: '本次新主题' }, referenceExampleIds: [], commandId: id() });
  return { directory, core, path, draft, publish, create };
}
test('skill directory remains executable with relative companions, version isolation and source deletion', () => {
  const f = setup();
  try {
    const alias = join(f.directory, 'installed-skill'); symlinkSync(f.path, alias);
    const d1 = f.publish(f.draft, { builder: alias }), w1 = f.create(d1), p1 = buildWorkPackage(w1, f.core.definitions);
    assert.equal(p1.skills.length, 1); assert.equal(p1.fixedMaterials.length, 0);
    assert.ok(existsSync(join(p1.skills[0].directory, 'assets/empty')), 'empty companion directories are preserved');
    assert.equal(p1.skills[0].files.length, 4); assert.equal(p1.skills[0].required, true);
    writeSkillFixture(f.path, '固定格式 v2');
    const draft = f.core.definitions.revise({ definitionId: d1.id, commandId: id() }), d2 = f.publish(draft);
    assert.equal(d2.version, 2); assert.notEqual(d2.materials[0].hash, d1.materials[0].hash);
    rmSync(f.path, { recursive: true });
    for (const [work, expected] of [[w1, '固定格式 v1'], [f.create(d2), '固定格式 v2']] as const) {
      const pkg = buildWorkPackage(work, f.core.definitions), output = join(f.directory, id()+'.md');
      execFileSync(process.execPath, [join(pkg.skills[0].directory, 'scripts/report.mjs'), pkg.inputs.subject as string, output]);
      assert.match(readFileSync(output, 'utf8'), /本次新主题/); assert.ok(readFileSync(output, 'utf8').includes(expected));
    }
    const baseline = evolutionBaseline(d2, d2.content); assert.equal(baseline.content.materialRoles[0].kind, 'SKILL');
    assert.ok(!JSON.stringify(baseline).includes(f.directory));
    const inherited = f.publish(f.core.definitions.revise({ definitionId: d2.id, commandId: id() }), {});
    assert.equal(inherited.id, d2.id, 'unchanged bundle does not create a duplicate version');
  } finally { f.core.close(); }
});
test('skill publication and dispatch reject missing, changed, extra or linked companion files', () => {
  const f = setup();
  try {
    assert.throws(() => f.publish(f.draft, {}), /MATERIAL_MISSING/);
    symlinkSync('/tmp', join(f.path, 'external')); assert.throws(() => f.publish(), /UNSUPPORTED_FILE/); unlinkSync(join(f.path, 'external'));
    const definition = f.publish(), work = f.create(definition), bundle = dirname(definition.materials[0].path), companion = join(bundle, 'references/format.md');
    const bytes = readFileSync(companion); unlinkSync(companion);
    assert.throws(() => buildWorkPackage(work, f.core.definitions), /MATERIAL_MISSING/);
    writeFileSync(companion, 'changed'); assert.throws(() => f.create(definition), /MATERIAL_MISSING/);
    writeFileSync(companion, bytes); writeFileSync(join(bundle, 'untracked.txt'), 'extra');
    assert.throws(() => buildWorkPackage(work, f.core.definitions), /MATERIAL_MISSING/);
    unlinkSync(join(bundle, 'untracked.txt')); assert.equal(buildWorkPackage(work, f.core.definitions).skills.length, 1);
    const draft = f.core.definitions.revise({ definitionId: definition.id, commandId: id() });
    delete draft.content.materialRoles[0].kind; f.core.definitions.write('definition_drafts', draft);
    assert.throws(() => f.publish(draft, {}), /MATERIAL_MISSING/, 'changing role kind requires a new binding');
    assert.ok(existsSync(bundle));
  } finally { f.core.close(); }
});
test('skill material classification is negotiated and Agent proposals require review', async () => {
  const request: any = { schemaVersion: 1, skillSchemaVersion: 1, snapshotHash: 'test', sources: [{ key: 'w', events: [{ key: 'e', sequence: 1, kind: 'user.prompt', content: '以后报告使用 Report Builder skill', hash: 'test' }] }] };
  const run = async (enabled: boolean, origin = 'USER_STATED') => {
    const input = structuredClone(request); if (!enabled) delete input.skillSchemaVersion;
    return extractDefinition(input, { model: 'controlled', async call(messages: any[]) {
      const body = JSON.parse(messages[1].content);
      if (body.phase === 'extract') return { result: { requirements: [], issues: [], eventKeys: ['w/e'] } };
      const value: any = result(input); value.content.materialRoles = [{ key: 'builder', text: 'Report Builder', required: true, kind: 'SKILL', basis: { type: 'SOURCE', origin, refs: [{ snapshotId: 'wire', workId: 'w', eventId: 'e' }] } }];
      return { result: value };
    } }, new AbortController().signal);
  };
  const accepted = await run(true); assert.equal(accepted.content.materialRoles[0].kind, 'SKILL'); assert.equal(accepted.versions.prompt, 'work-definition-v1.6');
  assert.ok(!accepted.issues.some((issue: any) => issue.field === 'materialRoles.builder'));
  await assert.rejects(run(false), /INVALID_MODEL_OUTPUT/);
  const proposed = await run(true, 'AGENT_PROPOSED'); assert.ok(proposed.issues.some((issue: any) => issue.field === 'materialRoles.builder' && issue.blocking));
  const baseline: any = { contentHash: 'baseline', content: structuredClone(accepted.content) };
  const incoming = structuredClone(accepted.content.materialRoles[0]); delete incoming.kind;
  assert.throws(() => validateEvolution({ baseHash: 'baseline', changes: [{ kind: 'DUPLICATE', section: 'materialRoles', target: 'materialRoles.builder', item: incoming }] }, baseline, new Set(['w/e'])), /INVALID_MODEL_OUTPUT/);
});

test('frozen real model trials preserve the failure and verify reusable input roles on the accepted response', async () => {
  const { contractReplay } = await import('../../scripts/lib/contract-replay.mjs');
  for (const name of ['input-value-leak', 'accepted']) {
    const directory = join(process.cwd(), 'test/fixtures/skill-extraction', name), request = JSON.parse(readFileSync(join(directory, 'wire.json'), 'utf8'));
    const replay = contractReplay(directory); let calls = 0;
    const value = await extractDefinition(request, { model: 'frozen', async call(messages: any[]) { return replay(messages, ++calls); } }, new AbortController().signal);
    assert.equal(calls, 2);
    assert.equal(value.content.materialRoles.filter((role: any) => role.kind === 'SKILL').length, 1);
    if (name === 'input-value-leak') {
      assert.ok(value.content.inputs.some((input: any) => input.text.includes('城市交通')), 'retain evidence of the original semantic failure');
      assert.ok(value.content.constraints.some((rule: any) => rule.text.includes('csv-cleaner')));
    } else {
      assert.equal(value.content.inputs.length, 1);
      assert.ok(!value.content.inputs.some((input: any) => /城市交通/.test(JSON.stringify({ text: input.text, defaultValue: input.defaultValue, choices: input.choices }))));
      assert.ok(!value.content.constraints.some((rule: any) => /csv-cleaner|转化|技能内部/.test(rule.text)));
    }
  }
});
