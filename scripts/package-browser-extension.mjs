import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const manifest = JSON.parse(await readFile('integrations/browser-extension/manifest.json', 'utf8'));
const directory = await mkdtemp(join(tmpdir(), 'worket-browser-release-'));
const archive = resolve('release', `Worket-browser-extension-${manifest.version}.zip`);
try {
  const folder = join(directory, 'Worket-browser-extension');
  await cp('integrations/browser-extension', folder, { recursive: true });
  await writeFile(join(folder, 'INSTALL.txt'), `Worket 网页交接 ${manifest.version}

1. 将此文件夹保留在固定位置。
2. 在 Chrome / Edge 的扩展管理页开启开发者模式，选择“加载已解压的扩展程序”，加载此文件夹。
3. 打开 Worket 0.1.11 或更新版本 → 应用菜单 → 浏览器插件，选择浏览器，粘贴 Worket 扩展 ID 并配对。
4. 在 ChatGPT 聊天页点击 Worket 扩展 → 导入当前聊天；核对消息后发送到 Worket 待确认箱，再预览确认保存。

升级：用新版文件替换原目录内容，在扩展管理页点击 Worket 的“重新加载”，保留原扩展 ID；必要时在 Worket 重新配对。
仅读取当前分支消息文字，不包含附件正文或其他分支。不会自动发送网页消息。
`);
  await mkdir(resolve('release'), { recursive: true });
  await rm(archive, { force: true });
  if (process.platform === 'darwin') execFileSync('ditto', ['-c', '-k', '--norsrc', '--keepParent', folder, archive]);
  else if (process.platform === 'win32') execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Compress-Archive -LiteralPath $env:WORKET_BROWSER_SOURCE -DestinationPath $env:WORKET_BROWSER_TARGET'], { env: { ...process.env, WORKET_BROWSER_SOURCE: folder, WORKET_BROWSER_TARGET: archive } });
  else throw new Error('请在 macOS 或 Windows 上构建插件发布包。');
  const checksum = createHash('sha256').update(await readFile(archive)).digest('hex');
  await writeFile(`${archive}.sha256`, `${checksum}  ${archive.split(/[\\/]/).at(-1)}\n`);
  console.log(`已生成插件 ${manifest.version}：${archive}`);
} finally { await rm(directory, { recursive: true, force: true }); }
