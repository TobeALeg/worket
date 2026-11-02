import { captureCurrentChat } from './current-chat.js';
const $ = id => document.getElementById(id);
const setStatus = (id, text, state = '') => { $(id).textContent = text; $(id).dataset.state = state; };
let capture = null;
for (const item of globalThis.WORKET_WEB_CONNECTORS) {
  const option = document.createElement('option'); option.value = item.id; option.textContent = item.name; $('site').append(option);
}
const busy = value => {
  $('capture').disabled = $('capture-chat').disabled = value;
  $('stage').disabled = value || !capture;
};
function showCapture(result) {
  capture = result;
  const whole = result.captureMode === 'CURRENT_CHAT';
  $('site').value = globalThis.WORKET_WEB_CONNECTORS.find(item => item.hosts.includes(new URL(result.url).hostname))?.id ?? 'web-selected';
  $('site').disabled = whole;
  $('conversation').value = whole ? result.conversationId : '';
  $('conversation').readOnly = whole;
  $('role-field').hidden = $('selected-body').hidden = whole;
  $('chat-preview').hidden = !whole;
  $('chat-messages').replaceChildren();
  if (whole) {
    const users = result.messages.filter(message => message.role === 'user').length;
    $('chat-summary').textContent = `已读取 ${result.messages.length} 条消息：用户 ${users} 条，助手 ${result.messages.length - users} 条。已检查页面首尾。`;
    for (const [index, message] of result.messages.entries()) {
      const details = document.createElement('details'), summary = document.createElement('summary'), body = document.createElement('pre');
      summary.textContent = `${index + 1} · ${message.role === 'user' ? '用户' : '助手'} · ${message.content.slice(0, 50).replace(/\s+/g, ' ')}`;
      body.textContent = message.content; details.append(summary, body); $('chat-messages').append(details);
    }
  } else $('content').value = result.content;
}
async function read(whole) {
  capture = null; $('chat-preview').hidden = true; $('content').value = ''; busy(true); setStatus('status', whole ? '正在从聊天起点读取到末尾，请保持弹窗打开，暂勿操作聊天…' : '正在读取当前选区…');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('没有当前标签页');
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id },
      func: whole ? captureCurrentChat : () => ({ url: location.origin + location.pathname, title: document.title, content: window.getSelection()?.toString() ?? '' }) });
    if (!result) throw new Error('聊天读取未完成，请保持页面打开后重试。');
    if (result.error) throw new Error(result.error);
    if (!whole && !result.content?.trim()) throw new Error('请先选中文字，或点击“导入当前聊天”读取整段聊天。');
    if (!whole && result.content.length > 200000) throw new Error('选区过大，请缩小范围');
    if (new URL(result.url).protocol !== 'https:') throw new Error('仅支持 HTTPS 网页');
    showCapture(result); setStatus('status', whole ? '请检查消息预览，再发送到 Worket 待确认箱。附件正文未读取。' : '请核对角色、会话标识及正文。');
  } catch (error) { setStatus('status', error.message ?? String(error), 'error'); }
  finally { busy(false); }
}
$('capture').addEventListener('click', () => void read(false));
$('capture-chat').addEventListener('click', () => void read(true));
$('stage').addEventListener('click', async () => {
  if (!capture) return; busy(true); setStatus('status', '正在发送到 Worket…');
  try {
    const payload = { schemaVersion: 1, adapterId: $('site').value, conversationId: $('conversation').value.trim(), title: capture.title.slice(0, 512), url: capture.url,
      scope: 'SELECTED_CONTENT', messages: capture.captureMode === 'CURRENT_CHAT' ? capture.messages : [{ role: $('role').value, content: $('content').value }],
      ...(capture.captureMode ? { captureMode: capture.captureMode } : {}) };
    if (!payload.conversationId) throw new Error('请填写会话标识。');
    const response = await chrome.runtime.sendNativeMessage('site.dandi.worket.selected', { action: 'stage', payload });
    if (!response?.ok) throw new Error(response?.error ?? '本机 Worket 未连接');
    setStatus('status', '已送入待确认箱，尚未保存。请在 10 分钟内到 Worket 预览确认。', 'success');
  } catch (error) { setStatus('status', `${error.message ?? error}。请在 Worket → 应用菜单 → 浏览器插件检查安装和配对。`, 'error'); }
  finally { busy(false); }
});

let transferTab = null, transferId = null;
(async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) throw new Error('请先打开目标聊天网页。');
    const url = new URL(tab.url);
    const result = await chrome.runtime.sendNativeMessage('site.dandi.worket.selected', { action: 'transfer', payload: { action: 'preview', url: url.origin + url.pathname } });
    if (!result?.ok) throw Object.assign(new Error(result?.error ?? '本机 Worket 未连接，请打开 Worket → 应用菜单 → 浏览器插件，检查连接。'), { code: result?.code });
    transferTab = tab.id; transferId = result.id;
    setStatus('transfer-preview', `${result.title} · ${result.files.length} 个附件${result.files.length ? '：' + result.files.map(file => file.name).join('、') : ''}`);
    $('transfer').disabled = false;
  } catch (error) { setStatus('transfer-preview', error.message, error.code === 'TRANSFER_NOT_PREPARED' ? '' : 'error'); }
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
