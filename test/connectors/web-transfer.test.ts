import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { WebTransfer, TRANSFER_CHUNK } from '../../dist/connectors/web-transfer.js';
import { encodeFrame } from '../../integrations/browser-native/host.mjs';
const url = 'https://gemini.google.com/app';
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
test('web transfer freezes only work attachments, transports bounded chunks and rejects wrong destination or stale identity', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worket-web-files-'));
  try {
    const path = join(dir, 'real.bin'), bytes = Buffer.alloc(TRANSFER_CHUNK * 4 + 7, 73);
    await writeFile(path, bytes);
    const work: any = { definition: { name: '附件测试' }, artifactRefs: [{ path, filename: 'real.bin', sha256: hash(bytes), availability: 'AVAILABLE' }] };
    const pkg: any = { fixedMaterials: [], inputMaterials: [], referenceExamples: [null, "reference only"] };
    const transfer = new WebTransfer();
    await transfer.prepare(work, pkg, '请读取附件', 'gemini-web');
    const preview: any = transfer.handle({ action: 'preview', url });
    assert.equal(preview.files.length, 1); assert.equal(preview.files[0].size, bytes.length);
    assert.doesNotMatch(JSON.stringify(preview), new RegExp(dir));
    assert.throws(() => transfer.handle({ action: 'preview', url: 'https://www.kimi.com/' }), /目标不符/);
    assert.throws(() => transfer.handle({ action: 'chunk', url, id: 'other', index: 0, offset: 0 }), /已更新/);
    assert.throws(() => transfer.handle({ action: 'chunk', url, id: preview.id, index: 3, offset: 0 }), /无效/);
    await writeFile(path, 'changed after preparation');
    const chunks: Buffer[] = [];
    for (let offset = 0; offset < bytes.length; offset += TRANSFER_CHUNK) {
      const reply: any = transfer.handle({ action: 'chunk', url, id: preview.id, index: 0, offset });
      assert.ok(encodeFrame({ ok: true, ...reply }).length < 1_000_000);
      chunks.push(Buffer.from(reply.data, 'base64'));
    }
    assert.deepEqual(Buffer.concat(chunks), bytes);
    await assert.rejects(transfer.prepare(work, pkg, 'new'), /版本已变化/);
    assert.throws(() => transfer.handle({ action: 'preview', url }), /请先/);
    await assert.rejects(transfer.prepare(work, pkg, '中'.repeat(300_000)), /正文过大/);
    work.artifactRefs[0].availability = 'MISSING';
    await assert.rejects(transfer.prepare(work, pkg, 'new'), /需补充/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
