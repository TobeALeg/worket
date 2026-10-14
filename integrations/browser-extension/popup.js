const $ = id => document.getElementById(id);
const setStatus = (id, text, state = '') => {
  $(id).textContent = text;
  $(id).dataset.state = state;
};
let capture = null;
for (const item of globalThis.WORKET_WEB_CONNECTORS) {
  const option = document.createElement('option'); option.value = item.id; option.textContent = item.name; $('site').append(option);
}
$('capture').addEventListener('click', async () => {
  $('capture').disabled = true; $('capture').textContent = '正在读取…';
  setStatus('status', '正在读取当前选区…');
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
    $('stage').disabled = false; setStatus('status', '请核对角色、会话标识及正文。');
  } catch (e) { setStatus('status', String(e.message ?? e), 'error'); }
  finally { $('capture').disabled = false; $('capture').textContent = '读取当前选区'; }
});
$('stage').addEventListener('click', async () => {
  if (!capture) return; $('stage').disabled = true;
  $('capture').disabled = true; $('stage').textContent = '正在发送…';
  setStatus('status', '正在发送到 Worket…');
  try {
    const payload = { schemaVersion: 1, adapterId: $('site').value, conversationId: $('conversation').value.trim(), title: capture.title.slice(0, 512), url: capture.url,
      scope: 'SELECTED_CONTENT', messages: [{ role: $('role').value, content: $('content').value }] };
    const response = await chrome.runtime.sendNativeMessage('site.dandi.worket.selected', { action: 'stage', payload });
    if (!response?.ok) throw new Error(response?.error ?? '本机 Worket 未连接');
    setStatus('status', '已送入待确认箱，尚未保存。请在 10 分钟内到 Worket 预览确认。', 'success');
  } catch (e) { setStatus('status', `${e.message ?? e}。如果未安装本机桥接，请先按开发说明完成显式配对。`, 'error'); }
  finally { $('stage').disabled = false; $('capture').disabled = false; $('stage').textContent = '发送到 Worket 待确认箱'; }
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
    setStatus('transfer-preview', `${result.title} · ${result.files.length} 个附件${result.files.length ? '：' + result.files.map(file => file.name).join('、') : ''}`);
    $('transfer').disabled = false;
  } catch (error) { setStatus('transfer-preview', error.message, 'error'); }
})();
$('transfer').addEventListener('click', async () => {
  $('transfer').disabled = true; $('transfer').textContent = '正在填入…'; setStatus('transfer-status', '正在传送，请稍候…');
  try {
    const result = await chrome.runtime.sendMessage({ action: 'fill-work', tabId: transferTab, id: transferId });
    if (!result?.ok) throw new Error(result?.error ?? '传送未完成，请检查网页草稿。');
    setStatus('transfer-status', `工作包已填入，${result.count} 个附件已交给网页。请确认附件卡片及上传结果，再点击网页的发送按钮。`, 'success');
  } catch (error) { setStatus('transfer-status', error.message, 'error'); }
  finally { $('transfer').textContent = '填入工作包和附件'; }
});
