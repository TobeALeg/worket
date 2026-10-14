#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { postToWorkPet } from '../workbuddy-marketplace/plugins/workpet/bridge/config.mjs';
export const MAX_FRAME = 1_000_000;
export function encodeFrame(value) { const body = Buffer.from(JSON.stringify(value)); if (body.length > MAX_FRAME) throw new Error('FRAME_TOO_LARGE'); const header = Buffer.alloc(4); header.writeUInt32LE(body.length); return Buffer.concat([header, body]); }
export async function runNativeHost({ input, output, origins, origin, stage, transfer }) {
  if (!origins.includes(origin) || !/^chrome-extension:\/\/[a-p]{32}\/$/.test(origin)) throw new Error('UNPAIRED_EXTENSION');
  let pending = Buffer.alloc(0);
  for await (const chunk of input) {
    pending = Buffer.concat([pending, chunk]);
    if (pending.length > MAX_FRAME + 4) throw new Error('FRAME_TOO_LARGE');
    while (pending.length >= 4) {
      const size = pending.readUInt32LE(0); if (!size || size > MAX_FRAME) throw new Error('FRAME_TOO_LARGE');
      if (pending.length < size + 4) break;
      const body = pending.subarray(4, size + 4); pending = pending.subarray(size + 4);
      let reply;
      try {
        const message = JSON.parse(body.toString('utf8'));
        if (message.action === 'transfer' && transfer) { reply = { ok: true, ...await transfer(message.payload) }; }
        else {
          if (message.action !== 'stage' || !message.payload || message.payload.scope !== 'SELECTED_CONTENT') throw new Error('Only selected-content staging is supported');
          const result = await stage(message.payload); reply = { ok: true, ...result };
        }
      } catch (e) { reply = { ok: false, error: e.message }; }
      output.write(encodeFrame(reply));
    }
  }
  if (pending.length) throw new Error('INCOMPLETE_FRAME');
}
if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  try {
    const config = JSON.parse(await readFile(new URL('./pairing.json', import.meta.url), 'utf8'));
    await runNativeHost({ input: process.stdin, output: process.stdout, origins: config.allowed_origins, origin: process.argv[2],
      transfer: payload => postToWorkPet('/web/transfer', payload, 4000),
      stage: payload => postToWorkPet('/selected/stage', payload, 4000) });
  } catch { process.stderr.write('Worket 本机桥接不可用或扩展未配对。\n'); process.exitCode = 1; }
}
