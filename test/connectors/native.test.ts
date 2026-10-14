import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable, PassThrough } from 'node:stream';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { encodeFrame, runNativeHost } from '../../integrations/browser-native/host.mjs';
const origin = 'chrome-extension://' + 'a'.repeat(32) + '/';
test('native framing stages only selected data, exact paired origin; split frames and malformed frames are handled', async () => {
  const payload = { scope: 'SELECTED_CONTENT' }, frame = encodeFrame({ action: 'stage', payload }), output = new PassThrough();
  const chunks: Buffer[] = []; output.on('data', chunk => chunks.push(chunk));
  let called = 0;
  await runNativeHost({ input: Readable.from([frame.subarray(0, 2), frame.subarray(2, 8), frame.subarray(8)]), output, origins: [origin], origin, stage: async data => { called++; assert.deepEqual(data, payload); return { stagedId: 'synthetic', captured: false }; } });
  const reply = Buffer.concat(chunks); assert.equal(reply.readUInt32LE(0), reply.length - 4); assert.equal(JSON.parse(reply.subarray(4).toString()).captured, false); assert.equal(called, 1);
  await assert.rejects(runNativeHost({ input: Readable.from([]), output, origins: [origin], origin: origin.replace(/a/g, 'b'), stage() {} }), /UNPAIRED/);
  await assert.rejects(runNativeHost({ input: Readable.from([frame.subarray(0, 6)]), output, origins: [origin], origin, stage() {} }), /INCOMPLETE/);
  const huge = Buffer.alloc(4); huge.writeUInt32LE(2_000_000);
  await assert.rejects(runNativeHost({ input: Readable.from([huge]), output, origins: [origin], origin, stage() {} }), /TOO_LARGE/);
});
test('WorkBuddy and Qwen executable hooks time out and fail open when local bridge hangs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'worket-hook-timeout-')), server = createServer(() => {});
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const config = join(directory, 'bridge.json');
  await writeFile(config, JSON.stringify({ host: '127.0.0.1', port: (server.address() as { port: number }).port, token: 'synthetic' }));
  try {
    for (const script of ['integrations/workbuddy-marketplace/plugins/workpet/bridge/hook-proxy.mjs', 'integrations/executor-hooks/qwenwork-hook.mjs']) {
      const start = Date.now(), child = spawn(process.execPath, [resolve(script)], { env: { ...process.env, WORKPET_BRIDGE_CONFIG: config } });
      let stdout = ''; child.stdout.on('data', chunk => { stdout += chunk; });
      child.stdin.end(JSON.stringify({ session_id: 'synthetic', hook_event_name: 'UserPromptSubmit', prompt: 'synthetic' }));
      assert.equal(await new Promise(resolve => child.on('close', resolve)), 0); assert.ok(Date.now() - start < 6000); assert.ok(JSON.parse(stdout));
    }
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); }
});

test('MCP proxy allows slower context preparation while hook forwarding keeps a short deadline', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'worket-slow-mcp-'));
  const server = createServer(async (req, res) => {
    for await (const chunk of req) {}
    setTimeout(() => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ jsonrpc: '2.0', id: 7, result: { syntheticContext: true } })); }, 3000);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const config = join(directory, 'bridge.json'); await writeFile(config, JSON.stringify({ host: '127.0.0.1', port: (server.address() as { port: number }).port, token: 'synthetic' }));
  try {
    const child = spawn(process.execPath, [resolve('integrations/workbuddy-marketplace/plugins/workpet/bridge/mcp-proxy.mjs')], { env: { ...process.env, WORKPET_BRIDGE_CONFIG: config } });
    let stdout = ''; child.stdout.on('data', chunk => stdout += chunk);
    child.stdin.end(JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'get_work_context' } }) + '\n');
    assert.equal(await new Promise(resolve => child.on('close', resolve)), 0);
    assert.equal(JSON.parse(stdout).result.syntheticContext, true);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); }
});
test('Qwen test-scoped executable ignores unrelated sessions before transport and permits only initiated synthetic sessions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'worket-qwen-scope-')), calls: any[] = [];
  const server = createServer(async (req, res) => { let text = ''; for await (const chunk of req) text += chunk; calls.push(JSON.parse(text)); res.setHeader('Content-Type', 'application/json'); res.end('{}'); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const config = join(directory, 'bridge.json'), scope = join(directory, 'scope.json');
  await writeFile(config, JSON.stringify({ host: '127.0.0.1', port: (server.address() as { port: number }).port, token: 'synthetic' }));
  await writeFile(scope, JSON.stringify({ sessions: [], deliveries: [{ workId: 'synthetic-work', deliveryId: 'synthetic-delivery' }] }));
  async function submit(session_id: string, prompt: string) {
    const child = spawn(process.execPath, [resolve('integrations/executor-hooks/qwenwork-hook.mjs')], { env: { ...process.env, WORKPET_BRIDGE_CONFIG: config, WORKPET_QWEN_SCOPE: scope } });
    child.stdin.end(JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id, prompt }));
    assert.equal(await new Promise(resolve => child.on('close', resolve)), 0);
  }
  try {
    await submit('unrelated', 'synthetic unselected text'); assert.equal(calls.length, 0);
    await submit('selected', '[WORKPET:synthetic-work]\n[DELIVERY:synthetic-delivery]\nsynthetic task'); assert.equal(calls.length, 1);
    await submit('selected', 'synthetic updated requirement'); assert.equal(calls.length, 2);
    await submit('unrelated', 'synthetic other task'); assert.equal(calls.length, 2);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); }
});
