import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppService } from '../../dist/app/app-service.js';
import { createWebExecutors } from '../../dist/connectors/web-executor.js';
import { normalizeSelectedContent } from '../../dist/connectors/selected-content.js';
import { currentSourceEvents } from '../../dist/core/source-revisions.js';
import { createQwenWorkExecutor } from '../../dist/adapters/qwenwork/executor.js';
import { SelectedContentInbox } from '../../dist/connectors/inbox.js';
const fixture = () => JSON.parse(readFileSync(new URL('../fixtures/connectors/selected-requirements.json', import.meta.url), 'utf8'));
function setup(path = join(mkdtempSync(join(tmpdir(), 'worket-connectors-')), 'work.sqlite')) {
  const delivered: string[] = [], extracted: any[] = [];
  const adapters = createWebExecutors({ openUrl: async () => {}, desktop: { async openApplication() {}, writeClipboard(text) { delivered.push(text); } } });
  const qwen = createQwenWorkExecutor({}); qwen.inspect = async () => {}; qwen.deliver = async request => { delivered.push(request.prompt); return { status: 'OPENED' }; }; adapters.push(qwen);
  const app = new AppService({ databasePath: path, executors: adapters, foreground: { async detect() { return null; } }, extractor: { async extract(input) { extracted.push(input); return {}; } } });
  return { app, delivered, extracted, adapters, path };
}
test('selected capture reaches extractor, revisions dedupe, switches tools, inline includes evidence, restart retains work', async () => {
  const s = setup(); let app = s.app;
  try {
    const input = fixture(), first = await app.importSelectedContent(input), id = first.selectedWork!.id;
    assert.equal(first.selectedWork!.captureStatus, 'selected');
    assert.equal(s.extracted.length, 1); assert.equal(s.extracted[0].events.length, 2);
    await app.importSelectedContent(input); assert.equal(s.extracted.length, 1);
    input.messages[0].content = '要求改为英文，并添加两周截止日期。';
    await app.importSelectedContent(input);
    assert.equal(s.extracted.length, 2);
    const effective = currentSourceEvents(app.core().getWork(id)!.sourceArchive);
    assert.equal(effective.filter(e => e.kind === 'user.prompt').length, 1);
    assert.match(effective.find(e => e.kind === 'user.prompt')!.content!, /英文/);
    await app.handoff(id, 'doubao-work'); const pending = app.core().getWork(id)!;
    assert.match(pending.activeBinding!.conversationId, /^pending:/); assert.equal(pending.packageReadAt, null);
    const prompt = s.delivered.at(-1)!; assert.match(prompt, /英文/); assert.match(prompt, /budget.xlsx/); assert.doesNotMatch(prompt, /请先调用 Worket MCP/);
    const response = { ...fixture(), adapterId: 'doubao-work', url: 'https://www.doubao.com/work/synthetic-target', conversationId: 'synthetic-target',
      messages: [{ id: 'u-target', role: 'user', content: prompt }, { id: 'a-target', role: 'assistant', content: '已收到英文和两周截止要求。' }] };
    const bound = await app.importSelectedContent(response); assert.equal(bound.selectedWork!.id, id); assert.equal(bound.selectedWork!.episodeCount, 2);
    assert.equal(app.core().getWork(id)!.packageReadAt, null, 'import is not an MCP read receipt');
    await assert.rejects(app.importSelectedContent(input), /已停止/);
    app.close(); const restored = setup(s.path); app = restored.app;
    await app.importSelectedContent(response); assert.equal(app.core().getWork(id)!.sourceArchive.length, bound.selectedWork!.eventCount);
    await app.handoff(id, 'coze-web'); assert.match(restored.delivered.at(-1)!, /英文/);
    assert.ok(restored.delivered.at(-1)!.length < prompt.length * 2, 'verified delivery bootstrap is not recursively copied');
    await app.cancelHandoff(id, '已确认未接手'); assert.equal(app.core().getWork(id)!.activeBinding!.adapter, 'doubao-work');
    const coze = restored.adapters.find(a => a.id === 'coze-web')!; coze.deliver = async () => { throw new Error('synthetic open failed'); };
    await assert.rejects(app.handoff(id, 'coze-web'), /synthetic open failed/); assert.equal(app.core().getWork(id)!.activeBinding!.adapter, 'doubao-work');
    app.archiveWork(id); await assert.rejects(app.importSelectedContent(response), /已停止/);
  } finally { app.close(); }
});
test('normalization rejects credentials, invalid roles, duplicate ids, oversized content; partial history stays partial', () => {
  const input = fixture(), thread = normalizeSelectedContent(input); assert.equal(thread.history, undefined);
  assert.equal(thread.events[0]!.metadata!.historyComplete, false);
  assert.throws(() => normalizeSelectedContent({ ...input, url: 'https://evil.example/chat' }), /站点/);
  assert.throws(() => normalizeSelectedContent({ ...input, url: 'https://secret@www.kimi.com/chat' }), /凭据/);
  assert.throws(() => normalizeSelectedContent({ ...input, messages: [{ role: 'system', content: 'private' }] }), /可见/);
  assert.throws(() => normalizeSelectedContent({ ...input, messages: [input.messages[0], input.messages[0]] }), /重复/);
  assert.throws(() => normalizeSelectedContent({ ...input, messages: [{ role: 'user', content: 'x'.repeat(1_000_001) }] }), /超过/);
  const clean = normalizeSelectedContent({ ...input, url: 'https://www.kimi.com/chat/test?token=secret#fragment' });
  assert.equal(clean.events[0]!.metadata!.sourceUrl, 'https://www.kimi.com/chat/test');
});
test('Qwen finite hook binds only initiated delivery, captures user events without full history, and rejects late events', async () => {
  const { app, delivered } = setup();
  try {
    assert.deepEqual(await app.syncHook('qwenwork', { session_id: 'unrelated', hook_event_name: 'UserPromptSubmit', prompt: 'not selected' }), { accepted: false, appendedCount: 0 });
    const id = (await app.importSelectedContent(fixture())).selectedWork!.id;
    await app.handoff(id, 'qwenwork');
    const payload = { session_id: 'qwen-synthetic', hook_event_name: 'UserPromptSubmit', prompt: delivered.at(-1)! };
    const result = await app.syncHook('qwenwork', payload); assert.equal(result.accepted, true);
    assert.equal((await app.syncHook('qwenwork', payload)).appendedCount, 0);
    assert.equal(app.core().getWork(id)!.activeBinding!.conversationId, 'qwen-synthetic');
    const event = app.core().getWork(id)!.sourceArchive.at(-1)!; assert.equal(event.metadata.captureScope, 'HOOK_EVENTS');
    const manual = await app.importSelectedContent({ schemaVersion: 1, adapterId: 'qwenwork', conversationId: 'qwen-synthetic', title: 'selected response', url: '', scope: 'SELECTED_CONTENT', messages: [{ id: 'visible-reply', role: 'assistant', content: 'synthetic manually selected reply' }] });
    assert.equal(manual.selectedWork!.id, id);
    const reply = app.core().getWork(id)!.sourceArchive.at(-1)!; assert.equal(reply.metadata.captureOrigin, 'DESKTOP_VISIBLE'); assert.equal(reply.metadata.captureScope, 'SELECTED_CONTENT');
    await app.handoff(id, 'kimi-work'); assert.equal((await app.syncHook('qwenwork', payload)).accepted, false);
  } finally { app.close(); }
});
test('inbox stages without capture, expires, and does not grant arbitrary operations', () => {
  let now = 1000; const inbox = new SelectedContentInbox(() => now), id = inbox.stage(fixture());
  assert.equal(inbox.list().length, 1); const input = inbox.read(id); input.messages[0].content = 'modified'; assert.notEqual(inbox.read(id).messages[0]!.content, 'modified');
  assert.throws(() => inbox.stage({ ...fixture(), scope: 'HOOK_EVENTS' }), /浏览器/);
  assert.throws(() => inbox.stage({ ...fixture(), adapterId: 'qwenwork', url: '' }), /桌面来源/);
  now += 600001; assert.throws(() => inbox.read(id), /过期/); assert.equal(inbox.list().length, 0);
});
test('failed extraction retries, queued imports serialize, and a stopped binding rejects late extraction results', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'worket-connector-race-')), 'work.sqlite');
  let fail = true, release: (() => void) | undefined, entered: (() => void) | undefined;
  const running = new Promise<void>(resolve => entered = resolve);
  const app = new AppService({ databasePath: path, executors: createWebExecutors({}), foreground: { async detect() { return null; } }, extractor: {
    async extract(input) {
      if (fail) { fail = false; throw new Error('synthetic extractor unavailable'); }
      entered!(); await new Promise<void>(resolve => release = resolve);
      return { constraints: [{ id: 'late-constraint', text: 'must not apply after stop', origin: 'SYSTEM_INFERRED', sourceMessageIds: [input.events[0]!.externalId] }] };
    },
  } });
  try {
    await assert.rejects(app.importSelectedContent(fixture()), /extractor unavailable/);
    const work = app.core().listWorks('OPEN')[0]!;
    assert.equal(work.sourceArchive.length, 2, 'authorized source persists despite strategy failure');
    const retry = app.importSelectedContent(fixture()); await running;
    app.archiveWork(work.instance.id); release!(); await retry;
    assert.equal(app.core().getWork(work.instance.id)!.state.constraints.length, 0, 'late extraction cannot update stopped work');
    await assert.rejects(app.importSelectedContent(fixture()), /已停止/);
  } finally { app.close(); }
});

test('explicit selection imports an earlier message before an existing overlap without marking missing history deleted', async () => {
  const { app } = setup();
  try {
    const input = fixture(); input.messages = [input.messages[1]];
    const id = (await app.importSelectedContent(input)).selectedWork!.id;
    await app.importSelectedContent(fixture());
    assert.equal(currentSourceEvents(app.core().getWork(id)!.sourceArchive).filter(event => event.kind === 'user.prompt').length, 1);
    await app.importSelectedContent(input);
    assert.equal(currentSourceEvents(app.core().getWork(id)!.sourceArchive).filter(event => event.kind === 'user.prompt').length, 1);
    assert.equal(app.core().getWork(id)!.sourceArchive.some(event => event.kind === 'source.absent'), false);
  } finally { app.close(); }
});
