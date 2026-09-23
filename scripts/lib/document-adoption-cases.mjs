import assert from 'node:assert/strict';
import {ruleItems,effectiveRules} from '../../dist/contracts/rules.js';
export const norm='# 视频规范\n字幕距画面边缘至少 24px。\n片尾列出资料来源。\n片头必须显示金色 Logo。\n全片必须添加背景音乐。\n交付 MP4 成片。\n';
const adoption='从 FRAME.md 中，我只采纳字幕至少 24px 安全区、片尾列资料来源、MP4 交付这三条作为后续所有视频的通用约定。金色 Logo 和背景音乐两条不采纳；这也不是要求以后禁止它们，而是对它们没有通用规定，不要设成必选或可选输入。以后字幕还要不超过两行，这是文件外的新要求。下一次只需给一段新的脚本文本，其余未明确规定的制作参数按既有 skill 处理，不增加输入。';
export const documentCases=[
 {id:'partial-file-adoption',conversation:adoption},
 {id:'partial-file-with-one-off',conversation:adoption+' 这期活动临时特批字幕边缘距离为 12px，仅限本期；以后仍是至少 24px。两行上限是长期要求。'},
];
export function verifyContent(content){
 const rows=ruleItems(content);
 const margin=rows.filter(r=>/24\s*(?:px|像素)/i.test(r.item.text));assert.equal(margin.length,1,'one effective margin obligation');
 assert.ok(/字幕/.test(margin[0].item.text)&&/安全|边距|距.*(?:边缘|边界)/.test(margin[0].item.text),'24px obligation retains its subject and meaning');
 assert.ok(margin[0].item.document,'adopted margin cites the fixed file clause');
 const sources=rows.filter(r=>/片尾|结尾/.test(r.item.text)&&/来源/.test(r.item.text));assert.equal(sources.length,1,'one effective source obligation');assert.ok(sources[0].item.document);
 assert.equal(rows.filter(r=>/MP4/i.test(r.item.text)).length,1,'one MP4 obligation');
 assert.equal(rows.filter(r=>/(?:两|二|2)\s*行/.test(r.item.text)).length,1,'unique dialogue supplement survives');
 assert.ok(!rows.some(r=>/logo|金色|背景音乐|配乐/iu.test(r.item.text)),'unadopted clauses cannot create obligations or bans');
 assert.ok(!rows.some(r=>/12\s*(?:px|像素)/i.test(r.item.text)),'one-instance waiver cannot become a reusable margin');
 for(const {item} of rows) if(item.document){const d=item.document;assert.ok(d.startLine===d.endLine && [2,3,6].includes(d.startLine),'document reference includes only one adopted clause');}
 assert.equal(content.inputs.length,1);assert.equal(content.inputs[0].valueType,'TEXT');assert.ok(content.inputs[0].required);assert.equal(content.inputs[0].defaultValue,undefined);
 assert.equal(content.materialRoles.filter(role=>role.kind!=='SKILL').length,0,'normative document pinning needs no extra ordinary material binding');
}
export function verifyDraft(draft){verifyContent(effectiveRules(draft.content).content);assert.ok(!draft.issues.some(i=>i.blocking),'explicit adoption boundary needs no invented user decision');}
export function verifyLabels(labels){assert.equal(labels.filter(t=>/24\s*(?:px|像素)/i.test(t)).length,1);assert.equal(labels.filter(t=>/来源/.test(t)).length,1);assert.ok(!labels.some(t=>/logo|金色|背景音乐|12\s*(?:px|像素)/iu.test(t)));}
