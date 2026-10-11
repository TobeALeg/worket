import type { FeedbackDraft, LocalReport } from "../problem-reports/store.js";
import type { ReportImage, DiagnosticSnapshot } from "../contracts/problem-report.js";
import { worketBrand } from "./ui.js";

const icon='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a7 7 0 0 1-7 7H8l-5 3V6a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3z"/><path d="M11.5 7v4m0 3h.01"/></svg>';
const imageIcon='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';
const captureIcon='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg>';
export const feedbackEntry=`<button class="icon-button feedback-entry" data-feedback-open aria-label="反馈问题" title="反馈问题">${icon}</button>`;
const esc=(v:unknown)=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const api=(action:string,input?:unknown)=>window.workpet.feedback(action,input);
const date=(value:string)=>new Date(value).toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
const imageURL=(image:ReportImage)=>`data:image/png;base64,${image.data}`;
const phases={start:"开始",complete:"完成",failed:"失败",pending:"等待确认",selected:"已选择", "open-requested":"已请求打开",preparing:"准备中",prepared:"已准备",opening:"正在打开"};
const actions={app:"应用",renderer:"界面",connection:"服务连接",record:"记录",sync:"同步",handoff:"交接",distillation:"沉淀",update:"更新",feedback:"反馈发送"};
function logsHTML(snapshot: DiagnosticSnapshot): string {
  return `<dl class="fb-meta"><dt>时间范围</dt><dd>${esc(date(snapshot.from))} — ${esc(date(snapshot.to))}</dd><dt>运行事件</dt><dd>${snapshot.events.length} 条</dd></dl>${snapshot.previousExit ? '<p class="fb-muted">上次未正常退出</p>' : ''}${snapshot.truncated ? '<p class="fb-muted">日志不完整，仍可提交反馈。</p>' : ''}<ol class="fb-timeline">${snapshot.events.map(event=>`<li><time>${esc(new Date(event.at).toLocaleTimeString("zh-CN"))}</time><div><strong>${actions[event.action]} · ${phases[event.phase]}</strong><p>${esc([event.executor,event.code,event.elapsedMs !== undefined ? `${event.elapsedMs} ms` : '',event.requestId ? `请求 ${event.requestId}` : ''].filter(Boolean).join(' · '))}</p></div></li>`).join('')}</ol><div class="fb-scope">包含版本、操作步骤、错误码与请求编号；不包含聊天正文、文件内容或访问令牌。报告保存 30 天。</div><details><summary>查看脱敏事件</summary><pre>${esc(JSON.stringify(snapshot.events,null,2))}</pre></details>`;
}
export function setupProblemFeedback(): {collapse:()=>void} {
  const modal=document.createElement("dialog");modal.id="feedback-dialog";modal.className="page-dialog";modal.setAttribute("aria-label","问题反馈");document.body.append(modal);
  const file=document.createElement("input");file.type="file";file.accept="image/png,image/jpeg";file.multiple=true;file.hidden=true;document.body.append(file);
  const preview=document.createElement("dialog");preview.id="feedback-image-preview";preview.setAttribute("aria-label","截图预览");document.body.append(preview);
  let draft: FeedbackDraft | null=null, view:"edit"|"logs"|"history"|"detail"="edit", error="", busy=false;
  let current:string|null=null, local:LocalReport|null=null, remote:any=null, list:any[]=[], poll:ReturnType<typeof setInterval>|null=null;
  let writes:Promise<unknown>=Promise.resolve();let generation=0;
  const input=()=>({description:draft!.description,consent:draft!.consent,scope:draft!.scope});
  function failure(e:unknown) {error=String(e).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,"");const element=modal.querySelector<HTMLElement>("[data-feedback-error]");if(element){element.textContent=error;element.hidden=false;}}
  function persist() {
    if(!draft)return writes;
    const payload=input();
    writes=writes.catch(()=>{}).then(()=>api("save",payload));
    void writes.catch(failure);return writes;
  }
  function collapse() {generation++;modal.close();if(poll){clearInterval(poll);poll=null;}error="";}
  function images(items:ReportImage[],edit=false):string {
    return `<div class="fb-images">${items.map(image=>`<div class="fb-image"><button data-image-id="${image.id}" aria-label="预览截图"><img src="${imageURL(image)}" alt="反馈截图"></button>${edit ? `<button class="fb-remove" data-remove-id="${image.id}" aria-label="移除截图">×</button>` : ''}</div>`).join('')}${edit && items.length<3 ? `<button class="fb-add" data-fb="add">${imageIcon}<span>添加截图</span></button>` : ''}</div>`;
  }
  function render() {
    const header=`<header class="window-bar"><div class="window-navigation"><button class="icon-button" data-fb="collapse" aria-label="收起反馈">‹</button>${worketBrand}</div><div class="brand-actions"><button class="icon-button feedback-entry active" data-fb="collapse" aria-label="收起反馈">${icon}</button><details class="secondary-menu"><summary aria-label="反馈菜单">☰</summary><div class="menu-items"><button data-fb="history">我的反馈</button><button data-fb="discard">放弃草稿</button></div></details><button class="icon-button" data-fb="collapse" aria-label="关闭反馈">×</button></div></header>`;
    let body="",footer="";
    if(view==="edit" && draft) {
      body=`<div class="fb-heading"><h2>反馈问题</h2><button class="fb-text" data-fb="history">我的反馈</button></div><div class="fb-context">${date(draft.occurredAt)}</div><label class="fb-label" for="feedback-description">发生了什么？</label><textarea id="feedback-description" ${busy ? "disabled" : ""} maxlength="4000" placeholder="刚才做了什么？哪里不符合预期？">${esc(draft.description)}</textarea><div class="fb-caption"><span>也可以直接粘贴截图</span><span data-count>${draft.description.length} / 4000</span></div><section class="fb-section"><div class="fb-label"><span>截图 <small>选填</small></span><button class="fb-text" data-fb="collapse">返回工作补截图 →</button></div>${images(draft.screenshots,true)}<div class="fb-caption"><span>最多 3 张 · 每张 5 MB</span><button class="fb-text" data-fb="capture">${captureIcon} 收起反馈并截取工作页面</button></div></section><section class="fb-diagnostic"><label><input id="feedback-consent" type="checkbox" ${busy ? "disabled" : ""} ${draft.consent ? 'checked' : ''}>附上本次诊断日志</label><button class="fb-text" data-fb="logs">查看内容 ›</button></section><p class="fb-muted">请检查文字和截图中是否有不想分享的内容。</p>`;
      footer=`<button class="primary" data-fb="send" ${busy || (!draft.description.trim() && !draft.screenshots.length) ? 'disabled' : ''}>${busy ? '正在提交…' : '发送反馈 →'}</button>`;
    } else if(view==="logs" && draft) {body=`<h2>本次诊断日志</h2>${logsHTML(draft.diagnostics)}`;footer='<button data-fb="fault">使用最近故障现场</button><button data-fb="edit">返回反馈</button>';}
    else if(view==="history") {
      body=`<div class="fb-heading"><h2>我的反馈</h2><button class="fb-text" data-fb="edit">新反馈</button></div>${list.length ? list.map(item=>`<button class="fb-report-row" data-report-id="${esc(item.reportId ?? item.id)}"><strong>${esc(item.report?.description?.slice(0,40) || item.envelope?.report.description?.slice(0,40) || '截图反馈')}</strong><span>${esc(item.state ?? sendLabel(item.status))}</span><small>${esc(date(item.receivedAt ?? new Date(item.createdAt).toISOString()))}</small></button>`).join('') : '<p class="fb-muted">暂无反馈</p>'}`;footer='<button data-fb="refresh-history">刷新</button>';
    } else if(view==="detail") {
      const report=remote?.report ?? local?.envelope?.report;
      const received=remote || local?.status === "RECEIVED";
      body=`<h2>${received ? '反馈已收到' : sendLabel(local?.status)}</h2><p class="fb-muted">${esc(local?.error || (received ? '可以在这里查看处理进展。' : '此反馈保存在本机，联网后自动发送。'))}</p><dl class="fb-meta"><dt>报告编号</dt><dd>${esc(current)}</dd><dt>处理状态</dt><dd>${esc(remote?.state ?? (received ? '待排查' : sendLabel(local?.status)))}</dd></dl>${report ? `<section class="fb-section"><h3>问题描述</h3><p class="fb-description">${esc(report.description || '仅添加截图')}</p>${images(report.screenshots)}${report.diagnostics ? `<details class="fb-section"><summary>已附本次诊断日志</summary>${logsHTML(report.diagnostics)}</details>` : ''}</section>` : ''}${remote?.publicNote ? `<section class="fb-section"><h3>处理进展</h3><p class="fb-description">${esc(remote.publicNote)}</p></section>` : ''}`;
      footer=`${received ? '<button data-fb="refresh-detail">刷新状态</button>' : ''}${local && ['WAITING','PAUSED'].includes(local.status) ? '<button data-fb="retry">立即重试</button>' : ''}${local?.envelope ? '<button data-fb="export">导出诊断包</button>' : ''}${remote || local && !['EXPIRED','DELETED','CANCELLED'].includes(local.status) ? `<button class="fb-danger" data-fb="delete">${received ? '删除反馈' : '取消发送'}</button>` : ''}<button data-fb="history">我的反馈</button>`;
    } else {body='<h2>反馈问题</h2>';footer='<button data-fb="reload">重新加载</button>';}
    modal.innerHTML=`<div class="dialog-shell">${header}<div class="dialog-card fb-main">${body}<p class="fb-error" data-feedback-error role="alert" ${error ? '' : 'hidden'}>${esc(error)}</p></div><footer class="dialog-actions">${footer}</footer></div>`;
  }
  async function open() {
    if(modal.open){collapse();return;}
    const request=++generation;view="edit";error="";render();modal.showModal();
    try {await writes.catch(()=>{});const value=await api("draft");if(request!==generation)return;draft=value;render();} catch(e){if(request===generation){failure(e);}}
  }
  async function historyView() {
    if(poll){clearInterval(poll);poll=null;}
    view="history";error="";list=await api("list");render();
    try {const result=await api("remote");if(view!=="history" || !modal.open)return;const ids=new Set(result.items.map((r:any)=>r.reportId));list=[...list.filter(r=>!ids.has(r.id)),...result.items];render();} catch { /* Local history stays usable while offline or against an old service. */ }
  }
  async function detail(id:string) {
    current=id;remote=null;local=await api("get",id).catch(()=>null);if(!modal.open)return;view="detail";error="";render();
    if(poll)clearInterval(poll);
    const refresh=async()=>{
      if(view!=="detail" || !modal.open || current!==id)return;
      const before=JSON.stringify([local?.status,local?.error,remote]);
      local=await api("get",id).catch(()=>null);
      if(!local || local.status==="RECEIVED") remote=await api("remote-detail",id).catch(()=>remote);
      if(view==="detail" && modal.open && current===id && before!==JSON.stringify([local?.status,local?.error,remote]))render();
      if(remote || local && ["DELETED","CANCELLED","EXPIRED"].includes(local.status)){if(poll)clearInterval(poll);poll=null;}
    };
    void refresh().catch(failure);poll=setInterval(()=>void refresh().catch(failure),2000);
  }
  async function addFiles(files:File[]) {
    if(busy)return;busy=true;if(modal.open)render();
    try {await writes.catch(()=>{});
    for(const item of files) {
      if(!['image/png','image/jpeg'].includes(item.type))throw new Error("请选择 PNG 或 JPG 图片");
      if(item.size>5*1024*1024)throw new Error("每张截图最多 5 MB");
      const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]!);reader.onerror=reject;reader.readAsDataURL(item);});
      draft=await api("add-image",data);
    }
    } finally {busy=false;if(modal.open)render();}
  }
  function showImage(image:ReportImage,capture=false) {
    preview.innerHTML=`<div class="fb-preview-heading"><strong>${capture ? '工作页面截图' : '截图预览'}</strong><button class="icon-button" data-preview-close aria-label="关闭截图预览">×</button></div><img class="fb-preview-image" src="${imageURL(image)}" alt="${capture ? '工作页面截图' : '反馈截图'}"><div class="fb-preview-actions">${capture ? '<button data-preview-close>取消</button><button class="primary" data-capture-use>加入反馈</button>' : '<button data-preview-close>关闭</button>'}<p class="fb-error" data-preview-error role="alert" hidden></p></div>`;
    preview.showModal();preview.querySelectorAll('[data-preview-close]').forEach(button=>button.addEventListener('click',()=>preview.close()));
    preview.querySelector<HTMLButtonElement>('[data-capture-use]')?.addEventListener('click',async event=>{const button=event.currentTarget as HTMLButtonElement;button.disabled=true;try{draft=await api('add-capture',image);preview.close();}catch(e){const message=preview.querySelector<HTMLElement>('[data-preview-error]')!;message.hidden=false;message.textContent=String(e);button.disabled=false;}});
  }
  document.addEventListener('click',event=>{if((event.target as Element).closest('[data-feedback-open]'))void open();});
  modal.addEventListener('cancel',event=>{event.preventDefault();collapse();});
  modal.addEventListener('input',event=>{if((event.target as HTMLElement).id==='feedback-description' && draft){draft.description=(event.target as HTMLTextAreaElement).value;modal.querySelector('[data-count]')!.textContent=`${draft.description.length} / 4000`;modal.querySelector<HTMLButtonElement>('[data-fb="send"]')!.disabled=busy || (!draft.description.trim() && !draft.screenshots.length);void persist();}});
  modal.addEventListener('change',event=>{if((event.target as HTMLElement).id==='feedback-consent' && draft){draft.consent=(event.target as HTMLInputElement).checked;void persist();}});
  modal.addEventListener('click',event=>{
    const button=(event.target as Element).closest<HTMLButtonElement>('button');if(!button || button.disabled)return;
    const run=async()=>{
      if(busy && button.dataset.fb!=='collapse')return;
      if(button.dataset.removeId){await writes.catch(()=>{});draft=await api('remove-image',button.dataset.removeId);render();return;}
      if(button.dataset.imageId){const items=view==='edit' ? draft?.screenshots : (remote?.report ?? local?.envelope?.report)?.screenshots;const image=items?.find((i:ReportImage)=>i.id===button.dataset.imageId);if(image)showImage(image);return;}
      if(button.dataset.reportId){await detail(button.dataset.reportId);return;}
      const action=button.dataset.fb;
      if(action==='collapse'){collapse();return;}
      if(action==='add'){file.click();return;}
      if(action==='edit'){if(poll){clearInterval(poll);poll=null;}draft=await api('draft');view='edit';error='';render();return;}
      if(action==='reload'){draft=await api('draft');error='';render();return;}
      if(action==='logs'){await writes.catch(()=>{});view='logs';error='';render();return;}
      if(action==='fault'){draft=await api('fault');render();return;}
      if(action==='history' || action==='refresh-history'){await historyView();return;}
      if(action==='capture'){
        await writes;collapse();
        await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
        const image=await api('capture');showImage(image,true);return;
      }
      if(action==='send' && draft){const payload=input();busy=true;render();try{await writes;const item=await api('submit',payload);draft=null;if(modal.open)await detail(item.id);}finally{busy=false;if(modal.open)render();}return;}
      if(action==='refresh-detail' && current){await detail(current);return;}
      if(action==='retry' && current){await api('retry',current);await detail(current);return;}
      if(action==='export' && current){await api('export',current);return;}
      if(action==='discard' || action==='delete') {
        const confirmation=document.createElement('dialog');confirmation.className='fb-confirm';confirmation.innerHTML=`<div class="dialog-card"><h2>${action==='discard' ? '放弃这份草稿？' : '删除或取消这份反馈？'}</h2><p>${action==='discard' ? '草稿文字和截图将从本机移除。' : '停止后续发送；已收到的报告及附件也会删除。'}</p><div class="dialog-actions"><button data-keep>保留</button><button class="danger" data-confirm>确认</button></div><p class="fb-error" role="alert" hidden></p></div>`;document.body.append(confirmation);confirmation.showModal();
        confirmation.querySelector('[data-keep]')!.addEventListener('click',()=>confirmation.close());confirmation.addEventListener('close',()=>confirmation.remove());
        confirmation.querySelector<HTMLButtonElement>('[data-confirm]')!.addEventListener('click',async event=>{const confirm=event.currentTarget as HTMLButtonElement;confirm.disabled=true;try{await writes.catch(()=>{});if(action==='discard'){await api('discard');draft=await api('draft');view='edit';render();}else if(current){await api(local ? 'cancel' : 'delete-remote',current);await historyView();}confirmation.close();}catch(e){const message=confirmation.querySelector<HTMLElement>('.fb-error')!;message.hidden=false;message.textContent=String(e);confirm.disabled=false;}});
      }
    };
    void run().catch(e=>{failure(e);if(!modal.open){preview.innerHTML=`<div class="dialog-card"><p class="fb-error">${esc(String(e))}</p><button data-preview-close>关闭</button></div>`;preview.showModal();preview.querySelector('[data-preview-close]')!.addEventListener('click',()=>preview.close());}});
  });
  file.addEventListener('change',()=>{void addFiles([...file.files ?? []]).catch(failure);file.value='';});
  modal.addEventListener('paste',event=>{if(view!=='edit')return;const files=[...event.clipboardData!.items].filter(i=>i.kind==='file').map(i=>i.getAsFile()).filter((f):f is File=>!!f);if(files.length){event.preventDefault();void addFiles(files).catch(failure);}});
  modal.addEventListener('dragover',event=>{if(view==='edit')event.preventDefault();});modal.addEventListener('drop',event=>{if(view==='edit'){event.preventDefault();void addFiles([...event.dataTransfer!.files]).catch(failure);}});
  window.workpet.onFeedbackCollapse(()=>{if(modal.open)collapse();preview.close();});
  let lastError=0;const recordError=()=>{if(Date.now()-lastError<5000)return;lastError=Date.now();void api('renderer-error').catch(()=>{});};
  window.addEventListener('error',recordError);window.addEventListener('unhandledrejection',recordError);
  return {collapse};
}
function sendLabel(status:LocalReport['status']|undefined):string {
  return status ? {WAITING:'尚未发送',SENDING:'正在发送',RECEIVED:'已收到',PAUSED:'发送暂停',CANCELLED:'已取消',EXPIRED:'未发送，已到期',DELETED:'已删除'}[status] : '反馈';
}
