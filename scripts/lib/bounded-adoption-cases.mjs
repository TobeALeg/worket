import assert from 'node:assert/strict';
import {effectiveRules,ruleItems} from '../../dist/contracts/rules.js';
const basis={type:'USER_AUTHORED',reviewEventId:'synthetic-baseline'};
const item=(key,text)=>({key,text,basis,rule:{scope:'REUSABLE',status:'ACTIVE'}});
export const semanticBaseline={schemaVersion:1,name:'视频通用约定',purpose:{key:'purpose',text:'依据本期脚本制作视频；脚本包含本期视觉设定。',basis},inputs:[{key:'script',text:'本期新脚本及本期视觉设定',valueType:'TEXT',required:true,basis}],deliverables:[item('mp4','成片交付 MP4。')],constraints:[item('subtitles','每期视频必须包含中文字幕。')],acceptanceCriteria:[],methods:[],materialRoles:[]};
const user=content=>({kind:'user.prompt',content}),agent=content=>({kind:'agent.response',content});
const transient=text=>/金色|金黄|gold|1\s*[:：]\s*1|正方形|方形画幅/iu.test(text);
function verifyRules(content){
 const values=ruleItems(content).map(r=>r.item);
 assert.ok(values.some(i=>/MP4/.test(i.text)),'MP4 preserved');assert.equal(values.filter(i=>/中文字幕/.test(i.text)).length,1,'baseline subtitles remain once');
 assert.ok(values.some(i=>/24\s*(px|像素)/i.test(i.text)&&/安全|边距|距.*(?:边缘|边界)/.test(i.text)),'adopted 24px safety margin survives');
 assert.ok(values.some(i=>/片尾|结尾/.test(i.text)&&/来源/.test(i.text)),'adopted ending sources survive');
 assert.ok(!values.some(i=>transient(i.text)),'explicit one-off visual settings are not reusable rules');
}
function verify(draft){
 verifyRules(effectiveRules(draft.content).content);
 const reusable=ruleItems(draft.content).filter(r=>r.item.rule?.scope!=='INSTANCE');
 assert.ok(!reusable.some(r=>transient(r.item.text)),'explicitly excluded visual settings cannot remain even as reusable proposals');
 assert.ok(!draft.evolution.changes.some(c=>c.address.startsWith('inputs.')),'new visual values stay in the existing fresh script input');
 assert.ok(draft.evolution.ignored.length>0,'one-off visual settings retain excluded evidence');
 return{expected:'PUBLISH',expectedVersion:2,reason:'adopt general safety/source rules, exclude explicitly bounded visual choices'};
}
export const semanticCases=[
 {id:'broad-assent-with-exceptions',conversations:[[
  user('这期活动脚本中的视觉设定是金色配色、1:1 正方形画幅。'),
  agent('这期方案：金色配色、1:1 正方形画幅；字幕距离画面边缘至少 24px，片尾列出资料来源。我建议四项都作为以后视频的标准。'),
  user('这个方案好，以后也照这样做。范围说明：金色和 1:1 仅限这期活动，不要写成通用要求；后续配色和尺寸继续按各期脚本中的视觉设定。字幕至少 24px 安全区、片尾列来源这两项才是我采纳的长期规则。'),
 ]],verify,verifyPackage:verifyRules,verifyAcceptance:checks=>{assert.ok(checks.some(t=>/24\s*(px|像素)/i.test(t)));assert.ok(checks.some(t=>/来源/.test(t)));assert.ok(!checks.some(transient));}},
 {id:'narrowed-after-assent',conversations:[[
  agent('建议以后都采用金色配色和 1:1 正方形画幅，字幕距画面边缘至少 24px，片尾列资料来源。'),
  user('好，这四项都沿用，以后都按这套做。'),
  agent('确认四项作为后续每期要求。'),
  user('更正我刚才说的范围：金色和 1:1 只用于这期，不是长期约定，我撤回把这两项设成通用要求的决定。后续配色、尺寸仍由各期新脚本的视觉设定决定。24px 字幕安全区和片尾列来源继续作为长期规则。'),
  agent('收到，后续仅固定安全区与片尾来源，配色画幅读取本期脚本。'),
 ]],verify,verifyPackage:verifyRules,verifyAcceptance:checks=>{assert.ok(checks.some(t=>/24\s*(px|像素)/i.test(t)));assert.ok(checks.some(t=>/来源/.test(t)));assert.ok(!checks.some(transient));}},
];
