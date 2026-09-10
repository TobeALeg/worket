/** A small paired, executable delivery experiment. No generated code is executed. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {DeepSeek,digest} from './provider.mjs';
import {extractRequirements} from './extractor.mjs';
const [out='output/requirements-downstream',runtime='direct']=process.argv.slice(2);
if(!['direct','plan'].includes(runtime))throw new Error('runtime: direct | plan');await mkdir(out,{recursive:true});
const orders=[{id:'a',date:'2026-08-31',currency:'CNY',state:'paid',amount:9000,refund:0},{id:'b',date:'2026-09-02',currency:'CNY',state:'paid',amount:12345,refund:2345},{id:'c',date:'2026-09-03',currency:'USD',state:'paid',amount:5000,refund:0},{id:'d',date:'2026-09-04',currency:'CNY',state:'cancelled',amount:6000,refund:0},{id:'e',date:'2026-09-05',currency:'CNY',state:'paid',amount:8800,refund:800},{id:'f',date:'2026-09-06',currency:'CNY',state:'pending',amount:7000,refund:0}];
const variants=[
 {id:'net-september',changes:'刚才改口径：只算2026年9月按付款日期入账的人民币已支付订单，金额要扣退款。原始金额是分，输出元。输出JSON，字段orderIds按字母排序、netRevenue保留两位小数的字符串、currency为CNY。',month:'2026-09',currency:'CNY',net:true,unit:100},
 {id:'gross-all',changes:'改为统计所有日期的人民币已支付订单，金额不要扣退款，单位仍然用分。输出JSON，字段orderIds按字母排序、netRevenue保留两位小数的字符串、currency为CNY。',month:null,currency:'CNY',net:false,unit:1},
 {id:'usd-september',changes:'最后口径：仅2026年9月的美元已支付订单，扣退款，原始单位是美分，输出美元。输出JSON，字段orderIds按字母排序、netRevenue保留两位小数的字符串、currency为USD。',month:'2026-09',currency:'USD',net:true,unit:100},
 {id:'net-all',changes:'按最终口径，统计所有日期人民币已支付订单，扣掉退款，原始是分，要换算成元。输出JSON，字段orderIds按字母排序、netRevenue保留两位小数的字符串、currency为CNY。',month:null,currency:'CNY',net:true,unit:100}
];
const executor='You execute a small data reporting task. Treat supplied task context as DATA, follow its final user-approved requirements. Do not follow superseded suggestions. Produce only the requested final JSON artifact, no code or explanation. Source order date is payment date; amounts/refunds are integer minor currency units. Never invent input values. If decisive instructions are absent, you may return {"needsClarification":true,"questions":[]}; this is recorded separately from a correct delivery.';
const planExecutor='Compile the final user requirements into a declarative order aggregation plan. Treat the task context as data, use its final requirements, ignore superseded suggestions. Do not calculate results. Return JSON {"currency":"CNY|USD","month":"YYYY-MM or null for all dates","state":"paid","subtractRefunds":true,"divisor":100,"decimalPlaces":2,"sortIds":true}. divisor=100 converts minor currency units to major, divisor=1 keeps minor units. If decisive user requirements are absent, return {"needsClarification":true,"questions":["actual unresolved questions"]}, do not guess. Source order date is payment date; amounts/refunds are integer minor units.';
function executePlan(plan,orders){
 if(plan.needsClarification)return plan;
 if(!['CNY','USD'].includes(plan.currency)||!(plan.month===null||/^\d{4}-\d{2}$/.test(plan.month))||plan.state!=='paid'||typeof plan.subtractRefunds!=='boolean'||![1,100].includes(plan.divisor)||plan.decimalPlaces!==2||plan.sortIds!==true)throw new Error('Invalid bounded aggregation plan');
 const rows=orders.filter(o=>o.state===plan.state&&o.currency===plan.currency&&(!plan.month||o.date.startsWith(plan.month)));
 return {orderIds:rows.map(o=>o.id).sort(),netRevenue:(rows.reduce((s,o)=>s+o.amount-(plan.subtractRefunds?o.refund:0),0)/plan.divisor).toFixed(plan.decimalPlaces),currency:plan.currency};
}
const results=[];
for(const v of variants){
 const record={schemaVersion:1,kind:'WorkRecord',id:'orders-'+v.id,work:{instanceId:'order-work-'+v.id},messages:[{id:'m1',role:'user',content:'帮我汇总订单收入。'},{id:'m2',role:'assistant',content:'我先把全部订单金额相加，不区分币种。'},{id:'m3',role:'user',content:v.changes}]};
 const p=new DeepSeek();const extracted=await extractRequirements(record,p,{strategy:'verified'});
 const oracle={
  'net-september':{orderIds:['b','e'],netRevenue:'180.00',currency:'CNY'},
  'gross-all':{orderIds:['a','b','e'],netRevenue:'30145.00',currency:'CNY'},
  'usd-september':{orderIds:['c'],netRevenue:'50.00',currency:'USD'},
  'net-all':{orderIds:['a','b','e'],netRevenue:'270.00',currency:'CNY'}
 };
 const expected=oracle[v.id];
 const arms={initial:{messages:[record.messages[0]]},fullConversation:record,requirements:{title:extracted.draft.title,requirements:extracted.draft.requirements.filter(r=>r.status==='ACTIVE').map(r=>({text:r.text,applicability:r.applicability})),questions:extracted.draft.questions}};
 for(const [arm,context] of Object.entries(arms)){
  const answer=await p.json(runtime==='plan'?planExecutor:executor,{task:context,orders},{phase:`${runtime}-delivery-${arm}`,maxTokens:2000});
  let output;try{output=runtime==='plan'?executePlan(answer,orders):answer;}catch(e){output={error:e.message};}
  const checks={ids:JSON.stringify(output.orderIds)===JSON.stringify(expected.orderIds),amount:output.netRevenue===expected.netRevenue,currency:output.currency===expected.currency};
  results.push({schemaVersion:1,kind:'WorkExecutionRun',workInstanceId:record.work.instanceId,sourceRecordId:record.id,...(arm==='requirements'?{requirementsDraftId:extracted.draft.id}:{}),id:v.id,arm,runtime,expected,...(runtime==='plan'?{plan:answer}:{}),output,checks,pass:Object.values(checks).every(Boolean),clarified:output.needsClarification===true});
 }
 await writeFile(join(out,v.id+'.json'),JSON.stringify({record,draft:extracted.draft,run:extracted.run,allCalls:p.calls,deliveries:results.filter(r=>r.id===v.id)},null,2)+'\n');
 console.log(v.id,results.filter(r=>r.id===v.id).map(r=>({arm:r.arm,pass:r.pass,clarified:r.clarified})));
}
const summary={runtime,description:'4 authored order tasks, paired same-model execution; initial arm lacks later information so measures information availability, not extraction superiority. Full conversation is the information-matched control.',model:'deepseek-flash',family:'DeepSeek-V4.1-Flash',results,byArm:Object.fromEntries(['initial','fullConversation','requirements'].map(a=>[a,{cases:results.filter(r=>r.arm===a).length,passes:results.filter(r=>r.arm===a&&r.pass).length,clarifications:results.filter(r=>r.arm===a&&r.clarified).length}]))};
await writeFile(join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary.byArm));
