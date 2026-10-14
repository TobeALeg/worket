import { fillWebDraft } from './transfer.js';
const native = async payload => {
  const result = await chrome.runtime.sendNativeMessage('site.dandi.worket.selected', { action: 'transfer', payload });
  if (!result?.ok) throw new Error(result?.error ?? '本机 Worket 未连接');
  return result;
};
const busy = new Set();
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || message.action !== 'fill-work') return;
  (async () => {
    if (busy.has(message.tabId)) throw new Error('正在传送，请勿重复点击。');
    busy.add(message.tabId);
    try {
      const tab = await chrome.tabs.get(message.tabId);
      const url = new URL(tab.url); const target = url.origin + url.pathname;
      const preview = await native({ action: 'preview', url: target });
      if (preview.id !== message.id) throw new Error('工作包已更新，请重新打开扩展。');
      const [check] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "MAIN", func: fillWebDraft, args: [{ ...preview, url: target, checkOnly: true }] });
      if (!check?.result?.ready) throw new Error('当前页面无法填入，请确认输入框为空且没有重复传送。');
      const files = [];
      for (const file of preview.files) {
        const chunks = []; let size = 0;
        while (size < file.size) {
          const chunk = await native({ action: 'chunk', id: preview.id, url: target, index: file.index, offset: size });
          const bytes = Uint8Array.from(atob(chunk.data), c => c.charCodeAt(0));
          if (!bytes.length || size + bytes.length > file.size) throw new Error('附件传输不完整，尚未上传。');
          chunks.push(bytes); size += bytes.length;
        }
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
        if (hash !== file.sha256) throw new Error('附件校验失败，尚未上传。');
        // Chunked conversion avoids spreading a large buffer onto the JS stack.
        let binary = ''; for (let start = 0; start < size; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
        files.push({ name: file.name, data: btoa(binary) });
      }
      const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "MAIN", func: fillWebDraft, args: [{ id: preview.id, prompt: preview.prompt, url: target, files }] });
      if (!result?.dispatched) throw new Error('填入未完成，请检查网页草稿和附件；不要重复上传。');
      return result;
    } finally { busy.delete(message.tabId); }
  })().then(result => reply({ ok: true, ...result }), error => reply({ ok: false, error: error.message }));
  return true;
});
