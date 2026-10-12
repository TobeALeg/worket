// Writes a reviewable bundle ONLY. Registering it with a browser is a separate explicit action.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const [id, destination] = process.argv.slice(2);
if (!/^[a-p]{32}$/.test(id ?? '') || !destination) throw new Error('Usage: node scripts/prepare-browser-native.mjs <actual-extension-id> <output-directory>');
const directory = resolve(destination); await mkdir(directory, { recursive: true });
const origin = `chrome-extension://${id}/`;
const host = fileURLToPath(new URL('../integrations/browser-native/host.mjs', import.meta.url));
// Host needs a private, exact-origin config next to its source; do not modify source during preparation.
const quote = value => `'${value.replace(/'/g, "'\\''")}'`;
const runner = join(directory, 'worket-selected-host');
const copy = (await import('node:fs/promises')).cp;
await copy(fileURLToPath(new URL('../integrations', import.meta.url)), join(directory, 'integrations'), { recursive: true });
await writeFile(join(directory, 'integrations/browser-native/pairing.json'), JSON.stringify({ allowed_origins: [origin] }, null, 2), { mode: 0o600 });
await writeFile(runner, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(join(directory, 'integrations/browser-native/host.mjs'))} "$@"\n`, { mode: 0o700 });
const manifest = { name: 'site.dandi.worket.selected', description: 'Stage user-selected content for Worket local confirmation', path: runner, type: 'stdio', allowed_origins: [origin] };
await writeFile(join(directory, 'site.dandi.worket.selected.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ prepared: directory, registered: false, next: 'After approval, copy the native host manifest to the selected browser NativeMessagingHosts directory. Enable the unpacked extension explicitly.' }));
