// Real Electron form -> IPC -> Codex App Server -> VideoCreator. Isolated Worket database.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { _electron as electron } from 'playwright';
import { DistillationService } from '../dist/distillation/service.js';
import { FixtureClient, source } from '../test/distillation/fixtures.ts';
import { createWorkCore } from '../dist/core/index.js';
const root = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'worket-local-desktop-'));
const output = join(root, 'reports', 'local-execution-2026-10-29'); mkdirSync(output, { recursive: true });
const project = '/Users/dandi/VideoCreator';
const basis = { type: 'USER_AUTHORED', reviewEventId: randomUUID() };
const item = (key, text) => ({ key, text, basis });
const content = { schemaVersion: 1, name: 'VideoCreator · 自动发起验证',
  purpose: item('purpose', '根据今日内容制作一份短视频脚本草稿，交给用户修改与验收。'),
  inputs: [{ ...item('subject', '今日内容'), valueType: 'TEXT', required: true }],
  deliverables: [item('script', '独立视频目录中的 script-draft.md 与 execution-proof.json')],
  constraints: [item('scope', '本次只验证脚本草稿；不制作视频、封面或配音，不发布，不修改既有项目文件或根目录规范。遵守项目 AGENTS.md。')],
  acceptanceCriteria: [item('review', '草稿包含今日内容，留下修改与验收节点。')], methods: [], materialRoles: [] };
const core = createWorkCore({ databasePath: join(directory, 'workpet.sqlite') });
const origin = source(core, 'VideoCreator 项目中按今日内容制作短视频草稿。');
core.appendSourceEvents(origin.instance.id, [{ externalId: randomUUID(), sequence: 2, kind: 'user.prompt', content: '使用项目默认工作区', timestamp: new Date().toISOString(), executorType: 'HUMAN', environmentType: 'CODEX_DESKTOP', metadata: { cwd: project }, artifactRefs: [] }]);
const snapshot = new DistillationService(core, new FixtureClient()).prepare({ workIds: [origin.instance.id], includedFileIds: [] });
const refs = [{ snapshotId: snapshot.id, workId: origin.instance.id, eventId: snapshot.sources[0].events[0].id, role: 'CONTEXT' }];
const draft = core.definitions.saveDraft({ id: randomUUID(), revision: 1, content, originalContent: structuredClone(content), refs, issues: [], resolutions: [] });
core.definitions.db.prepare('INSERT INTO review_events VALUES (?,?,?)').run(basis.reviewEventId, draft.id, JSON.stringify({ type: 'QA_BASELINE', content }));
const definition = core.definitions.publish({ draftId: draft.id, expectedRevision: 1, materialBindings: {}, commandId: randomUUID() }); core.close();
writeFileSync(join(output, 'session.json'), JSON.stringify({ directory, definitionId: definition.id }, null, 2));
const app = await electron.launch({ executablePath: join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: ['.', `--user-data-dir=${directory}`, '--dev'], cwd: root,
  env: { ...process.env, WORKPET_SKIP_INTEGRATIONS: '1', WORKPET_BRIDGE_CONFIG: join(directory, 'bridge.json'), WORKPET_DATA_DIR: directory, WORKET_CONNECTOR_ISOLATION: '1' } });
let panel;
try {
  for (let i = 0; i < 100; i++) { panel = app.windows().find(p => p.url().endsWith('/panel.html')); if (panel) break; await new Promise(r => setTimeout(r, 100)); }
  assert.ok(panel, 'panel opened');
  const errors = []; panel.on('pageerror', e => errors.push(e.message));
  await panel.evaluate(() => window.workpet.distillation('setImprovementPreference', { enabled: false }));
  await panel.locator('#tab-definitions').click();
  await panel.locator(`[data-definition="${definition.id}"]`).click();
  await panel.locator('#use-definition').click();
  await panel.locator('[data-input="subject"]').fill('做一条 15 秒的日常散步观察短视频：主题是“雨后路边的小水洼像镜子”。中文口播三句，附三段镜头建议。在 videos/20261029-worket-autostart/ 新建独立目录，若存在则递增 -02 等后缀；写 script-draft.md 和 execution-proof.json。proof 记录实际 cwd、所读规则的原始路径与固定副本路径、实际输出文件路径、阶段 awaiting_review。完成后停下等修改，不渲染、不发布。');
  assert.equal(await panel.locator('#choose-local-directory').count(), 0);
  assert.equal(await panel.locator('#local-directory').textContent(), project);
  await panel.locator('#local-project-fields summary').click();
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, join(project, 'docs/export-standard.md'));
  await panel.locator('#add-local-file').click();
  await panel.screenshot({ path: join(output, '01-start-form.png') });
  await panel.locator('#create-defined-work').click();
  await panel.locator('#local-status').waitFor({ timeout: 60000 });
  const dashboard = await panel.evaluate(() => window.workpet.getDashboard());
  const workId = dashboard.selectedWork.id;
  writeFileSync(join(output, 'session.json'), JSON.stringify({ directory, definitionId: definition.id, workId }, null, 2));
  console.log(JSON.stringify({ phase: 'started', workId, directory }));
  async function waitTurn() {
    for (let i = 0; i < 240; i++) {
      const r = await panel.evaluate(workId => window.workpet.localExecution('get', { workId }), workId);
      if (r.status === 'WAITING_APPROVAL') { writeFileSync(join(output, 'approval.json'), JSON.stringify(r.approvals, null, 2)); throw Error('Permission request requires review; see approval.json'); }
      if (['FAILED', 'UNKNOWN'].includes(r.status)) throw Error(JSON.stringify(r));
      if (r.status === 'TURN_ENDED') return r;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw Error('Turn timeout');
  }
  const first = await waitTurn();
  assert.ok(first.threadId); assert.ok(first.runtime); assert.equal(first.manifest.project.directory, project);
  assert.equal(first.manifest.projectMaterials.length, 2);
  writeFileSync(join(output, 'first-turn.json'), JSON.stringify(first, null, 2));
  await panel.waitForFunction(() => document.querySelector('#local-status')?.textContent.includes('本轮结束'));
  await panel.screenshot({ path: join(output, '02-evidence.png') });
  await panel.locator('#execution-followup').fill('修改刚才同一个 script-draft.md：保留三句口播，最后加一句拍摄备注“低机位靠近水面，注意脚下安全”。更新 execution-proof.json 的 revision 为 2，stage 仍为 awaiting_review。不要另建项目，不渲染、不发布。');
  await panel.locator('#continue-execution').click();
  const second = await waitTurn();
  assert.equal(second.threadId, first.threadId); assert.equal(second.manifestHash, first.manifestHash);
  assert.notEqual(second.turnId, first.turnId); assert.equal(second.events.filter(e => e.kind === 'follow-up').length, 1);
  writeFileSync(join(output, 'second-turn.json'), JSON.stringify(second, null, 2));
  await panel.waitForFunction(() => document.querySelector('#local-status')?.textContent.includes('本轮结束'));
  await panel.screenshot({ path: join(output, '03-revision.png') });
  await panel.locator('#window-back').click();
  await panel.locator('#tab-definitions').click();
  await panel.locator(`[data-definition="${definition.id}"]`).click();
  await panel.locator('#use-definition').click();
  assert.equal(await panel.locator('#local-directory').textContent(), project);
  assert.match(await panel.locator('#local-files').textContent(), /export-standard.md/);
  await panel.screenshot({ path: join(output, '04-remembered-project.png') });
  assert.equal(errors.length, 0, errors.join('\n'));
  const final = await panel.evaluate(workId => window.workpet.getDashboard(workId), workId);
  assert.equal(final.selectedWork.status, 'OPEN');
  console.log(JSON.stringify({ phase: 'passed', workId, threadId: first.threadId, firstTurn: first.turnId, secondTurn: second.turnId, directory, errors }));
} finally { await app.close(); }
