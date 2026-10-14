import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { installQwenWorkIntegration } from '../../dist/adapters/qwenwork/install.js';
test('explicit Qwen scoped setup preserves unrelated hooks; generated command transports only selected events', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'worket-qwen-setup-')), root = join(directory, "qwen root's folder"), calls: any[] = [];
  await mkdir(root); const settings = join(root, 'settings.json');
  const foreign = { hooks: [{ type: 'command', command: 'echo synthetic-existing-hook' }] };
  await writeFile(settings, JSON.stringify({ hooks: { UserPromptSubmit: [foreign], Stop: [foreign] }, appearance: { theme: 'synthetic' } }));
  const server = createServer(async (req, res) => { let body = ''; for await (const chunk of req) body += chunk; calls.push(JSON.parse(body)); res.setHeader('Content-Type', 'application/json'); res.end('{}'); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const bridge = join(directory, "bridge's config.json"), scope = join(directory, "scope's config.json");
  await writeFile(bridge, JSON.stringify({ host: '127.0.0.1', port: (server.address() as { port: number }).port, token: 'synthetic' }));
  await writeFile(scope, JSON.stringify({ sessions: ['selected'], deliveries: [] }));
  try {
    await installQwenWorkIntegration(resolve('.'), root, { bridgeConfig: bridge, captureScope: scope });
    const first = JSON.parse(await readFile(settings, 'utf8')); assert.deepEqual(first.hooks.UserPromptSubmit[0], foreign); assert.deepEqual(first.hooks.Stop, [foreign]); assert.equal(first.appearance.theme, 'synthetic');
    await installQwenWorkIntegration(resolve('.'), root, { bridgeConfig: bridge, captureScope: scope });
    const second = JSON.parse(await readFile(settings, 'utf8')); assert.equal(second.hooks.UserPromptSubmit.length, 2);
    const command = second.hooks.UserPromptSubmit[1].hooks[0].command;
    const child = spawn('/bin/sh', ['-c', command]); child.stdin.end(JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 'selected', prompt: 'synthetic selected requirement' }));
    assert.equal(await new Promise(resolve => child.on('close', resolve)), 0); assert.equal(calls.length, 1); assert.equal(calls[0].session_id, 'selected');
    await assert.rejects(installQwenWorkIntegration(resolve('.'), root, { bridgeConfig: 'relative-path' }), /绝对路径/);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); }
});
