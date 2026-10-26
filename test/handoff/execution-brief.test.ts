import test from 'node:test';
import assert from 'node:assert/strict';
import { executionBrief } from '../../dist/handoff/execution-brief.js';
import { inlineWorkPackage } from '../../dist/connectors/inline-package.js';

const state = () => ({ objective: [{ text: '制作年度报告' }], constraints: [], decisions: [], successCriteria: [], facts: [], completedActions: [], pendingActions: [], artifacts: [] });
const claim = (text: string) => ({ text, sourceEventIds: ['internal-event'], excerpts: [{ sourceEventId: 'internal-event', text }] });
function fixture() {
  const pkg: any = { workId: 'work-1', stateStatus: 'UNRESOLVED', state: state(), inputs: {}, fixedMaterials: [], inputMaterials: [], referenceExamples: [], skills: [], definition: null };
  const work: any = { instance: { id: 'work-1' }, definition: { name: '年度报告' }, artifactRefs: [], sourceArchive: [
    { id: 'e1', externalId: 'e1', sequence: 1, kind: 'user.prompt', content: '报告必须用人民币。', metadata: { missingAttachments: ['budget.xlsx'] } },
    { id: 'e2', externalId: 'e2', sequence: 2, kind: 'agent.response', content: '数据已清洗，等待预算文件。', metadata: {} },
    { id: 'e3', externalId: 'e3', sequence: 3, kind: 'tool.result', content: 'INTERNAL_READ_AUDIT', metadata: { access: 'read', outcome: 'success', auditId: 'workpet:mcp:read' } },
  ] };
  return { pkg, work };
}
test('unresolved work retains requirements and progress without event JSON or read audits', () => {
  const { pkg, work } = fixture();
  const brief = inlineWorkPackage(work, pkg, 'delivery-1');
  assert.match(brief, /\[WORKPET:work-1\]\n\[DELIVERY:delivery-1\]$/);
  assert.match(brief, /必须用人民币/);
  assert.match(brief, /数据已清洗/);
  assert.match(brief, /budget.xlsx/);
  assert.doesNotMatch(brief, /INTERNAL_READ_AUDIT|sourceEventIds|接续快照与证据索引|"role"|SHA256/);
});
test('resolved brief preserves scope, dependencies, outstanding issues and acceptance, excluding superseded requirements', () => {
  const { pkg, work } = fixture();
  pkg.stateStatus = 'RESOLVED';
  pkg.continuation = { currentStageId: 'publish', uncertainties: [claim('发布日期待确认')], requirements: [
    { status: 'SUPERSEDED', claim: claim('OLD_CSV_RULE'), scope: { kind: 'WORK', ids: [] } },
    { status: 'ACTIVE', claim: claim('PDF 使用人民币'), scope: { kind: 'STAGE', ids: ['publish'] } },
    { status: 'CONFLICT', claim: claim('是否公开预算'), scope: { kind: 'WORK', ids: [] } },
  ], stages: [
    { id: 'clean', task: claim('清洗数据'), execution: 'SUPPORTED_DONE', outcomes: [{ id: 'data', summary: claim('清洗后的数据表'), acceptance: 'ACCEPTED' }], remaining: [], blockers: [], dependsOn: [] },
    { id: 'publish', task: claim('导出 PDF'), execution: 'IN_PROGRESS', outcomes: [], remaining: [claim('补齐预算')], blockers: [claim('缺少预算文件')], dependsOn: [{ stageId: 'clean', outcomeId: 'data' }] },
  ] };
  const brief = executionBrief(pkg, work);
  for (const value of ['适用于：导出 PDF', '依赖成果：清洗后的数据表', '用户已验收', '缺少预算文件', '待澄清：是否公开预算', '发布日期待确认']) assert.ok(brief.includes(value), value);
  assert.doesNotMatch(brief, /OLD_CSV_RULE|internal-event|sourceEventIds|尚待整理的工作对话/);
});
test('local and web share business rules; web does not pretend local files are available', () => {
  const { pkg, work } = fixture();
  pkg.definition = { content: { name: '报告', purpose: { text: '准备财务报告' }, deliverables: [{ text: '交付 PDF' }], constraints: [{ text: '金额保留两位小数' }], acceptanceCriteria: [{ text: '合计必须一致' }], methods: [{ text: '参考模板', obligation: 'REFERENCE' }], inputs: [{ key: 'budget', text: '预算文件' }] } };
  pkg.inputs = { budget: '/private/input/budget.xlsx' };
  pkg.inputMaterials = [{ path: pkg.inputs.budget }];
  pkg.fixedMaterials = [{ role: 'template', path: '/private/template.docx', hash: 'PRIVATE_HASH' }];
  pkg.referenceExamples = [{ path: '/private/reference.pdf', hash: 'PRIVATE_HASH', id: 'PRIVATE_ID' }];
  pkg.skills = [{ name: '报告技能', required: true, entrypoint: '/private/report/SKILL.md', hash: 'PRIVATE_HASH' }];
  const local = executionBrief(pkg, work), web = executionBrief(pkg, work, 'web');
  for (const text of [local, web]) {
    for (const rule of ['交付 PDF', '金额保留两位小数', '合计必须一致', '参考模板（建议）']) assert.ok(text.includes(rule));
    assert.doesNotMatch(text, /PRIVATE_HASH|PRIVATE_ID/);
  }
  assert.match(local, /\/private\/input\/budget.xlsx/);
  assert.match(local, /\/private\/report\/SKILL.md/);
  assert.doesNotMatch(web, /\/private\//);
  assert.match(web, /budget.xlsx（需上传）/);
  assert.match(web, /reference.pdf（需上传）/);
});


test('copied instructions preserve literal code, paths and Markdown links without extra escaping', () => {
  const { pkg, work } = fixture();
  const literal = '<script>gtag("event", "contact_click", { value: 1 });</script>\n[资料](https://example.com/a?x=1&y=2)\n```js\nconst ids = [1, 2];\n```';
  work.sourceArchive[0].content = literal;
  pkg.state.constraints = [{ text: '事件名必须为 `contact_click`，文件名为 report_v2.md。', origin: 'USER_EDITED' }];
  for (const brief of [executionBrief(pkg, work), inlineWorkPackage(work, pkg)]) {
    assert.ok(brief.includes(literal), 'the original task snippet remains directly usable');
    assert.ok(brief.includes(pkg.state.constraints[0].text), 'structured requirements preserve code identifiers too');
  }
});

test('unresolved handoff does not promote stale automatic claims above the conversation', () => {
  const { pkg, work } = fixture();
  pkg.state.pendingActions = [{ text: '生成英文 CSV', origin: 'AGENT_STATED' }];
  pkg.state.completedActions = [{ text: '预算 5000 元，所有阶段完成', origin: 'AGENT_STATED' }];
  pkg.state.constraints = [{ text: '用户手动补充的必要约束', origin: 'USER_EDITED' }];
  work.sourceArchive.push({ id: 'e4', externalId: 'e4', sequence: 4, kind: 'user.prompt', content: '取消英文 CSV，改用中文 Markdown；预算未提供，不能猜测。', metadata: {} });
  for (const brief of [executionBrief(pkg, work), inlineWorkPackage(work, pkg)]) {
    assert.doesNotMatch(brief, /生成英文 CSV|预算 5000 元|已记录进度|待办线索/);
    assert.match(brief, /取消英文 CSV，改用中文 Markdown/);
    assert.match(brief, /用户手动补充的必要约束/);
    assert.match(brief, /不代表用户已确认/);
  }
  assert.match(executionBrief(pkg), /生成英文 CSV/, 'without source dialogue the remaining clues must not disappear');
});
