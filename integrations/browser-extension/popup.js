const $ = id => document.getElementById(id);
let capture = null;
for (const item of globalThis.WORKET_WEB_CONNECTORS) {
  const option = document.createElement('option'); option.value = item.id; option.textContent = item.name; $('site').append(option);
}
$('capture').addEventListener('click', async () => {
  try {
    capture = null; $('stage').disabled = true;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('没有当前标签页');
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id },
      func: () => ({ url: location.origin + location.pathname, title: document.title, content: window.getSelection()?.toString() ?? '' }) });
    if (!result?.content?.trim()) throw new Error('请先在页面选中一条用户或助手可见消息');
    if (result.content.length > 200000) throw new Error('选区过大，请缩小范围');
    const url = new URL(result.url); if (url.protocol !== 'https:') throw new Error('仅支持 HTTPS 网页');
    capture = result; $('content').value = result.content; $('conversation').value = ''; 
    $('site').value = globalThis.WORKET_WEB_CONNECTORS.find(item => item.hosts.includes(url.hostname))?.id ?? 'web-selected';
    $('stage').disabled = false; $('status').textContent = '请核对角色、会话标识及正文。当前选区不代表完整对话。';
  } catch (e) { $('status').textContent = String(e.message ?? e); }
});
$('stage').addEventListener('click', async () => {
  if (!capture) return; $('stage').disabled = true;
  try {
    const payload = { schemaVersion: 1, adapterId: $('site').value, conversationId: $('conversation').value.trim(), title: capture.title.slice(0, 512), url: capture.url,
      scope: 'SELECTED_CONTENT', messages: [{ role: $('role').value, content: $('content').value }] };
    const response = await chrome.runtime.sendNativeMessage('site.dandi.worket.selected', { action: 'stage', payload });
    if (!response?.ok) throw new Error(response?.error ?? '本机 Worket 未连接');
    $('status').textContent = '已送入 Worket 待确认箱，尚未保存为工作记录。请在 Worket 的导入入口预览确认（10 分钟内）。';
  } catch (e) { $('status').textContent = `${e.message ?? e}。如果未安装本机桥接，请先按开发说明完成显式配对。`; }
  finally { $('stage').disabled = false; }
});

let transferTab = null, transferId = null;
(async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) throw new Error('请先打开目标聊天网页。');
    const url = new URL(tab.url);
    const result = await chrome.runtime.sendNativeMessage('site.dandi.worket.selected', { action: 'transfer', payload: { action: 'preview', url: url.origin + url.pathname } });
    if (!result?.ok) throw new Error(result?.error ?? '本机 Worket 未连接');
    transferTab = tab.id; transferId = result.id;
    $('transfer-preview').textContent = `${result.title} · ${result.files.length} 个附件${result.files.length ? '：' + result.files.map(file => file.name).join('、') : ''}`;
    $('transfer').disabled = false;
  } catch (error) { $('transfer-preview').textContent = error.message; }
})();
$('transfer').addEventListener('click', async () => {
  $('transfer').disabled = true; $('transfer-status').textContent = '正在传送，请稍候…';
  try {
    const result = await chrome.runtime.sendMessage({ action: 'fill-work', tabId: transferTab, id: transferId });
    if (!result?.ok) throw new Error(result?.error ?? '传送未完成，请检查网页草稿。');
    $('transfer-status').textContent = `工作包已填入，${result.count} 个附件已交给网页。请确认附件卡片及上传结果，再点击网页的发送按钮。`;
  } catch (error) { $('transfer-status').textContent = error.message; }
});
