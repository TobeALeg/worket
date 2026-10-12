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
