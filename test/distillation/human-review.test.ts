import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createReview, applyCommand, summary, hash } from '../../scripts/lib/human-review/model.mjs';
import { ReviewStore } from '../../scripts/lib/human-review/store.mjs';
import { createReviewServer } from '../../scripts/lib/human-review/server.mjs';

const sample = { id:'qa-case', title:'测试工作', group:'测试', record:{id:'source',work:{focus:'测试工作'},messages:[{id:'m1',role:'user',content:'按净额降序，并保留零金额客户。'}]}, draft:{id:'draft',workInstanceId:'work',sourceRecordId:'source',snapshotHash:'snapshot',analysisRunId:'run',requirements:[{id:'r1',text:'按净额排序',status:'ACTIVE',scope:'INSTANCE',applicability:'本次',evidence:[]},{id:'r2',text:'保留零金额客户',status:'ACTIVE',scope:'INSTANCE',applicability:'本次',evidence:[]}],questions:[{id:'q1',text:'是否按净额排序？',priority:'OPTIONAL',evidence:[]}]}};
const command = (review, body) => ({operationId:randomUUID(),revision:review.revision,...body});
const advance = (review, body) => applyCommand(sample,review,command(review,body));

test('接受、修改、新决定与问题分别计数，原稿不变', () => {
  const original = hash(sample.draft);
  let review = createReview(sample);
  review = advance(review,{type:'decision',key:'requirement:r1',verdict:'ACCEPT'});
  review = advance(review,{type:'decision',key:'requirement:r2',verdict:'MODIFY',basis:'NEW_DECISION',corrected:{text:'不保留零金额客户',status:'ACTIVE',scope:'INSTANCE',applicability:'本次'}});
  review = advance(review,{type:'decision',key:'question:q1',verdict:'REJECT'});
  const metrics = summary(sample,review);
  assert.equal(metrics.reviewed,3); assert.equal(metrics.historicalAccepted,1); assert.equal(metrics.historicalJudged,1); assert.equal(metrics.newDecisions,1); assert.equal(metrics.rejected,0);
  assert.equal(hash(sample.draft),original);
});
test('保存重试幂等；旧页面不能覆盖新评价', () => {
  const initial = createReview(sample), op = command(initial,{type:'decision',key:'requirement:r1',verdict:'ACCEPT'});
  const reviewed = applyCommand(sample,initial,op);
  assert.deepEqual(applyCommand(sample,reviewed,op),reviewed);
  assert.throws(() => applyCommand(sample,reviewed,command(initial,{type:'decision',key:'requirement:r1',verdict:'REJECT'})), error => error.status === 409);
});
test('撤销恢复当前条目和前一评价，保留完整操作历史', () => {
  let review = createReview(sample);
  review = advance(review,{type:'decision',key:'requirement:r1',verdict:'ACCEPT',nextKey:'requirement:r2'});
  review = advance(review,{type:'decision',key:'requirement:r2',verdict:'REJECT',nextKey:'question:q1'});
  review = advance(review,{type:'undo'});
  assert.equal(review.cursor,'requirement:r2'); assert.equal(review.decisions['requirement:r2'],undefined); assert.equal(review.decisions['requirement:r1'].verdict,'ACCEPT');
  review = advance(review,{type:'undo'});
  assert.deepEqual(review.decisions,{}); assert.equal(review.events.length,4);
  assert.throws(() => advance(review,{type:'undo'}));
});
test('未审阅、暂放、编辑暂存和遗漏核对均阻止提交', () => {
  let review = createReview(sample);
  assert.throws(() => advance(review,{type:'submit'}));
  for (const key of ['requirement:r1','requirement:r2','question:q1']) review = advance(review,{type:'decision',key,verdict:key === 'question:q1' ? 'UNSURE' : 'ACCEPT'});
  assert.throws(() => advance(review,{type:'submit'}));
  review = advance(review,{type:'decision',key:'question:q1',verdict:'REJECT'});
  assert.throws(() => advance(review,{type:'submit'}));
  review = advance(review,{type:'complete-check',value:true});
  review = advance(review,{type:'buffer',key:'requirement:r1',buffer:{text:'尚未决定的修改'}});
  assert.throws(() => advance(review,{type:'submit'}));
  review = advance(review,{type:'discard-buffer',key:'requirement:r1'});
  review = advance(review,{type:'omission-buffer',buffer:{text:'未保存的遗漏',basis:'MISSED'}});
  assert.throws(() => advance(review,{type:'submit'}));
  review = advance(review,{type:'omission-buffer',buffer:null});
  review = advance(review,{type:'submit'});
  assert.equal(review.status,'SUBMITTED');
  assert.throws(() => advance(review,{type:'decision',key:'requirement:r1',verdict:'REJECT'}));
  review = advance(review,{type:'reopen'});
  assert.equal(review.status,'IN_PROGRESS'); assert.equal(review.completenessChecked,false);
});
test('遗漏、新意图和新决定保留出处且支持撤销', () => {
  let review = createReview(sample);
  review = advance(review,{type:'omission',text:'按净额降序',basis:'MISSED',evidenceIds:['m1']});
  assert.equal(summary(sample,review).missed,1);
  assert.throws(() => advance(review,{type:'omission',text:'不存在来源',basis:'MISSED',evidenceIds:['m2']}));
  review = advance(review,{type:'remove-omission',id:review.omissions[0].id});
  assert.equal(review.omissions.length,0);
  review = advance(review,{type:'undo'}); assert.equal(review.omissions.length,1);
});
test('无效命令与空修改拒绝落盘', () => {
  const review = createReview(sample);
  for (const body of [{type:'decision',key:'requirement:other',verdict:'ACCEPT'},{type:'decision',key:'requirement:r1',verdict:'MODIFY',corrected:{text:' '}},{type:'omission',basis:'MISSED',text:''}]) assert.throws(() => advance(review,body));
  assert.throws(() => applyCommand({...sample,draft:{...sample.draft,id:'other'}},review,command(review,{type:'submit'})));
});
test('原子落盘、重启恢复、工作隔离与并发冲突', async () => {
  const dir = await mkdtemp(join(tmpdir(),'worket-review-test-'));
  try {
    const second = {...sample,id:'qa-second',draft:{...sample.draft,id:'draft2',workInstanceId:'work2'}};
    const store = new ReviewStore([sample,second],dir,'qa-automation'); await store.initialize();
    const review = store.detail(sample.id).review;
    const outcomes = await Promise.allSettled(['ACCEPT','REJECT'].map(verdict => store.mutate(sample.id,command(review,{type:'decision',key:'requirement:r1',verdict}))));
    assert.equal(outcomes.filter(result => result.status === 'fulfilled').length,1);
    assert.equal(store.detail(second.id).review.revision,0);
    const fresh = new ReviewStore([sample,second],dir); await fresh.initialize();
    assert.equal(fresh.detail(sample.id).review.decisions['requirement:r1'].verdict,'ACCEPT');
    assert.equal(fresh.detail(sample.id).review.reviewer,'qa-automation');
    const disk = JSON.parse(await readFile(join(dir,`${sample.id}.json`),'utf8')); assert.equal(disk.revision,1);
    assert.equal(fresh.export(sample.id).sample.draft.id,'draft');
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('HTTP：仅本机同源、会话令牌、输入检查和导出', async () => {
  const dir = await mkdtemp(join(tmpdir(),'worket-review-http-'));
  const { server } = await createReviewServer({samples:[sample],outputDir:dir,reviewer:'qa-automation'});
  try {
    await new Promise((resolve,reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const html = await (await fetch(base)).text(), token = html.match(/name="review-token" content="([a-f0-9]+)"/)[1];
    const headers = {'X-Review-Token':token,'Content-Type':'application/json'};
    assert.equal((await fetch(`${base}/api/cases`)).status,403);
    assert.equal((await fetch(`${base}/api/cases`,{headers:{...headers,Origin:'https://other.example'}})).status,403);
    const listing = await (await fetch(`${base}/api/cases`,{headers})).json();
    assert.equal(listing.cases[0].summary.total,3);
    const detail = await (await fetch(`${base}/api/cases/qa-case`,{headers})).json();
    assert.equal((await fetch(`${base}/api/cases/qa-case`,{method:'POST',headers,body:'invalid'})).status,400);
    const saved = await (await fetch(`${base}/api/cases/qa-case`,{method:'POST',headers,body:JSON.stringify(command(detail.review,{type:'decision',key:'requirement:r1',verdict:'ACCEPT'}))})).json();
    assert.equal(saved.review.revision,1);
    const exported = await (await fetch(`${base}/api/cases/qa-case/export`,{headers})).json();
    assert.equal(exported.review.reviewer,'qa-automation'); assert.equal(exported.sample.record.id,'source');
  } finally { await new Promise(resolve => server.close(resolve)); await rm(dir,{recursive:true,force:true}); }
});
