// Runs only after the user clicks the extension on a supported chat page.
// Keep this function self-contained: Chrome serializes it into the selected tab.
export async function fillWebDraft(payload) {
  if (location.origin + location.pathname !== payload.url) throw new Error('网页已切换，请重新打开扩展。');
  const visible = element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
  const editors = [...document.querySelectorAll('textarea, [contenteditable="true"]')].filter(element => visible(element) && element.getAttribute('aria-hidden') !== 'true' && !element.classList.contains('ql-clipboard'));
  const editor = editors.find(element => element.getAttribute('role') === 'textbox') ?? editors[0];
  if (!editor) throw new Error('没有找到聊天输入框，请先进入普通聊天页。');
  const editableCopy = editor.cloneNode(true);
  editableCopy.querySelectorAll('[contenteditable="false"]').forEach(element => element.remove());
  if ((editor.value ?? editableCopy.textContent ?? '').trim()) throw new Error('输入框已有草稿，请先发送或清空后再填入，避免覆盖。');
  if (document.documentElement.dataset.worketTransfer === payload.id) throw new Error('此工作包已填入，请检查现有附件，不要重复上传。');
  if (payload.checkOnly) return { ready: true };
  const data = new DataTransfer();
  const mime = { txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json', pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  for (const file of payload.files) {
    const binary = atob(file.data), bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    data.items.add(new File([bytes], file.name, { type: mime[file.name.split('.').pop().toLowerCase()] ?? 'application/octet-stream' }));
  }
  if (payload.files.length) {
    // Gemini creates its real file input only when the upload menu is opened.
    if (!document.querySelector('input[type="file"]') && location.hostname === 'gemini.google.com') {
      const button = [...document.querySelectorAll('button')].find(el => /上传和工具|Upload and tools|Add files/i.test(el.getAttribute('aria-label') || el.innerText));
      if (button) { button.click(); await new Promise(resolve => setTimeout(resolve, 250)); }
    }
    const accepts = (input, file) => {
      if (!input.accept) return true;
      return input.accept.toLowerCase().split(',').some(raw => {
        const value = raw.trim();
        return value === '*/*' || value.startsWith('.') && file.name.toLowerCase().endsWith(value) || value.endsWith('/*') && file.type.startsWith(value.slice(0, -1)) || value === file.type;
      });
    };
    let input = [...document.querySelectorAll('input[type="file"]')].find(input => !input.disabled && (input.multiple || data.files.length === 1) && [...data.files].every(file => accepts(input, file)));
    if (!input && /(^|\.)doubao.com$/.test(location.hostname)) {
      let upload = [...document.querySelectorAll('[role="option"]')].find(el => el.textContent.trim() === '上传文件或图片');
      if (!upload) {
        document.querySelector('button[aria-label="Upload file"]')?.click();
        await new Promise(resolve => setTimeout(resolve, 250));
        upload = [...document.querySelectorAll('[role="option"]')].find(el => el.textContent.trim() === '上传文件或图片');
      }
      if (upload) {
        // The site creates a detached file input on demand. Supply the prepared
        // files at that exact chooser boundary, then immediately restore click.
        const original = HTMLInputElement.prototype.click;
        HTMLInputElement.prototype.click = function () {
          if (this.type === 'file') { input = this; return; }
          return original.call(this);
        };
        try {
          upload.click();
          await new Promise(resolve => setTimeout(resolve, 250));
          input ??= document.querySelector('input[type="file"]');
        } finally { HTMLInputElement.prototype.click = original; }
      }
    }
    if (!input || ![...data.files].every(file => accepts(input, file))) throw new Error('当前网页没有支持这些附件的上传入口，请打开附件菜单后重新尝试。');
    document.documentElement.dataset.worketTransfer = payload.id;
    input.files = data.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } else document.documentElement.dataset.worketTransfer = payload.id;
  editor.focus();
  if (editor.tagName === 'TEXTAREA') {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(editor, payload.prompt);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    editor.focus();
    if (!document.execCommand('insertText', false, payload.prompt)) throw new Error('附件已交给网页，但正文填入失败，请粘贴已复制的工作包；不要重复上传。');
  }
  return { dispatched: true, count: payload.files.length };
}
