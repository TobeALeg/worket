// Opt-in integration probe: starts a real Codex task, then resumes it for a
// synthetic revision. It does not change Worket delivery behavior or its DB.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';

const binary = process.env.WORKET_PROBE_CODEX_BINARY;
if (!binary || !process.argv.includes('--run')) {
  console.error('Requires WORKET_PROBE_CODEX_BINARY and --run; this probe starts a real, metered Codex task.');
  process.exit(1);
}
const root = await mkdtemp('/private/tmp/worket-autostart-');
const evidencePath = join(root, 'evidence.json');
const evidence = {
  startedAt: new Date().toISOString(), binary: resolve(binary),
  version: execFileSync(binary, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(),
  root, threadId: null, turns: [], events: [], serverRequests: [],
  productionWorketModified: false, uiClicks: 0, status: 'RUNNING',
};
const save = () => writeFile(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
const log = (stage, details = {}) => console.log(JSON.stringify({ stage, ...details }));

class ProbeClient {
  constructor() {
    this.nextId = 1;
    this.pending = new Map();
    this.completed = new Map();
    this.waiters = new Map();
    this.child = spawn(binary, ['app-server', '--stdio'], {
      cwd: root, env: process.env, stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on('line', line => this.receive(line));
    // Diagnostics may contain local account data; never persist or print them.
    this.child.stderr.resume();
    this.child.on('error', error => this.fail(error));
    this.child.on('exit', (code, signal) => this.fail(new Error(`App-server exited: ${code}/${signal}`)));
  }
  fail(error) {
    this.failure = error;
    for (const pending of this.pending.values()) pending.reject(error);
    for (const waiter of this.waiters.values()) waiter.reject(error);
    this.pending.clear();
    this.waiters.clear();
  }
  send(message) { this.child.stdin.write(JSON.stringify(message) + '\n'); }
  request(method, params) {
    if (this.failure) return Promise.reject(this.failure);
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out; do not assume the request failed or resend it blindly`));
      }, 60_000);
      this.pending.set(id, {
        resolve: value => { clearTimeout(timer); resolve(value); },
        reject: error => { clearTimeout(timer); reject(error); },
      });
      this.send({ id, method, params });
    });
  }
  receive(line) {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.method && message.id !== undefined) {
      evidence.serverRequests.push({ method: message.method, at: new Date().toISOString() });
      // No automatic permission grants or synthetic user approval responses.
      this.send({ id: message.id, error: { code: -32601, message: 'Probe cannot grant approval or answer interactive requests' } });
      this.fail(new Error(`Interactive request requires handling: ${message.method}`));
      return;
    }
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
      return;
    }
    const { method, params } = message;
    if (['turn/started', 'turn/completed', 'thread/status/changed', 'error'].includes(method)) {
      const event = { at: new Date().toISOString(), method, threadId: params?.threadId,
        turnId: params?.turn?.id, status: params?.turn?.status ?? params?.status,
        ...(params?.turn?.error ? { error: params.turn.error } : {}),
        ...(method === 'error' ? { error: params?.error } : {}),
      };
      evidence.events.push(event);
      log(method, event);
    }
    if (method === 'item/completed' && ['agentMessage', 'commandExecution', 'fileChange'].includes(params?.item?.type)) {
      evidence.events.push({ at: new Date().toISOString(), method, threadId: params.threadId,
        turnId: params.turnId, itemType: params.item.type, status: params.item.status,
        ...(params.item.type === 'agentMessage' ? { text: params.item.text } : {}),
      });
    }
    if (method === 'turn/completed') {
      this.completed.set(params.turn.id, params.turn);
      this.waiters.get(params.turn.id)?.resolve(params.turn);
    }
  }
  async connect() {
    const result = await this.request('initialize', {
      clientInfo: { name: 'worket_autostart_probe', title: 'Worket automatic start validation', version: '0.1.0' },
    });
    this.send({ method: 'initialized', params: {} });
    return result;
  }
  async run(threadId, text) {
    const result = await this.request('turn/start', { threadId, input: [{ type: 'text', text }] });
    evidence.turns.push({ id: result.turn.id, acceptedStatus: result.turn.status });
    await save();
    log('start-accepted', { threadId, turnId: result.turn.id, status: result.turn.status });
    const turn = this.completed.get(result.turn.id) ?? await new Promise((resolve, reject) => {
      if (this.failure) return reject(this.failure);
      const timer = setTimeout(() => reject(new Error('Turn timed out after 180 seconds')), 180_000);
      this.waiters.set(result.turn.id, {
        resolve: value => { clearTimeout(timer); this.waiters.delete(result.turn.id); resolve(value); },
        reject: error => { clearTimeout(timer); this.waiters.delete(result.turn.id); reject(error); },
      });
    });
    evidence.turns.at(-1).completedStatus = turn.status;
    assert.equal(turn.status, 'completed', JSON.stringify(turn.error));
    return turn;
  }
  async close() {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    const exited = new Promise(resolve => this.child.once('exit', resolve));
    this.child.kill('SIGTERM');
    await exited;
    this.lines.close();
  }
}

const input = { requestId: randomUUID(), content: '今天的视频主题是海边散步，文字内容：听海浪，慢慢走。' };
await writeFile(join(root, 'input.json'), JSON.stringify(input, null, 2) + '\n');
await save();
log('probe-created', { root, evidencePath });
let client;
try {
  client = new ProbeClient();
  evidence.initialization = await client.connect();
  const started = await client.request('thread/start', {
    cwd: root, sandbox: 'workspace-write', approvalPolicy: 'on-request',
  });
  evidence.threadId = started.thread.id;
  evidence.model = started.model;
  await save();
  log('thread-created', { threadId: evidence.threadId, model: evidence.model });
  await client.run(evidence.threadId,
    '这是 Worket 自动启动接口的隔离验证，不是真实视频生产。只在当前工作目录操作，不联网、不访问其他目录、不调用插件或其他 Agent。读取 input.json，创建 draft.json，内容为 JSON 对象：requestId 原样取自输入，stage 为 draft，title 为 今日视频草稿，text 原样取自输入的 content。不要修改 input.json。完成后回复“草稿已生成，等待修改或验收”。到这里停止，不渲染视频、不登记最终交付、不自动进入下一步。');
  const draft = JSON.parse(await readFile(join(root, 'draft.json'), 'utf8'));
  assert.deepEqual(draft, { requestId: input.requestId, stage: 'draft', title: '今日视频草稿', text: input.content });
  evidence.draft = draft;
  evidence.draftVerifiedAt = new Date().toISOString();
  await save();
  log('draft-verified');
  await client.close();

  client = new ProbeClient();
  await client.connect();
  const resumed = await client.request('thread/resume', { threadId: evidence.threadId });
  assert.equal(resumed.thread.id, evidence.threadId);
  evidence.resumedSameThread = true;
  log('same-thread-resumed', { threadId: evidence.threadId });
  await client.run(evidence.threadId,
    '这是验证脚本模拟的中间修改意见：把 draft.json 的 title 改成 海边慢慢走，stage 改成 revised；保留 requestId 和 text，其他约束保持。修改后回复“已按意见修改，等待验收”，然后停止，不创建成片或提交交付。');
  const revised = JSON.parse(await readFile(join(root, 'draft.json'), 'utf8'));
  assert.deepEqual(revised, { ...draft, title: '海边慢慢走', stage: 'revised' });
  evidence.revised = revised;
  evidence.status = 'PASS_AUTOSTART_AND_RESUME';
} catch (error) {
  evidence.status = 'FAILED';
  evidence.error = error.message;
  process.exitCode = 1;
} finally {
  evidence.finishedAt = new Date().toISOString();
  await save();
  await client?.close();
  log('probe-finished', { status: evidence.status, evidencePath, threadId: evidence.threadId, error: evidence.error });
}
