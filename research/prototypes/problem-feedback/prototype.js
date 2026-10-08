// Throwaway UI prototype. All reports, uploads and status changes stay in memory.
const app = document.querySelector('#app');
const params = new URLSearchParams(location.search);
const variants = ['A', 'B', 'C'];
const names = { A: 'A · 单页反馈', B: 'B · 情境抽屉', C: 'C · 分步确认' };
const sample = '/sample-window.svg';
const icons = {
  back: '<path d="m14 6-6 6 6 6"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m21 15-5-5-7 8-3-3-3 3"/>',
  capture: '<path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3"/><rect x="7" y="7" width="10" height="10" rx="1"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  arrow: '<path d="M4 12h15m-5-5 5 5-5 5"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  offline: '<path d="M3 3l18 18M2 8a17 17 0 0 1 3-2m4-2a17 17 0 0 1 13 4M5 12a11 11 0 0 1 3-2m5-1a11 11 0 0 1 6 3M8 16a5 5 0 0 1 8 0"/><circle cx="12" cy="20" r=".5"/>',
};
const svg = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const esc = text => String(text ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const initialReports = () => [
  { id: 'WX-1008-014', text: '点击交接并选择 Codex 后，弹窗关闭了，但 Codex 没有打开。原工作还在，试了两次都是这样。', title: '选择 Codex 后没有反应', images: [{ url: sample, name: '截图 1' }], logs: true, status: '待排查', at: '今天 14:32', received: true, note: '', publicNote: '' },
  { id: 'WX-1007-009', text: '刷新后工作列表显示为空，重启后恢复了。', title: '刷新后工作列表为空', images: [], logs: false, status: '已解决', at: '昨天 11:06', received: true, note: '', publicNote: '已确认刷新时的显示问题，修复方案已完成。' },
];
const state = {
  variant: variants.includes(params.get('variant')) ? params.get('variant') : 'A',
  surface: params.get('surface') === 'admin' ? 'admin' : 'client',
  screen: 'edit', text: '', consent: false, images: [], scenario: 'normal', step: 1,
  reports: initialReports(), current: 'WX-1008-014', returnScreen: 'edit', menu: false,
  sending: false, error: '', deleteConfirm: false, adminFilter: '全部', toast: '', epoch: 0,
};
const selected = () => state.reports.find(report => report.id === state.current);
const canSend = () => !!(state.text.trim() || state.images.length) && !state.sending;
const available = () => state.scenario !== 'missing';
const imagesHTML = (images, editable = false) => `<div class="attachments" data-drop-zone>${images.map((file, index) => `<div class="attachment"><button class="image-hit" data-image="${index}" data-image-origin="${editable ? 'draft' : 'report'}" aria-label="预览截图 ${index + 1}"><img src="${esc(file.url)}" alt="截图 ${index + 1}"></button>${editable ? `<button class="remove-image" data-remove-image="${index}" aria-label="移除截图 ${index + 1}">×</button>` : ''}</div>`).join('')}${editable && images.length < 3 ? `<button class="add-image" data-action="add-image">${svg('image')}<span>添加截图</span></button>` : ''}</div>`;
function header(back = 'home') {
  return `<header class="panel-header"><div class="header-left"><button class="icon-button" data-action="${back}" aria-label="返回">${svg('back')}</button><span class="worket-brand"><span class="worket-logo" aria-hidden="true">•‿•</span><strong>Worket</strong></span></div><div class="header-right"><button class="icon-button" data-action="menu" aria-label="应用菜单">${svg('menu')}</button><button class="icon-button" data-action="home" aria-label="关闭反馈">×</button></div></header>${state.menu ? `<div class="menu"><button data-action="edit">反馈问题</button><button data-action="history">我的反馈</button></div>` : ''}`;
}
const context = () => '<div class="context"><span class="dot"></span><strong>交接 · 等待接手确认</strong><time>14:32</time></div>';
function description() {
  return `<div><label class="field-title" for="description">发生了什么？</label><textarea id="description" class="description" maxlength="4000" placeholder="刚才做了什么？哪里不符合预期？">${esc(state.text)}</textarea><div class="field-note"><span>也可以直接粘贴截图</span><span id="char-count">${state.text.length} / 4000</span></div></div>`;
}
function attachments() {
  return `<section class="section"><div class="field-title">截图 <span>选填 · 最多 3 张</span></div>${imagesHTML(state.images, true)}<div class="attachment-tools"><span>PNG / JPG · 每张最多 5 MB</span><button class="text-button" data-action="capture">${svg('capture')}截取 Worket 窗口</button></div></section>`;
}
function diagnostic() {
  return `<section class="diagnostic"><div class="diagnostic-head"><label class="check-label"><input id="consent" type="checkbox" ${state.consent && available() ? 'checked' : ''} ${available() ? '' : 'disabled'}>附上本次诊断日志</label><button class="text-button" data-action="logs" ${available() ? '' : 'disabled'}>查看内容 ${svg('back').replace('m14 6-6 6 6 6', 'm10 6 6 6-6 6')}</button></div><p class="diagnostic-note">${available() ? `最近 10 分钟 · 28 条运行事件 · 18 KB${state.consent ? '<br><strong>仅本次发送。</strong>包含版本、错误码和操作步骤，保存 30 天。<br>不含聊天正文、文件内容或访问令牌。' : ''}` : '本次日志不可用，仍可发送描述和截图。'}</p></section>`;
}
const privacy = () => '<p class="privacy-note">请检查文字和截图中是否有不想分享的内容。</p>';
function footer(mode = 'send') {
  const isNext = mode === 'next';
  return `<footer class="panel-footer"><small>${state.sending ? '正在发送本次反馈…' : state.images.length ? `${state.images.length} 张截图${state.consent ? ' · 附诊断日志' : ''}` : state.consent ? '附本次诊断日志' : '草稿仅保存在本机'}</small><div class="footer-actions">${state.variant === 'C' && state.step === 2 && state.screen === 'edit' ? '<button data-action="previous-step">上一步</button>' : ''}<button class="primary" data-action="${isNext ? 'next-step' : 'send'}" ${canSend() ? '' : 'disabled'}>${state.sending ? '正在发送…' : isNext ? '下一步' : '发送反馈'}${state.sending ? '' : svg('arrow')}</button></div></footer>`;
}
function VariantA() {
  return `${header()}<div class="panel-main"><div class="page-title"><h2>反馈问题</h2><button class="text-button" data-action="history">我的反馈</button></div>${context()}${description()}${attachments()}${diagnostic()}${privacy()}${state.error ? `<p class="inline-error" role="alert">${esc(state.error)}</p>` : ''}</div>${footer()}`;
}
function workContent() {
  return `<div class="panel-main work-content"><button class="text-button" data-action="home">← 返回列表</button><h2>整理季度报告</h2><p class="context" style="margin-top:6px">执行者 · WorkBuddy</p><div class="work-progress"><h3>已完成</h3><p>✓ 已整理本季度的关键指标</p></div><div class="work-progress"><h3>下一步</h3><p>→ 核对来源并补充报告结论</p></div><div class="handoff-status"><span>等待 Codex 接手确认</span><button data-action="edit">反馈此问题</button></div><div class="work-actions"><button data-action="edit">交接</button><button data-action="edit">沉淀</button></div></div>`;
}
function VariantB() {
  return `${header()}${workContent()}<div class="sheet-scrim"><section class="feedback-sheet" role="region" aria-label="反馈问题抽屉"><div class="sheet-head"><h2>反馈此问题</h2><button class="text-button" data-action="history">我的反馈</button></div><div class="panel-main">${context()}${description()}${attachments()}${state.error ? `<p class="inline-error" role="alert">${esc(state.error)}</p>` : ''}</div><div class="sheet-consent">${diagnostic()}${privacy()}</div>${footer()}</section></div>`;
}
function VariantC() {
  const steps = `<div class="step-indicator">${state.step === 1 ? '<b>1 描述问题</b><i></i><span>2 确认发送</span>' : '<span>1 描述问题</span><i></i><b>2 确认发送</b>'}</div>`;
  const body = state.step === 1 ? `${description()}${attachments()}` : `<div class="field-title">问题描述<button class="text-button" data-action="previous-step">编辑</button></div><div class="review-description">${state.text.trim() ? esc(state.text) : '已添加截图'}</div>${state.images.length ? imagesHTML(state.images) : ''}<div class="overview-meta"><span>Worket 0.1.8</span><span>macOS · Apple Silicon</span></div>${diagnostic()}${privacy()}`;
  return `${header()}<div class="panel-main step"><div class="page-title"><div><h2>${state.step === 1 ? '反馈问题' : '确认发送内容'}</h2>${steps}</div><button class="text-button" data-action="history">我的反馈</button></div>${context()}${body}${state.error ? `<p class="inline-error" role="alert">${esc(state.error)}</p>` : ''}</div>${footer(state.step === 1 ? 'next' : 'send')}`;
}
const timeline = () => `<ol class="timeline">${[
  ['14:32', '已点击交接', '选择执行者：Codex'],
  ['14:32', '工作状态已准备', '处理完成 · 1.2 秒'],
  ['14:32', '已请求打开 Codex', '系统已接受打开请求'],
  ['14:32', '等待接手确认', '尚未收到目标执行者的确认'],
].map(([time, title, detail], index) => `<li><time>${time}</time><span class="mark">${index === 3 ? '○' : '✓'}</span><div><strong>${title}</strong><p>${detail}</p></div></li>`).join('')}</ol>`;
const rawEvents = () => '[14:32:07] handoff.start · trace-014\n[14:32:07] executor.selected · codex\n[14:32:08] preparation.complete · 1204ms\n[14:32:08] application.open_requested · accepted\n[14:32:38] handoff.confirmation · pending';
function logsView() {
  return `${header('back-from-logs')}<div class="panel-main"><div class="page-title"><h2>本次诊断日志</h2><span class="status-chip">已脱敏</span></div><dl class="summary-grid"><dt>时间范围</dt><dd>14:22 — 14:32 · 最近 10 分钟</dd><dt>应用版本</dt><dd>Worket 0.1.8</dd><dt>运行环境</dt><dd>macOS · Apple Silicon</dd><dt>日志大小</dt><dd>28 条事件 · 18 KB</dd></dl><div class="section"><h3 class="small-heading">相关操作</h3>${timeline()}</div><div class="scope-box"><p><strong>包含</strong>　版本、操作步骤、错误码与请求编号</p><p><strong>不包含</strong>　聊天正文、文件内容、截图或访问令牌</p></div><details class="raw-events"><summary>查看脱敏事件</summary><pre>${esc(rawEvents())}</pre></details></div><footer class="panel-footer"><small>仅用于排查本次问题 · 保存 30 天</small><button data-action="back-from-logs">返回反馈</button></footer>`;
}
function receiptView() {
  const report = selected();
  if (!report) { state.screen = 'history'; return historyView(); }
  const offline = !report.received;
  return `${header('history')}<div class="panel-main"><div class="result-view"><div class="result-mark ${offline ? 'offline' : ''}">${svg(offline ? 'offline' : 'check')}</div><h2>${offline ? '尚未发送' : '反馈已收到'}</h2><p>${offline ? '当前网络不可用，联网后自动发送本次反馈。' : '感谢反馈，我们会在这里更新处理状态。'}</p><div class="receipt"><div class="receipt-row"><span>报告编号</span><code>${esc(report.id)}</code></div><div class="receipt-row"><span>发送内容</span><span>${report.text ? '问题描述' : ''}${report.images.length ? `${report.text ? ' · ' : ''}${report.images.length} 张截图` : ''}${report.logs ? ' · 诊断日志' : ''}</span></div><div class="receipt-row"><span>${offline ? '发送状态' : '处理状态'}</span><span class="status-chip waiting">${offline ? '等待联网' : '待排查'}</span></div></div><div class="result-actions">${offline ? '<button class="primary" data-action="retry">立即重试</button><button data-action="export">导出诊断包</button>' : '<button class="primary" data-action="history">查看我的反馈</button><button data-action="home">返回工作</button>'}</div>${offline ? '<button class="text-button" style="margin-top:17px" data-action="cancel-send">取消发送</button>' : ''}</div></div><footer class="panel-footer"><small>${offline ? '重试不会追加新日志' : '报告与附件在 30 天后删除'}</small><button class="text-button" data-action="edit">继续反馈</button></footer>`;
}
function historyView() {
  return `${header('edit')}<div class="panel-main"><div class="page-title"><h2>我的反馈</h2><button class="text-button" data-action="edit">新反馈</button></div>${state.reports.map(report => `<button class="report-row" data-report="${esc(report.id)}"><div><strong>${esc(report.title)}</strong><span class="status-chip ${report.status === '已解决' ? '' : 'waiting'}">${report.received ? esc(report.status) : '待发送'}</span></div><p>${esc(report.at)} · ${esc(report.id)}${report.logs ? ' · 附日志' : ''}</p></button>`).join('') || '<p class="empty">暂无反馈</p>'}</div>`;
}
function detailView() {
  const report = selected();
  if (!report) { state.screen = 'history'; return historyView(); }
  return `${header('history')}<div class="panel-main"><div class="page-title"><h2>反馈详情</h2><span class="status-chip ${report.status === '已解决' ? '' : 'waiting'}">${report.received ? esc(report.status) : '待发送'}</span></div><div class="history-state"><span>${esc(report.id)}</span><span>${esc(report.at)}</span></div><h3 class="small-heading">问题描述</h3>${report.text ? `<p class="quote">${esc(report.text)}</p>` : ''}${imagesHTML(report.images)}<div class="section"><h3 class="small-heading">诊断日志</h3>${report.logs ? '<button class="text-button" data-action="logs">已附上本次日志 · 查看内容 →</button>' : '<p class="diagnostic-note" style="margin-left:0">未附诊断日志</p>'}</div>${report.publicNote ? `<div class="section"><h3 class="small-heading">处理进展</h3><p class="quote">${esc(report.publicNote)}</p></div>` : ''}${state.deleteConfirm ? `<div class="confirm-delete"><p>删除这份反馈及附件？删除后无法恢复。</p><div><button data-action="dismiss-delete">保留</button><button class="danger" data-action="confirm-delete">删除反馈</button></div></div>` : ''}</div><footer class="panel-footer"><small>${report.received ? '报告与附件在 30 天后删除' : '尚未发送到服务器'}</small><button class="text-button" style="color:var(--danger)" data-action="${state.deleteConfirm ? 'dismiss-delete' : report.received ? 'delete' : 'cancel-send'}">${state.deleteConfirm ? '取消删除' : report.received ? '删除反馈' : '取消发送'}</button></footer>`;
}
function adminView() {
  const filtered = state.reports.filter(report => report.received && (state.adminFilter === '全部' || (state.adminFilter === '未解决' ? report.status !== '已解决' : report.status === '已解决')));
  const report = selected();
  const detail = report?.received ? `<div class="admin-detail-heading"><h2>${esc(report.title)}</h2><select id="admin-status" aria-label="处理状态">${['待排查', '排查中', '待补充', '已解决'].map(status => `<option ${report.status === status ? 'selected' : ''}>${status}</option>`).join('')}</select></div><div class="admin-meta"><span>${esc(report.id)}</span><span>${esc(report.at)}</span><span>Worket 0.1.8</span><span>用户 U-014 · 设备 D-02</span></div><div class="admin-columns"><section><h3>用户描述与截图</h3><p class="quote">${esc(report.text || '仅提交截图')}</p>${imagesHTML(report.images)}</section><section><h3>程序记录的操作</h3>${report.logs ? timeline() : '<p class="diagnostic-note" style="margin:0">用户未附日志，无法判断操作步骤。</p>'}</section></div>${report.logs ? `<div class="admin-log"><div class="overview-meta"><span>关联请求 REQ-014</span><span>28 条事件 · 18 KB</span></div><details><summary>查看完整脱敏日志</summary><pre>${esc(rawEvents())}</pre></details></div>` : ''}<section class="admin-note"><label class="field-title" for="admin-note">内部排查备注</label><textarea id="admin-note" placeholder="记录排查结论、关联问题或修复版本">${esc(report.note)}</textarea><div><small>仅管理员可见</small><button data-action="save-note">保存备注</button></div></section>` : '<p class="empty">选择一份已收到的反馈</p>';
  return `<section class="admin-frame"><header class="admin-header"><span class="worket-brand"><span class="worket-logo" aria-hidden="true">•‿•</span><strong>Worket</strong><span class="divider"></span><small>管理后台</small></span><span class="status-chip">服务在线</span></header><div class="admin-body"><aside class="admin-inbox"><h2>问题反馈 <span style="font-size:10px;color:var(--muted);font-weight:400;margin-left:7px">${filtered.length}</span></h2><div class="admin-filters">${['全部', '未解决', '已解决'].map(filter => `<button data-admin-filter="${filter}" class="${state.adminFilter === filter ? 'active' : ''}">${filter}</button>`).join('')}</div>${filtered.map(item => `<button class="report-row admin-report ${state.current === item.id ? 'active' : ''}" data-admin-report="${item.id}"><div><strong>${esc(item.title)}</strong></div><p>${esc(item.at)} · 0.1.8</p><div style="margin-top:7px"><span class="status-chip ${item.status === '已解决' ? '' : 'waiting'}">${esc(item.status)}</span><span style="font-size:10px;color:var(--muted)">${item.logs ? '附诊断日志' : '未附日志'}</span></div></button>`).join('')}</aside><article class="admin-detail">${detail}</article></div></section>`;
}
function render() {
  let content;
  if (state.surface === 'admin') content = adminView();
  else {
    const views = { edit: () => ({ A: VariantA, B: VariantB, C: VariantC })[state.variant](), logs: logsView, receipt: receiptView, history: historyView, detail: detailView, home: () => `${header('edit')}${workContent()}` };
    content = `<section class="panel" aria-label="Worket 应用面板">${views[state.screen]()}${state.toast ? `<div class="toast" role="status">${esc(state.toast)}</div>` : ''}</section>`;
  }
  app.innerHTML = content;
  document.querySelectorAll('[data-surface]').forEach(button => button.classList.toggle('active', button.dataset.surface === state.surface));
  document.querySelector('#variant-name').textContent = state.surface === 'admin' ? '管理员 · 报告收件箱' : names[state.variant];
  document.querySelector('#state-readout').textContent = state.surface === 'admin' ? '示例报告 · 仅本页内存' : `${state.screen === 'edit' ? '草稿' : { home: '工作详情', logs: '日志预览', receipt: '发送结果', history: '我的反馈', detail: '反馈详情' }[state.screen]} · ${state.consent ? '本次已勾选日志' : '未勾选日志'} · ${state.images.length} 张截图`;
  const url = new URL(location.href); url.searchParams.set('variant', state.variant); url.searchParams.set('surface', state.surface); history.replaceState({}, '', url);
}
function toast(text) {
  state.toast = text; render();
  setTimeout(() => { if (state.toast === text) { state.toast = ''; render(); } }, 1600);
}
function cycle(direction) {
  state.variant = variants[(variants.indexOf(state.variant) + direction + 3) % 3]; state.surface = 'client'; state.screen = 'edit'; state.menu = false; state.toast = ''; render();
}
function updateSend() {
  document.querySelector('#char-count')?.replaceChildren(document.createTextNode(`${state.text.length} / 4000`));
  document.querySelectorAll('[data-action="send"], [data-action="next-step"]').forEach(button => button.disabled = !canSend());
}
async function addFiles(files) {
  state.error = '';
  for (const file of files) {
    if (state.images.length >= 3) { state.error = '最多添加 3 张截图。'; break; }
    if (!['image/png', 'image/jpeg'].includes(file.type)) { state.error = '请选择 PNG 或 JPG 图片。'; continue; }
    if (file.size > 5 * 1024 * 1024) { state.error = '这张截图超过 5 MB，请缩小后再添加。'; continue; }
    state.images.push({ url: URL.createObjectURL(file), name: file.name });
  }
  render();
}
function submit() {
  if (!canSend()) return;
  state.sending = true; state.error = ''; const epoch = state.epoch; render();
  setTimeout(() => {
    if (epoch !== state.epoch) return;
    const report = { id: `WX-1008-${String(15 + state.reports.length).padStart(3, '0')}`, text: state.text.trim(), title: state.text.trim().split('\n')[0].slice(0, 23) || '截图反馈', images: [...state.images], logs: state.consent && available(), status: '待排查', at: '今天 刚刚', received: state.scenario !== 'offline', note: '', publicNote: '' };
    state.reports.unshift(report); state.current = report.id; state.sending = false; state.screen = 'receipt'; state.text = ''; state.images = []; state.consent = false; state.step = 1; render();
  }, 600);
}
document.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button || button.disabled) return;
  if (button.dataset.cycle) { cycle(Number(button.dataset.cycle)); return; }
  if (button.dataset.surface) { state.surface = button.dataset.surface; state.toast = ''; if (!selected()?.received) state.current = state.reports.find(item => item.received)?.id; render(); return; }
  if (button.dataset.report) { state.current = button.dataset.report; state.screen = 'detail'; state.deleteConfirm = false; render(); return; }
  if (button.dataset.adminReport) { state.current = button.dataset.adminReport; render(); return; }
  if (button.dataset.adminFilter) { state.adminFilter = button.dataset.adminFilter; state.current = state.reports.find(item => item.received && (state.adminFilter === '全部' || (state.adminFilter === '未解决' ? item.status !== '已解决' : item.status === '已解决')))?.id; render(); return; }
  if ('removeImage' in button.dataset) { const [file] = state.images.splice(Number(button.dataset.removeImage), 1); if (file.url.startsWith('blob:')) URL.revokeObjectURL(file.url); render(); return; }
  if ('image' in button.dataset) { const files = button.dataset.imageOrigin === 'draft' ? state.images : state.screen === 'edit' ? state.images : selected()?.images; const file = files?.[Number(button.dataset.image)]; if (file) { const dialog = document.querySelector('#image-preview'); dialog.querySelector('img').src = file.url; dialog.showModal(); } return; }
  const action = button.dataset.action;
  if (['edit', 'home', 'history'].includes(action)) { state.screen = action; state.menu = false; state.deleteConfirm = false; state.toast = ''; render(); }
  else if (action === 'menu') { state.menu = !state.menu; render(); }
  else if (action === 'add-image') document.querySelector('#file-input').click();
  else if (action === 'capture') { if (state.images.length < 3) { state.images.push({ url: sample, name: '示例 Worket 窗口' }); state.error = ''; render(); } else toast('最多添加 3 张截图'); }
  else if (action === 'logs') { state.returnScreen = state.screen; state.screen = 'logs'; state.menu = false; render(); }
  else if (action === 'back-from-logs') { state.screen = state.returnScreen; render(); }
  else if (action === 'next-step') { state.step = 2; render(); }
  else if (action === 'previous-step') { state.step = 1; render(); }
  else if (action === 'send') submit();
  else if (action === 'retry') { if (state.scenario === 'offline') toast('仍未连接，反馈继续保存在本机'); else { selected().received = true; selected().status = '待排查'; state.screen = 'receipt'; render(); } }
  else if (action === 'cancel-send') { state.reports = state.reports.filter(item => item.id !== state.current); state.screen = 'history'; render(); }
  else if (action === 'delete') { state.deleteConfirm = true; render(); }
  else if (action === 'dismiss-delete') { state.deleteConfirm = false; render(); }
  else if (action === 'confirm-delete') { state.reports = state.reports.filter(item => item.id !== state.current); state.deleteConfirm = false; state.screen = 'history'; render(); }
  else if (action === 'save-note') { selected().note = document.querySelector('#admin-note').value; button.textContent = '已保存'; }
  else if (action === 'export') { const report = selected(); const url = URL.createObjectURL(new Blob([JSON.stringify({ prototype: true, reportId: report.id, description: report.text, screenshotCount: report.images.length, diagnosticEvents: report.logs ? rawEvents().split('\n') : [] }, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `prototype-${report.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('已导出演示报告'); }
  else if (action === 'close-image') document.querySelector('#image-preview').close();
  else if (action === 'reset') { state.images.forEach(file => { if (file.url.startsWith('blob:')) URL.revokeObjectURL(file.url); }); state.epoch++; Object.assign(state, { text: '', images: [], consent: false, screen: 'edit', step: 1, sending: false, error: '', toast: '', reports: initialReports(), current: 'WX-1008-014', deleteConfirm: false, menu: false }); render(); }
});
document.addEventListener('input', event => { if (event.target.id === 'description') { state.text = event.target.value; updateSend(); } });
document.addEventListener('change', event => {
  if (event.target.id === 'consent') { state.consent = event.target.checked; render(); }
  if (event.target.id === 'scenario') { state.scenario = event.target.value; state.toast = ''; if (!available()) state.consent = false; render(); }
  if (event.target.id === 'admin-status') { selected().status = event.target.value; render(); }
  if (event.target.id === 'file-input') { addFiles([...event.target.files]); event.target.value = ''; }
});
document.addEventListener('keydown', event => {
  if (event.target.closest('input, textarea, select, [contenteditable]') || document.querySelector('dialog[open]')) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); cycle(event.key === 'ArrowRight' ? 1 : -1); }
  if (event.key === 'Escape' && state.screen !== 'edit') { state.screen = 'edit'; render(); }
});
app.addEventListener('paste', event => {
  if (state.screen !== 'edit' || state.surface !== 'client') return;
  const files = [...event.clipboardData.items].filter(item => item.kind === 'file').map(item => item.getAsFile()).filter(Boolean);
  if (files.length) { event.preventDefault(); addFiles(files); }
});
app.addEventListener('dragover', event => { if (state.screen === 'edit' && state.surface === 'client') { event.preventDefault(); document.querySelector('[data-drop-zone]')?.classList.add('drag-over'); } });
app.addEventListener('dragleave', () => document.querySelector('[data-drop-zone]')?.classList.remove('drag-over'));
app.addEventListener('drop', event => { if (state.screen === 'edit' && state.surface === 'client') { event.preventDefault(); addFiles([...event.dataTransfer.files]); } });
render();
