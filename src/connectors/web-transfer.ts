import { randomUUID, createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { basename } from 'node:path';
import type { WorkSnapshot } from '../core/types.js';
import type { WorkPackage } from '../definitions/work-package.js';
import { WEB_CONNECTORS } from './catalog.js';

const MAX_BYTES = 40 * 1024 * 1024;
export const TRANSFER_CHUNK = 256 * 1024;
export const UPLOAD_CONNECTORS = ['kimi-work', 'doubao-work', 'deepseek-web', 'gemini-web'];
type FileSource = { path: string; name: string; hash: string; available: boolean };
/** Only files already associated with this work can enter the browser transfer. */
export function webFiles(work: WorkSnapshot, pkg: WorkPackage): FileSource[] {
  const sources: FileSource[] = [...pkg.fixedMaterials, ...(pkg.inputMaterials ?? [])].map(m => ({ path: m.path, name: basename(m.originalPath || m.path), hash: m.hash, available: true }));
  for (const value of pkg.referenceExamples) {
    if (!value || typeof value !== 'object') continue;
    const ref = value as { path?: string; material?: { path: string; originalPath?: string; hash: string } };
    if (ref.material) sources.push({ path: ref.material.path, name: basename(ref.material.originalPath || ref.material.path), hash: ref.material.hash, available: true });
    else if (ref.path) sources.push({ path: ref.path, name: basename(ref.path), hash: '', available: true });
  }
  for (const ref of work.artifactRefs) sources.push({ path: ref.path, name: ref.filename, hash: ref.sha256, available: ref.availability === 'AVAILABLE' });
  return [...new Map(sources.map(file => [file.path, file])).values()];
}

/** Short-lived frozen bytes. The native protocol never accepts a filesystem path. */
export class WebTransfer {
  #generation = 0;
  #current: { id: string; title: string; prompt: string; adapterId?: string; expires: number; files: { name: string; bytes: Buffer }[] } | null = null;
  async prepare(work: WorkSnapshot, pkg: WorkPackage, prompt: string, adapterId?: string): Promise<void> {
    const generation = ++this.#generation;
    this.#current = null;
    const sources = webFiles(work, pkg);
    // Budget JSON-escaped strings, leaving room for bounded file metadata and the native frame envelope.
    if (Buffer.byteLength(JSON.stringify({ prompt, title: work.definition.name, names: sources.map(file => file.name) }), 'utf8') > 800_000)
      throw new Error('网页工作包正文过大，请先缩小工作范围。');
    if (sources.length > 20) throw new Error('网页交接一次最多携带 20 个附件。');
    const files: { name: string; bytes: Buffer }[] = [];
    let total = 0;
    for (const file of sources) {
      if (!file.available) throw new Error(`附件需补充或确认版本：${file.name}`);
      const handle = await open(file.path, 'r');
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || total + stat.size > MAX_BYTES) throw new Error('网页交接附件须为普通文件，合计不超过 40 MB。');
        // Bounded read even if a file grows after stat.
        const bytes = Buffer.alloc(Math.min(MAX_BYTES - total + 1, stat.size + 1));
        let size = 0;
        while (size < bytes.length) { const read = await handle.read(bytes, size, bytes.length - size, size); if (!read.bytesRead) break; size += read.bytesRead; }
        if (size !== stat.size) throw new Error(`附件读取期间发生变化，请重试：${file.name}`);
        const data = bytes.subarray(0, size);
        if (file.hash && createHash('sha256').update(data).digest('hex') !== file.hash) throw new Error(`附件版本已变化，请先确认：${file.name}`);
        if (files.some(other => other.name === file.name)) throw new Error(`附件名称重复，请先重命名：${file.name}`);
        files.push({ name: file.name, bytes: data }); total += size;
      } finally { await handle.close(); }
    }
    if (generation !== this.#generation) throw new Error('另一个工作包正在准备，请使用最新交接。');
    this.#current = { id: randomUUID(), title: work.definition.name, prompt, ...(adapterId ? { adapterId } : {}), files, expires: Date.now() + 10 * 60_000 };
  }
  handle(payload: Record<string, unknown>): unknown {
    const transfer = this.#current;
    if (!transfer || transfer.expires < Date.now()) { this.#current = null; throw new Error('请先在 Worket 复制工作包或交接到网页（10 分钟内有效）。'); }
    const url = new URL(String(payload.url));
    const site = WEB_CONNECTORS.find(item => (item.hosts as readonly string[]).includes(url.hostname));
    if (url.protocol !== 'https:' || !site || !UPLOAD_CONNECTORS.includes(site.id) || transfer.adapterId && transfer.adapterId !== site.id)
      throw new Error('当前网页与本次交接目标不符。');
    if (payload.action === 'preview') return { id: transfer.id, title: transfer.title, prompt: transfer.prompt, files: transfer.files.map((file, index) => ({ index, name: file.name, size: file.bytes.length, sha256: createHash('sha256').update(file.bytes).digest('hex') })) };
    if (payload.id !== transfer.id) throw new Error('工作包已更新，请重新打开扩展。');
    if (payload.action === 'chunk') {
      const { index, offset } = payload;
      if (!Number.isSafeInteger(index) || !Number.isSafeInteger(offset) || Number(offset) < 0) throw new Error('无效附件分块。');
      const file = transfer.files[Number(index)];
      if (!file || Number(offset) >= file.bytes.length) throw new Error('无效附件分块。');
      return { data: file.bytes.subarray(Number(offset), Number(offset) + TRANSFER_CHUNK).toString('base64') };
    }
    throw new Error('未知网页传输动作。');
  }
}
