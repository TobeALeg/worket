import assert from 'node:assert/strict';
import { effectiveRules, ruleItems } from '../../dist/contracts/rules.js';
const basis = { type: 'USER_AUTHORED', reviewEventId: 'synthetic-baseline' };
const item = (key, text, condition) => ({ key, text, basis, rule: { scope: 'REUSABLE', status: 'ACTIVE', ...(condition ? { condition } : {}) } });
export const semanticBaseline = {
  schemaVersion: 1, name: '按平台交付视频', purpose: { key: 'purpose', text: '依据本期脚本制作视频并交付平台文案。', basis },
  inputs: [{ key: 'script', text: '本期新脚本', valueType: 'TEXT', required: true, basis }],
  deliverables: [item('mp4', '成片交付 MP4。')],
  constraints: [item('instagram_limit', '平台文案不超过 50 words。', '发布到 Instagram'), item('tiktok_limit', '平台文案不超过 80 words。', '发布到 TikTok')],
  acceptanceCriteria: [], methods: [], materialRoles: [],
};
const user = content => ({ kind: 'user.prompt', content });
const agent = content => ({ kind: 'agent.response', content });
export const semanticCases = [
  { id: 'conditions-and-exception', conversations: [[user('以后发布到 Instagram 的文案仍然不超过 50 words，而且必须带话题 #Acme；TikTok 仍不超过 80 words。本期的 Instagram 赞助片特批到 70 words，仅限本期；以后 Instagram 的长期上限依旧是 50 words。')]],
    verify(draft) {
      assert.ok(!draft.evolution.changes.some(c => c.address.startsWith('inputs.')) && !draft.evolution.evidence.some(e => e.target.startsWith('inputs.')), 'fresh values do not redefine input roles');
      const rows = ruleItems(effectiveRules(draft.content).content);
      assert.equal(rows.filter(r => /50|五十/.test(r.item.text)).length, 1, 'Instagram threshold must not be copied into a supplement');
      assert.equal(rows.filter(r => /80|八十/.test(r.item.text)).length, 1);
      assert.ok(!rows.some(r => /70|七十/.test(r.item.text)), 'one-off waiver must not become a reusable limit');
      const hashtag = rows.find(r => /#Acme/.test(r.item.text)); assert.ok(hashtag, 'new conditional requirement must survive dedup');
      assert.match(hashtag.item.rule.condition ?? '', /Instagram/, 'hashtag applies only on Instagram');
      assert.ok(draft.evolution.ignored.length > 0, 'one-off waiver retains traceable excluded evidence');
      return { expected: 'PUBLISH', reason: 'two thresholds retained once; conditional addition retained; one-off waiver excluded' };
    } },
  { id: 'cross-instance-conflict', conversations: [[user('以后发布到 Instagram 的文案上限从 50 words 改为 30 words，其他已有约定保持。')], [user('以后发布到 Instagram 的文案上限从 50 words 改为 70 words，其他已有约定保持。')]],
    verify(draft) {
      assert.ok(draft.issues.some(i => i.blocking && i.type === 'CONFLICT'), 'contradictory separate instances require a visible blocking conflict');
      assert.ok(draft.content.constraints.some(i => i.key === 'instagram_limit' && /50/.test(i.text)));
      assert.ok(!draft.evolution.changes.some(c => c.kind === 'REPLACES' && c.target === 'constraints.instagram_limit'), 'no last-instance-wins replacement');
      return { expected: 'BLOCK', reason: 'cross-instance contradiction is unresolved; original version retained' };
    } },
  { id: 'partial-adoption', conversations: [[agent('我建议以后每期都加逐句字幕、片头 Logo 和背景音乐，三项一起设成长期标准。'), user('好，继续制作。字幕按你建议的，以后每期都加。片头 Logo 和背景音乐我还没决定，这次也先不要加。')]],
    verify(draft) {
      assert.ok(!draft.evolution.changes.some(c => c.address.startsWith('inputs.')) && !draft.evolution.evidence.some(e => e.target.startsWith('inputs.')), 'fresh values do not redefine input roles');
      const rows = ruleItems(effectiveRules(draft.content).content);
      assert.ok(rows.some(r => /字幕/.test(r.item.text)), 'explicitly adopted subtitle requirement must survive');
      assert.ok(!rows.some(r => /logo|标志|背景音乐|配乐/iu.test(r.item.text)), 'partial assent must not adopt other agent proposals');
      return { expected: 'REVIEW_PROPOSALS', reason: 'only subtitles adopted; unaccepted suggestions never execute' };
    } },
];
