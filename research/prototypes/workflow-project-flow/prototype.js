// Prototype state only. This file never calls Worket, an executor, or a persistence API.
const variants = ['A','B'];
let variant = new URL(location.href).searchParams.get('variant') === 'B' ? 'B' : 'A';
let currentRun = 'A';
let inspectorOpen = false;
const label = {READY:'可开展',PREPARED:'等待接手',EXECUTING:'执行中',SUBMITTED:'待验收',ACCEPTED:'已验收'};
const nodeNames = {guide:'撰写指南',checklist:'独立核对清单',delivery:'整理交付索引'};
const fileNames = {guide:'document.md',checklist:'checklist.md',delivery:'index.md'};
const criteria = {guide:['主题、读者和任务标识与本次材料一致','按钮、操作和能力边界与材料事实一致','内容可直接使用，文件存在且依据真实'],checklist:['主题和任务标识与本次材料一致','至少八项且每项有可执行核对方法','只依赖本次材料，无另一任务信息'],delivery:['任务标识和两份输入属于本次运行','SHA-256 与实际采用输入一致','文件存在、链接可定位，未代替业务验收']};
const phases = p => p==='ACCEPTED'?'done':p==='SUBMITTED'?'review':['PREPARED','EXECUTING'].includes(p)?'working':'';
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const status = p => `<span class="status ${phases(p)}">${label[p]||p}</span>`;
const seed = () => ({
 A:{name:'工作流上手指南',brief:'worket-start.md',selected:'guide',nodes:{guide:{generation:4,phase:'SUBMITTED',accepted:3,history:[{generation:3,result:'已验收'}]},checklist:{generation:2,phase:'ACCEPTED',accepted:2,history:[{generation:1,result:'已退回'}]},delivery:{generation:1,phase:'ACCEPTED',accepted:1,adoptedGuide:3,adoptedChecklist:2,history:[]}}},
 B:{name:'验收返工操作指南',brief:'worket-rework.md',selected:'delivery',nodes:{guide:{generation:3,phase:'ACCEPTED',accepted:3,history:[{generation:2,result:'已退回'}]},checklist:{generation:2,phase:'ACCEPTED',accepted:2,history:[{generation:1,result:'已退回'}]},delivery:{generation:1,phase:'ACCEPTED',accepted:1,adoptedGuide:3,adoptedChecklist:2,history:[]}}}
});
let runs=seed();
const $=s=>document.querySelector(s);
const active=()=>runs[currentRun];
const stale=r=>r.nodes.guide.phase==='ACCEPTED'&&r.nodes.delivery.adoptedGuide&&r.nodes.guide.generation>r.nodes.delivery.adoptedGuide;
function nodeMarkup(key, n) {
 const r = active();
 const desc = {guide:'操作步骤与常见问题', checklist:'依据同一材料，独立核对', delivery:'汇合正文与清单的已验收成果'}[key];
 const adoption = key === 'delivery' ? (n.adoptedGuide
  ? `<span>正文 · 第 ${n.adoptedGuide} 轮</span><span>清单 · 第 ${n.adoptedChecklist} 轮</span>`
  : '<span>输入就绪 · 开展时固定</span>') : '';
 const previous = n.history.at(-1);
 return `<article class="flow-node ${r.selected === key ? 'selected' : ''}" id="node-${key}" data-kind="${key}">
  <div class="node-face"><button class="node-select" data-node="${key}" aria-pressed="${r.selected === key}" aria-label="${nodeNames[key]}，第 ${n.generation} 轮，${label[n.phase]}">
   <div class="node-heading"><h3>${nodeNames[key]}</h3>${status(n.phase)}</div>
   <p class="node-description">${desc}</p>
   <div class="executor"><span class="app-tile"><img src="/workbuddy.png" alt=""></span><span>WorkBuddy</span><span class="round">第 ${n.generation} 轮</span></div>
   <div class="node-file"><span class="file-chip">${fileNames[key]}</span><span>${n.phase === 'READY' ? '待生成' : n.phase === 'ACCEPTED' ? '成果已固定' : n.phase === 'SUBMITTED' ? '等你验收' : '处理中'}</span></div>
   ${adoption ? `<div class="node-adoption">${adoption}</div>` : ''}
  </button></div>
  ${previous && key === 'guide' ? `<button class="history-peek" data-history="${key}" aria-label="${nodeNames[key]}的历史交付"><span>第 ${previous.generation} 轮 · ${esc(previous.result)}</span><span>历史交付 ↗</span></button>` : ''}
 </article>`;
}
function render() {
 document.body.classList.toggle('variant-b', variant === 'B');
 document.body.classList.toggle('inspector-open', inspectorOpen);
 $('#variant-name').textContent = variant === 'A' ? 'A · 关系画布' : 'B · 验收工作台';
 const r = active();
 $('#run-id').textContent = currentRun;
 $('#run-title').textContent = r.name;
 const reviews = Object.values(r.nodes).filter(n => n.phase === 'SUBMITTED').length;
 const allReviews = Object.values(runs).flatMap(r => Object.values(r.nodes)).filter(n => n.phase === 'SUBMITTED').length;
 const accepted = Object.values(r.nodes).filter(n => n.phase === 'ACCEPTED').length;
 $('#run-status').innerHTML = reviews ? `<span class="status review">${reviews} 项待验收</span>` : accepted === 3 ? '<span class="status done">已完成</span>' : '<span class="status working">进行中</span>';
 $('#review-count').textContent = allReviews;
 $('#canvas-review-count').textContent = `${reviews} 项交付`;
 $('#input-name').textContent = r.brief;
 $('#run-list').innerHTML = Object.entries(runs).map(([id, run]) => {
  const count = Object.values(run.nodes).filter(n => n.phase === 'ACCEPTED').length;
  const pending = Object.values(run.nodes).filter(n => n.phase === 'SUBMITTED').length;
  return `<button class="run-option ${id === currentRun ? 'active' : ''}" data-run="${id}" aria-pressed="${id === currentRun}" aria-label="${id} · ${run.name}"><span class="run-number">${id}</span><span><strong>${run.name}</strong><small>${count}/3 已验收${pending ? ' · '+pending+' 项待验收' : count === 3 ? ' · 已完成' : ' · 进行中'}</small></span></button>`;
 }).join('');
 $('#nodes').innerHTML = Object.entries(r.nodes).map(([key, n]) => nodeMarkup(key, n)).join('');
 $('#adoption-callout').innerHTML = stale(r) ? `<button class="adoption-hint" data-action="impact"><strong>正文第 ${r.nodes.guide.generation} 轮已验收 ↗</strong><span>索引仍采用第 ${r.nodes.delivery.adoptedGuide} 轮 · 查看影响</span></button>` : '';
 renderInspector();
 $('#state-dump').textContent = JSON.stringify({variant, currentRun, runs}, null, 2);
 const n = r.nodes[r.selected];
 $('#advance-demo').disabled = !['PREPARED','EXECUTING'].includes(n.phase);
 $('#advance-demo').textContent = n.phase === 'PREPARED' ? '模拟执行者接手' : n.phase === 'EXECUTING' ? '模拟提交成果' : '推进执行者状态';
 requestAnimationFrame(drawConnections);
}
function renderInspector(){
 const r=active(),key=r.selected,n=r.nodes[key];
 const inputs=key==='delivery'?`<ul class="adoption-list"><li><span>撰写指南</span><b>第 ${n.adoptedGuide||r.nodes.guide.generation} 轮${n.adoptedGuide?'':' · 将采用'}</b></li><li><span>独立核对清单</span><b>第 ${n.adoptedChecklist||r.nodes.checklist.generation} 轮${n.adoptedChecklist?'':' · 将采用'}</b></li></ul>`:`<ul class="adoption-list"><li><span>${r.brief}</span><b>本次固定输入</b></li></ul>`;
 const currentFile=['ACCEPTED','SUBMITTED'].includes(n.phase)?`<div class="file-detail"><strong>${fileNames[key]}</strong><small>第 ${n.generation} 轮 · ${n.phase==='ACCEPTED'?'已验收固定成果':'已提交，待逐项验收'}</small></div>`:`<p class="note">${n.phase==='READY'?'前置输入已就绪。':n.phase==='PREPARED'?'已交给 WorkBuddy，尚未确认接手。':'WorkBuddy 已接手，尚未提交成果。'}</p>`;
 let actions=n.phase==='SUBMITTED'?'<button class="primary" data-action="review">验收交付</button>':n.phase==='READY'?'<button class="primary" data-action="start">开展工作</button>':'';
 if(['ACCEPTED','SUBMITTED'].includes(n.phase))actions+='<button class="subtle-action" data-action="preview">查看本轮成果</button>';
 if(n.phase!=='READY')actions+='<button class="subtle-action" data-action="rework">重做这一步</button>';
 const update=stale(r)?`<div class="new-version"><strong>正文第 ${r.nodes.guide.generation} 轮可采用</strong><p>已开展的索引仍采用正文第 ${r.nodes.delivery.adoptedGuide} 轮。</p><button data-action="impact">查看影响与采用新版 →</button></div>`:'';
 $('#inspector').innerHTML=`<div><div class="inspector-head"><span class="small-label">${currentRun} · ${r.name}</span><button class="quiet" id="inspector-close" data-action="hide-inspector" aria-label="收起节点详情">×</button></div><div style="margin-bottom:9px">${status(n.phase)}</div><h2>${nodeNames[key]}</h2><p class="contract-name">${key==='guide'?'撰写产品指南':nodeNames[key]} · Contract v1</p><div class="detail-row"><span>当前轮次</span><strong>第 ${n.generation} 轮</strong></div></div><div class="inspector-body"><section class="inspector-section"><h4>本次交付</h4>${currentFile}${n.note?`<p class="note" style="margin-top:12px">${esc(n.note)}</p>`:''}</section><section class="inspector-section"><h4>${key==='delivery'&&n.adoptedGuide?'实际采用的输入':'输入来源'}</h4>${inputs}</section></div><div class="inspector-bottom">${update}<div class="inspector-actions">${actions}</div><details class="history"><summary>历史交付与验收 · ${n.history.length} 轮</summary>${n.history.map(h=>`<div class="history-item">第 ${h.generation} 轮 · ${esc(h.result)}${h.note?'<br>'+esc(h.note):''}</div>`).join('')||'<p>尚无历史轮次</p>'}</details></div>`;
}
function drawConnections() {
 const area = $('#canvas').getBoundingClientRect();
 const box = id => { const b = $(id).getBoundingClientRect(); return {x:b.x-area.x,y:b.y-area.y,w:b.width,h:b.height}; };
 const p = box('#input-pill'), g = box('#node-guide .node-face'), c = box('#node-checklist .node-face'), d = box('#node-delivery .node-face'), root = box('#run-pill');
 const svg = $('#edges');
 svg.setAttribute('viewBox', `0 0 ${area.width} ${area.height}`);
 const dot = (x,y) => `<circle cx="${x}" cy="${y}" r="4.1"/>`;
 const bottom = b => ({x:b.x+b.w/2, y:b.y+b.h});
 const top = b => ({x:b.x+b.w/2, y:b.y});
 const left = b => ({x:b.x, y:b.y+b.h/2});
 const rounded = (a,b,mid) => {
  if (Math.abs(a.x-b.x)<1) return `M ${a.x} ${a.y} V ${b.y}`;
  const dir = b.x>a.x ? 1 : -1;
  const radius = Math.min(20,Math.abs(a.x-b.x)/3,(mid-a.y)/2,(b.y-mid)/2);
  return `M ${a.x} ${a.y} V ${mid-radius} Q ${a.x} ${mid} ${a.x+dir*radius} ${mid} H ${b.x-dir*radius} Q ${b.x} ${mid} ${b.x} ${mid+radius} V ${b.y}`;
 };
 const edge = (from,to,mid,name) => `<g data-edge="${name}"><path d="${rounded(from,to,mid)}"/>${dot(from.x,from.y)}${dot(to.x,to.y)}</g>`;
 let html = `<path class="inactive context-edge" d="M ${bottom(root).x} ${bottom(root).y} V ${top(p).y}"/>`;
 const branchY = bottom(p).y + 40;
 html += edge(bottom(p),top(g),branchY,'input-guide') + edge(bottom(p),top(c),branchY,'input-checklist');
 if (variant === 'A') {
  const a = bottom(g), b = left(d), midY = d.y+d.h/2, elbow = 21;
  html += `<g data-edge="guide-delivery"><path d="M ${a.x} ${a.y} V ${midY-elbow} Q ${a.x} ${midY} ${a.x+elbow} ${midY} H ${b.x}"/>${dot(a.x,a.y)}${dot(b.x,b.y)}</g>`;
  html += edge(bottom(c),top(d),(bottom(c).y+top(d).y)/2,'checklist-delivery');
 } else {
  const target = top(d), y = d.y-30;
  html += edge(bottom(g),{x:target.x-20,y:target.y},y,'guide-delivery') + edge(bottom(c),{x:target.x+20,y:target.y},y,'checklist-delivery');
 }
 const adopted = active().nodes.delivery;
 const guideVersion = adopted.adoptedGuide ? `正文 · 第 ${adopted.adoptedGuide} 轮` : '正文 · 开展时固定';
 const checkVersion = adopted.adoptedChecklist ? `清单 · 第 ${adopted.adoptedChecklist} 轮` : '清单 · 开展时固定';
 if (variant === 'A') html += `<text class="edge-label" x="${g.x+g.w/2+10}" y="${g.y+g.h+87}">${guideVersion}</text><text class="edge-label" x="${c.x+c.w/2+13}" y="${c.y+c.h+42}">${checkVersion}</text>`;
 svg.innerHTML = html;
}
function openDialog(title,body,footer){$('#dialog-content').innerHTML=`<div class="modal-head"><h2>${title}</h2><button class="quiet" data-action="close">关闭</button></div><div class="modal-body">${body}<p class="error" id="dialog-error" aria-live="polite"></p></div><div class="modal-footer">${footer}</div>`;$('#action-dialog').showModal();}
function closeDialog(){$('#action-dialog').close();}
function rework(note){const r=active(),n=r.nodes[r.selected];n.history.push({generation:n.generation,result:n.phase==='SUBMITTED'?'退回修改':'已保留',note});n.generation++;n.phase='READY';n.note=note;if(r.selected==='delivery'){delete n.adoptedGuide;delete n.adoptedChecklist;}closeDialog();render();}
function handle(action){
 const r=active(),key=r.selected,n=r.nodes[key];
 if(action==='close'){closeDialog();return;}
 if(action==='hide-inspector'){inspectorOpen=false;render();return;}
 if(action==='inbox'){
  const pending=Object.entries(runs).flatMap(([id,run])=>Object.entries(run.nodes).filter(([,item])=>item.phase==='SUBMITTED').map(([node,item])=>`<button class="review-row" data-review-run="${id}" data-review-node="${node}"><span><strong>${nodeNames[node]}</strong><small>${id} · ${run.name} / 第 ${item.generation} 轮</small></span><span>开始验收 →</span></button>`));
  openDialog('集中待验收',pending.join('')||'<p>当前两次运行没有待验收交付。</p>','<button class="outline" data-action="close">返回画布</button>');return;
 }

 if(action==='review'){
  const excerpt=key==='guide'?'<p>新增：连接一个实际输入</p><ol><li>选择下游节点，打开输入来源。</li><li>选择上游固定成果，保存连接。</li><li>开展、提交并逐项验收。</li></ol>':key==='checklist'?'<p>核对任务标识、固定输入、实际操作、验收放行与新版影响范围；每项包含预期行为与可执行核对方法。</p>':`<p>正文：撰写指南第 ${n.adoptedGuide} 轮。<br>清单：独立核对清单第 ${n.adoptedChecklist} 轮。<br>索引分别记录来源版本、固定路径与 SHA-256。</p>`;
  openDialog('验收交付',`<p>${r.name} / ${nodeNames[key]} / 第 ${n.generation} 轮</p><div class="preview-document"><h3>${fileNames[key]}</h3>${excerpt}</div>${criteria[key].map(t=>`<label class="criterion"><input type="checkbox" data-criterion>${t}</label>`).join('')}<label class="field-label" for="review-note">修改意见</label><textarea id="review-note"></textarea>`,'<button class="danger" data-action="reject">退回修改</button><button class="primary" data-action="approve">通过验收</button>');
 }else if(action==='approve'){
  if([...document.querySelectorAll('[data-criterion]')].some(x=>!x.checked)){$('#dialog-error').textContent='请逐项核对所有验收要求。';return;}
  n.phase='ACCEPTED';n.accepted=n.generation;delete n.note;closeDialog();render();
 }else if(action==='reject'){
  const note=$('#review-note').value.trim();if(!note){$('#dialog-error').textContent='请写明本轮需要修改的内容。';return;}rework(note);
 }else if(action==='rework'){
  openDialog('重做这一步',`<p>只为「${nodeNames[key]}」创建新一轮。旧成果和验收记录保留。</p><label class="field-label" for="rework-note">本轮修改要求</label><textarea id="rework-note"></textarea>`,'<button class="outline" data-action="close">取消</button><button class="primary" data-action="confirm-rework">创建新一轮</button>');
 }else if(action==='confirm-rework'){const note=$('#rework-note').value.trim();if(!note){$('#dialog-error').textContent='请填写本轮修改要求。';return;}rework(note);
 }else if(action==='impact'){
  openDialog('采用正文新版',`<p>采用「撰写指南」第 ${r.nodes.guide.generation} 轮的已验收成果。</p><div class="impact-item"><strong>整理交付索引</strong><span>创建新轮次</span></div><div class="preserved">独立核对清单 · 保留第 ${r.nodes.checklist.generation} 轮<br>另一运行 · 保持原样<br>旧索引与验收历史 · 完整保留</div>`,'<button class="outline" data-action="close">暂不采用</button><button class="primary" data-action="adopt">确认重做这 1 步</button>');
 }else if(action==='adopt'){
  const index=r.nodes.delivery;index.history.push({generation:index.generation,result:'已验收 · 采用旧正文'});index.generation++;index.phase='READY';index.note=`采用正文第 ${r.nodes.guide.generation} 轮，重做交付索引`;delete index.adoptedGuide;delete index.adoptedChecklist;r.selected='delivery';inspectorOpen=true;closeDialog();render();
 }else if(action==='start'){
  openDialog('交给执行者',`<p>${r.name} / ${nodeNames[key]} / 第 ${n.generation} 轮</p><div class="file-detail" style="margin-top:18px"><strong><img src="/workbuddy.png" alt="" style="width:18px;height:18px;vertical-align:middle;margin-right:8px">WorkBuddy</strong><small>打开任务后，仍需确认发送和接手。</small></div>`,'<button class="outline" data-action="close">取消</button><button class="primary" data-action="dispatch">交给 WorkBuddy</button>');
 }else if(action==='dispatch'){
  n.phase='PREPARED';if(key==='delivery'){n.adoptedGuide=r.nodes.guide.generation;n.adoptedChecklist=r.nodes.checklist.generation;}closeDialog();render();
 }else if(action==='preview'){
  openDialog('本轮成果',`<p>${nodeNames[key]} / 第 ${n.generation} 轮 / ${fileNames[key]}</p><div class="preview-document"><h3>${r.name}</h3><p>${key==='delivery'?`实际采用：正文第 ${n.adoptedGuide} 轮；独立清单第 ${n.adoptedChecklist} 轮。`:'本次交付已固定，逐项验收后供下游采用。'}</p></div>`,'<button class="outline" data-action="close">返回画布</button>');
 }
}
document.addEventListener('click',e=>{
 const review=e.target.closest('[data-review-run]');
 if(review){currentRun=review.dataset.reviewRun;active().selected=review.dataset.reviewNode;inspectorOpen=true;closeDialog();render();handle('review');return;}
 const run=e.target.closest('[data-run]');if(run){currentRun=run.dataset.run;render();return;}
 const node=e.target.closest('[data-node]');if(node){active().selected=node.dataset.node;inspectorOpen=true;render();return;}
 const history=e.target.closest('[data-history]');if(history){const key=history.dataset.history;const n=active().nodes[key];openDialog(`${nodeNames[key]} · 历史交付`,n.history.map(h=>`<div class="history-item">第 ${h.generation} 轮 · ${esc(h.result)}${h.note?'<br>'+esc(h.note):''}</div>`).join(''),'<button class="outline" data-action="close">返回画布</button>');return;}
 const a=e.target.closest('[data-action]');if(a)handle(a.dataset.action);
});
function switchVariant(delta){variant=variants[(variants.indexOf(variant)+delta+2)%2];const u=new URL(location.href);u.searchParams.set('variant',variant);history.replaceState(null,'',u);render();}
$('#variant-prev').onclick=()=>switchVariant(-1);$('#variant-next').onclick=()=>switchVariant(1);
document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA'].includes(e.target.tagName)||e.target.isContentEditable||$('#action-dialog').open)return;if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();switchVariant(e.key==='ArrowLeft'?-1:1);}});
function reset(){runs=seed();currentRun='A';inspectorOpen=false;render();}
$('#reset-top').onclick=reset;
$('#advance-demo').onclick=()=>{const n=active().nodes[active().selected];if(n.phase==='PREPARED')n.phase='EXECUTING';else if(n.phase==='EXECUTING')n.phase='SUBMITTED';render();};
$('#review-inbox').onclick=()=>handle('inbox');
$('#view-structure').onclick=()=>openDialog('连接关系 · 流程 v1',`<div class="binding-row"><span>本次材料<br><b>固定输入</b></span><span>→</span><span>撰写指南<br><b>资料输入</b></span></div><div class="binding-row"><span>本次材料<br><b>固定输入</b></span><span>→</span><span>独立核对清单<br><b>资料输入</b></span></div><div class="binding-row"><span>撰写指南<br><b>document.md</b></span><span>→</span><span>整理交付索引<br><b>正文输入</b></span></div><div class="binding-row"><span>独立核对清单<br><b>checklist.md</b></span><span>→</span><span>整理交付索引<br><b>清单输入</b></span></div><p style="margin-top:18px">索引采用验收通过的具体成果轮次。已采用的输入保持固定，使用新版需单独确认影响范围。</p>`,'<button class="outline" data-action="close">返回画布</button>');
window.addEventListener('resize',drawConnections);render();
