import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppService } from '../../dist/app/app-service.js';
import { createDefaultExecutors } from '../../dist/executors/defaults.js';

test('application handoff reaches all default transports with v3 and current delivery markers intact', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'worket-delivery-'));
  const prompts = new Map<string, string>();
  let opened = '';
  const source = {
    async listThreadPage() { return { threads: [], nextCursor: null }; },
    async readThread(): Promise<never> { throw new Error('No external source should be read'); },
    close() {},
  };
  const adapters = createDefaultExecutors({
    codex: source, workbuddy: source, zcode: source, antigravity: source,
    openUrl: async url => { prompts.set('codex', new URL(url).searchParams.get('prompt')!); },
    launcher: { async openNewConversation(url) { prompts.set('workbuddy', new URL(url).searchParams.get('prompt')!); return { opened: true }; } },
    desktop: {
      async openApplication(bundleId) { opened = bundleId; },
      writeClipboard(prompt) { prompts.set(opened === 'dev.zcode.app' ? 'zcode' : 'antigravity', prompt); },
    },
  });
  const app = new AppService({ databasePath: join(directory, 'work.sqlite'), executors: adapters, foreground: { async detect() { return null; } } });
  try {
    for (const adapter of adapters) {
      const core = app.core();
      const work = core.createWork({
        definition: { key: 'general-work', name: '提案 & 证据 ? #', version: 1 },
        executor: { type: 'AGENT', name: 'fixture' },
        environment: { type: 'AUDIT', name: 'fixture' },
        source: { adapter: 'codex', conversationId: `source-${adapter.id}` },
      });
      core.stopCapture(work.instance.id);
      await app.handoff(work.instance.id, adapter.id);
      const current = core.getWork(work.instance.id)!;
      const prompt = prompts.get(adapter.id)!;
      assert.match(prompt, /context_version=3/);
      assert.ok(prompt.includes(`[WORKPET:${work.instance.id}]`));
      assert.ok(prompt.includes(`[DELIVERY:${current.packageDeliveryId}]`));
      assert.ok(prompt.includes('提案 & 证据 ? #'));
      assert.match(current.activeBinding!.conversationId, /^pending:/);
      assert.equal(current.packageReadAt, null);
      assert.equal(current.instance.id, work.instance.id);
    }
  } finally { app.close(); }
});
