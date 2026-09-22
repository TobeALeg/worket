import assert from 'node:assert/strict';
import { effectiveRules, ruleItems } from '../../dist/contracts/rules.js';
const basis = { type: 'USER_AUTHORED', reviewEventId: 'synthetic-baseline' };
const item = (key,text) => ({key,text,basis,rule:{scope:'REUSABLE',status:'ACTIVE'}});
export const semanticBaseline = {
  schemaVersion:1,name:'字幕视频约定',purpose:{key:'purpose',text:'依据本期脚本制作视频。',basis},
  inputs:[{key:'script',text:'本期新脚本',valueType:'TEXT',required:true,basis}],
  deliverables:[item('mp4','成片交付 MP4。')],constraints:[item('subtitles','每期视频必须包含中文字幕。')],
  acceptanceCriteria:[],methods:[],materialRoles:[],
};
const user=content=>({kind:'user.prompt',content});
const agent=content=>({kind:'agent.response',content});
const english=text=>/英文|英语|双语|中英/.test(text);
function rows(content) {
  const values=ruleItems(content).map(r=>r.item);
  assert.ok(values.some(i=>/MP4/.test(i.text)),'unchanged MP4 delivery survives');
  assert.ok(values.some(i=>/中文|中英/.test(i.text)),'Chinese subtitle obligation survives');
  return values;
}
function original(content) {
  const values=rows(content);assert.ok(!values.some(i=>english(i.text)),'instance-only English subtitles cannot become a default');
  assert.equal(values.filter(i=>/中文/.test(i.text)).length,1,'existing Chinese subtitle requirement executes once');
}
function untouched(draft) {
  original(effectiveRules(draft.content).content);
  assert.equal(draft.evolution.changes.length,0,'explicit instance-only requests must not create proposed reusable changes');
  assert.ok(draft.evolution.ignored.some(i=>english(i.text ?? i.item?.text ?? '') || i.refs.length),'instance exclusion retains evidence');
  return {expected:'PUBLISH',expectedVersion:1,reason:'repetition cannot turn an explicit instance requirement into a reusable obligation'};
}
function promoted(content) {
  const values=rows(content);assert.ok(values.some(i=>english(i.text)),'explicit user promotion of English subtitles must apply');
  assert.ok(!values.some(i=>english(i.text) && /仅本期|仅这期|仅本次|只这次/.test(i.text)),'promoted rule cannot retain obsolete one-off qualifier');
  assert.equal(values.filter(i=>english(i.text)).length,1,'new English requirement executes once');
}
export const semanticCases=[
  {id:'one-instance-echo',conversations:[[
    user('这期是发给外籍嘉宾的特例：这期在原有中文字幕之外加英文字幕，只做这一次。'),
    agent('收到，本次输出中英双语字幕。'),
    user('刚才渲染失败，请重试这期双语字幕版本。'),
    agent('我已经重试了中英双语字幕。既然反复提到，我建议以后全部默认双语。'),
    user('不要把重试当成新要求。我没同意长期双语，只是这期；以后仍按原来的中文字幕要求。'),
    agent('确认，本期双语，后续仍只按原中文字幕约定。'),
  ]],verify:untouched,verifyPackage:original,verifyAcceptance:checks=>assert.ok(!checks.some(english))},
  {id:'repeated-one-off',conversations:[
    [user('本期给展会使用，例外加英文字幕，仅限这一期，长期约定仍只有中文字幕。'),agent('已交付这期双语字幕视频。')],
    [user('这期发给海外访客，也加英文字幕，但只是本期特例，别改后续默认的中文字幕要求。'),agent('收到，本次加英文字幕。')],
    [user('本期活动又有外国来宾，这次仍然临时加英文字幕；仅这期，不是以后都双语。'),agent('本期中英双语已完成。')],
  ],verify:untouched,verifyPackage:original,verifyAcceptance:checks=>assert.ok(!checks.some(english))},
  {id:'repeated-instance-scope',conversations:[
    [user('本期给展会使用，这一期加英文字幕，仅限这一期，长期中文字幕要求保持不变。'),agent('已交付这期双语字幕视频。')],
    [user('这期发给海外访客，也加英文字幕，但只是本期特例，别改后续的中文字幕要求。'),agent('收到，本次加英文字幕。')],
    [user('本期活动又有外国来宾，这次仍然临时加英文字幕；仅这期，不把它提升为以后的要求。'),agent('本期中英双语已完成。')],
  ],verify:untouched,verifyPackage:original,verifyAcceptance:checks=>assert.ok(!checks.some(english))},
  {id:'explicit-promotion',conversations:[[
    user('先按本期例外加英文字幕，后续暂时不改。'),agent('本次中英双语，其他期仍只有中文字幕。'),
    user('我现在改变长期要求：从下一期开始，所有视频都默认中英双语字幕，以后不用我每期再说。保留原有中文字幕并加英文字幕，适用于所有后续视频，不再只限本期。'),
    agent('收到，后续每期默认中英双语。'),
  ]],verify(draft){promoted(effectiveRules(draft.content).content);assert.ok(!draft.evolution.changes.some(c=>c.address.startsWith('inputs.')),'promotion does not change fresh input roles');return{expected:'PUBLISH',expectedVersion:2,reason:'explicit user statement, rather than repetition, creates the future bilingual obligation'};},verifyPackage:promoted,verifyAcceptance:checks=>assert.ok(checks.some(english))},
];
