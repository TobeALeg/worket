// Reads public installation metadata and an existing WorkBuddy protocol status only.
// No listing or reading conversations, credentials, browser databases, or changing settings.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
const exec = promisify(execFile), products = {};
for (const name of ['WorkBuddy', 'QwenWork', '千问办公', 'Kimi', '豆包', 'Coze', '扣子', 'ZCode', 'Antigravity', 'ChatGPT']) {
  const candidates = ['/Applications', join(homedir(), 'Applications')].map(root => join(root, name + '.app'));
  const paths = []; for (const path of candidates) { try { await access(path); paths.push(path); } catch {} }
  const versions = [];
  for (const path of paths) {
    const plist = join(path, 'Contents/Info.plist');
    const fields = {};
    for (const key of ['CFBundleIdentifier', 'CFBundleShortVersionString']) {
      try { fields[key] = (await exec('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist])).stdout.trim(); } catch { fields[key] = null; }
    }
    versions.push({ path, ...fields });
  }
  products[name] = { installed: !!paths.length, versions, thirdPartyConversationTest: 'NOT_RUN' };
}
const workbuddyStatus = await new Promise(resolveStatus => {
  const socket = connect(join(homedir(), '.workpet/workbuddy.sock')); let text = '', done = false;
  const finish = value => { if (done) return; done = true; socket.destroy(); resolveStatus(value); };
  socket.setTimeout(3000, () => finish({ connected: false, reason: 'status-timeout' }));
  socket.on('connect', () => socket.write('{"method":"status"}\n'));
  socket.on('data', chunk => { text += chunk; if (text.length > 8192) finish({ connected: false, reason: 'invalid-status-size' }); });
  socket.on('error', error => finish({ connected: false, reason: error.code ?? 'socket-error' }));
  socket.on('end', () => { try { const result = JSON.parse(text).result; finish({ connected: result?.protocol === 1, protocol: result?.protocol ?? null, capabilities: result?.capabilities ?? [], conversationRead: false }); } catch { finish({ connected: false, reason: 'invalid-status' }); } });
});
const report = { timestamp: new Date().toISOString(), products, workbuddyStatus, modifiedConfiguration: false, privateContentRead: false };
await mkdir(resolve('output/playwright/cn-connectors'), { recursive: true });
await writeFile(resolve('output/playwright/cn-connectors/installed-apps.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
