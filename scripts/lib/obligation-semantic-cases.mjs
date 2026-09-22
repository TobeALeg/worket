import assert from 'node:assert/strict';
import { effectiveRules, ruleItems, acceptanceChecks } from '../../dist/contracts/rules.js';
const basis = { type:'USER_AUTHORED', reviewEventId:'synthetic-baseline' };
const rule = (key,text) => ({key,text,basis,rule:{scope:'REUSABLE',status:'ACTIVE'}});
export const semanticBaseline = {
  schemaVersion:1,name:'背景音乐约定',purpose:{key:'purpose',text:'依据本期脚本制作视频。',basis},
  inputs:[{key:'script',text:'本期新脚本',valueType:'TEXT',required:true,basis}],
  deliverables:[rule('mp4','成片交付 MP4。')],constraints:[rule('music','每期视频必须添加背景音乐。')],
  acceptanceCriteria:[{...rule('music_check','成片必须带有背景音乐。'),rule:{scope:'REUSABLE',status:'ACTIVE',relation:{kind:'DUPLICATE',target:'constraints.music'}}}],methods:[],materialRoles:[],
};
const user = content => ({kind:'user.prompt',content});
const texts = content => ruleItems(content).map(({item})=>item.text);
function common(content) {
  const rows=texts(content);assert.ok(rows.some(text=>/MP4/i.test(text)),'unchanged delivery survives');
  return rows.filter(text=>/背景音乐|配乐/.test(text));
}
const requiresMusic = text => /必须.*(?:音乐|配乐)/.test(text) && !/不再.{0,6}必须|不必|无需|不要求|不强制/.test(text);
function optional(content, checks) {
  const music=common(content);assert.ok(music.length,'optional music policy should remain explicit');
  assert.ok(music.some(text=>/可选|不再.*必须|不.*强制|无需|由.*脚本|根据.*脚本/.test(text)),'withdrawal means optional, not prohibited');
  assert.ok(!music.some(text=>/禁止|不得|严禁|不能添加|不要添加/.test(text) && !/不是禁止|并非禁止|不代表禁止/.test(text)),'withdrawal is not a ban');
  assert.ok(!music.some(requiresMusic),'old mandatory obligation exits');
  assert.ok(!checks.some(item=>requiresMusic(item.text)),'acceptance cannot retain the withdrawn obligation');
}
function prohibited(content) {
  const music=common(content);assert.ok(music.some(text=>/禁止|不得|严禁|不使用|不添加|不得使用/.test(text)),'explicit enduring ban executes');
  assert.ok(!music.some(text=>/可选|必须添加|必须有/.test(text)),'ban must not become optional or keep original obligation');
}
function mandatory(content, checks) {
  const music=common(content);assert.equal(music.length,1);assert.match(music[0],/必须.*背景音乐/);
  assert.ok(checks.some(item=>/必须.*背景音乐/.test(item.text)),'next instance retains default acceptance');
}
export const semanticCases = [
  {id:'withdraw-mandatory',conversations:[[user('从以后开始，背景音乐不再作为必须项，是否添加由本期脚本决定；不加音乐也应能通过验收。这不是禁止配乐。MP4 交付要求保持。')]],verify(draft){optional(effectiveRules(draft.content).content,acceptanceChecks(draft.content));return{expected:'PUBLISH',expectedVersion:2,reason:'music optional; no ban; old mandatory acceptance removed'};},verifyPackage:optional,verifyAcceptance:checks=>assert.ok(!checks.some(requiresMusic))},
  {id:'enduring-ban',conversations:[[user('以后所有视频都禁止使用背景音乐，包括开头和结尾，无论脚本怎么写。保留人声口播和必要音效。成片仍然交付 MP4。')]],verify(draft){prohibited(effectiveRules(draft.content).content);return{expected:'PUBLISH',expectedVersion:2,reason:'enduring music ban replaces mandatory use'};},verifyPackage:prohibited,verifyAcceptance:checks=>assert.ok(checks.some(text=>/禁止|不得|严禁/.test(text)))},
  {id:'one-off-waiver',conversations:[[user('仅这期不要背景音乐，下一期和以后仍按默认必须有背景音乐。不要把本期豁免变成新的通用规则。MP4 交付保持。')]],verify(draft){mandatory(effectiveRules(draft.content).content,acceptanceChecks(draft.content));assert.equal(draft.evolution.changes.length,0,'one-off exception must not modify reusable rules');assert.ok(draft.evolution.ignored.length,'excluded waiver retains evidence');return{expected:'PUBLISH',expectedVersion:1,reason:'no new reusable version for this-instance waiver'};},verifyPackage:mandatory,verifyAcceptance:checks=>assert.ok(checks.some(requiresMusic))},
];
