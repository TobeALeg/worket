/** Spans are owned by the program; models select IDs instead of retyping quotations. Offsets are UTF-16. */
export function indexSource(record) {
 const byId=new Map();
 const messages=record.messages.map(m=>{
  const spans=[];let start=0;
  while(start<m.content.length){
   let end=Math.min(start+400,m.content.length);
   const boundary=m.content.slice(start,end).search(/[。！？\n]/u);
   if(boundary>=0)end=start+boundary+1;
   if(end<m.content.length&&/[\uD800-\uDBFF]/.test(m.content[end-1]))end--;
   const span={spanId:`${m.id}:s${spans.length+1}`,messageId:m.id,start,end,quote:m.content.slice(start,end)};
   byId.set(span.spanId,span);spans.push({id:span.spanId,text:span.quote});start=end;
  }
  return {id:m.id,role:m.role,...(m.episodeId?{episodeId:m.episodeId}:{}),spans};
 });
 return {byId,view:{schemaVersion:record.schemaVersion,kind:record.kind,id:record.id,work:record.work,messages}};
}
export function hydrateDraft(draft,index) {
 for(const r of draft.requirements??[]){r.supersedes??=[];r.applicability??='';}
 for(const item of [...(draft.requirements??[]),...(draft.questions??[])]) {
  if(!Array.isArray(item.evidence))continue;
  item.evidence=item.evidence.map(ref=>{
   if(!ref.spanId)return ref; // legacy normalized WorkRecord draft fixtures; validated by exact quote below
   const span=index.byId.get(ref.spanId);
   return span?{...span}:ref;
  });
 }
 return draft;
}
