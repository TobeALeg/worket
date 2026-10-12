const $ = id => document.getElementById(id);
let capture = null;
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
    const sites = { 'kimi.com': 'kimi-work', 'doubao.com': 'doubao-work', 'coze.cn': 'coze-web', 'qwenwork.ai': 'qwenwork-web' };
    $('site').value = sites[url.hostname.replace(/^www\./, '')] ?? 'web-selected';
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
