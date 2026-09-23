// Synthetic source-level audit, not an automated semantic extractor or desktop acceptance.
// Usage: node probe.mjs <compiled-src-directory> <report-path> [source-commit]
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const build = resolve(process.argv[2] ?? './dist');
const reportPath = resolve(process.argv[3] ?? './report.json');
const load = path => import(pathToFileURL(join(build, path)).href);
const { createWorkCore } = await load('core/index.js');
const { LocalRuleExtractor } = await load('extractor/local-rule-extractor.js');
const { WorkPetMcpHandler } = await load('bridge/mcp-handler.js');
const { currentSourceEvents, sourceIdentity } = await load('core/source-revisions.js');
const directory = mkdtempSync(join(tmpdir(), 'worket-b005-probe-'));
const U = content => ({ kind: 'user.prompt', content });
const A = content => ({ kind: 'agent.response', content });
const T = content => ({ kind: 'tool.result', content });
const fixtures = [
  {
    id: 'M1', name: '已确认的三阶段依次推进',
    events: [
      U('请先清洗销售数据，输出 clean.csv。整个项目必须使用人民币。'),
      A('下一步：清洗销售数据。'),
      T('数据清洗命令结束，exit=0；clean.csv 版本 data-v1。'),
      A('已完成数据清洗，产物 clean.csv。下一步：制作图表。'),
      U('确认数据清洗通过，使用 clean.csv 制作图表。'),
      T('图表命令结束，exit=0；chart.svg 版本 chart-v1，输入 data-v1。'),
      A('已完成图表，产物 chart.svg。下一步：撰写汇报。'),
      T('图表尺寸检查通过，仅验证 chart-v1。'),
      U('确认图表通过。现在使用 clean.csv 和 chart.svg 撰写汇报。'),
    ],
    expected: '当前只撰写汇报，复用 data-v1 和 chart-v1；人民币约束仍有效。',
    check(c) {
      assert.match(c.firstActionText, /清洗/);
      assert.equal(c.context.position.pendingActions.length, 3);
      assert.equal(c.context.position.checkpoint, null);
      assert.ok(c.context.goal.constraints.some(i => i.text.includes('人民币')));
      assert.ok(!c.context.evidenceIndex.some(i => i.sequence === 9));
      return '首步仍为已确认完成的清洗；三个阶段待办并列；首屏证据索引不含第 9 条阶段切换消息。';
    },
  },
  {
    id: 'M2', name: '新消息明确替代旧要求',
    events: [U('请导出报告。必须交付 CSV。必须保留人民币。'), A('下一步：导出 CSV。'), U('取消此前 CSV 要求。现在必须交付 PDF。')],
    expected: 'CSV 被明确替代，交付 PDF，人民币保留。',
    check(c) {
      assert.ok(c.context.goal.constraints.some(i => i.text.includes('CSV')));
      assert.ok(c.context.goal.constraints.some(i => i.text.includes('PDF')));
      assert.match(c.firstActionText, /CSV/);
      return 'CSV 与 PDF 仍并列为约束，首步继续导出 CSV。';
    },
  },
  {
    id: 'M3', name: '开始后阶段但前阶段无验收证据',
    events: [U('清洗数据后制作图表。'), A('已完成清洗，产物 clean.csv。下一步：制作图表。'), U('继续做图表。')],
    expected: '当前图表；清洗只有 Agent 完成声明，允许定向检查其产物，不能宣称已验收。',
    check(c) {
      assert.equal(c.context.position.completedActions[0].origin, 'AGENT_PROPOSED');
      assert.match(c.context.position.note, /不代表已独立核验/);
      assert.equal(c.context.position.status, 'OPEN');
      assert.equal(c.context.position.checkpoint, null);
      return '保留 AGENT_PROPOSED 与未独立核验提示是现有保护，但没有阶段级验证、验收或依赖状态。';
    },
  },
  {
    id: 'M4', name: '地图获得认可后只重做 Hero（虚构文本）',
    events: [U('页面方向不对。必须保留旧版价格、服务卖点和 CTA。'), A('下一步：重做地图。'), A('已完成地图 redesign。'), U('地图这版可以，保留它。现在只重做 Hero。')],
    expected: '地图认可仅适用于地图；当前改 Hero，价格、卖点、CTA 继续有效。',
    check(c) {
      assert.match(c.firstActionText, /地图/);
      assert.equal(c.context.conditions.decisions.length, 0);
      assert.ok(!JSON.stringify(c.context).includes('Hero'));
      assert.ok(c.context.goal.constraints.some(i => i.text.includes('CTA')));
      return '当前主包丢失 Hero 和地图认可内容，保留了旧的重做地图动作；原文仍可按证据读取。';
    },
  },
  {
    id: 'M5', name: '否定完成声明',
    events: [U('导出报告后排版。'), A('不能声称已完成导出，实际上尚未开始。')],
    expected: '导出未完成，不能成为排版的已验证前置成果。',
    check(c) {
      assert.equal(c.context.position.completedActions.length, 1);
      assert.match(c.context.position.completedActions[0].text, /不能声称/);
      return '否定句进入 completedActions；原文和 AGENT_PROPOSED 保留，工作并未自动完成。';
    },
  },
  {
    id: 'M6', name: '明确返回前序阶段',
    events: [U('清洗数据后写报告。'), A('已完成清洗。下一步：撰写报告。'), U('暂停报告，回到数据清洗阶段，修正重复订单后再继续。')],
    expected: '当前回到清洗，报告暂停；依赖旧数据的报告成果须重核。',
    check(c) {
      assert.match(c.firstActionText, /报告/);
      assert.equal(c.context.position.checkpoint, null);
      return '首步仍撰写报告，无法表达回到前序阶段。';
    },
  },
  {
    id: 'C1', name: '对照：编辑同一条来源消息',
    events: [U('请导出报告。必须交付 CSV。'), { ...U('请导出报告。必须交付 PDF。'), revises: 1 }],
    expected: '来源修订可以排除旧 CSV 约束。',
    check(c) {
      assert.ok(!c.context.goal.constraints.some(i => i.text.includes('CSV')));
      assert.ok(c.context.goal.constraints.some(i => i.text.includes('PDF')));
      return '通过：原消息的显式修订能过滤旧要求；此能力不等于理解新消息中的语义替代。';
    },
  },
];

const cases = [];
for (const fixture of fixtures) {
  const core = createWorkCore({ databasePath: join(directory, `${fixture.id}.sqlite`) });
  try {
    const work = core.createWork({
      definition: { key: 'synthetic-stages', name: fixture.name, version: 1 },
      executor: { type: 'AGENT', name: 'Synthetic source' },
      environment: { type: 'CODEX_DESKTOP', name: 'Synthetic audit' },
      source: { adapter: 'codex', conversationId: fixture.id },
    });
    const extractor = new LocalRuleExtractor();
    const ids = [];
    for (let i = 0; i < fixture.events.length; i++) {
      const e = fixture.events[i], externalId = `${fixture.id}-${i + 1}`;
      const before = core.getWork(work.instance.id);
      const sequence = Math.max(0, ...before.sourceArchive.map(x => x.sequence)) + 1;
      core.appendSourceEvents(work.instance.id, [{
        externalId, sequence, kind: e.kind, content: e.content,
        timestamp: new Date(Date.UTC(2026, 8, 23, 0, 0, i)).toISOString(),
        executorType: e.kind === 'user.prompt' ? 'HUMAN' : e.kind === 'tool.result' ? 'TOOL' : 'AGENT',
        environmentType: 'CODEX_DESKTOP', artifactRefs: [],
        metadata: { worketSource: { adapter: 'codex', conversationId: fixture.id, externalId,
          ...(e.revises ? { previousEventId: ids[e.revises - 1] } : {}) } },
      }]);
      const current = core.getWork(work.instance.id);
      ids.push(current.sourceArchive.find(x => x.externalId === externalId).id);
      const extracted = core.extractedSequence(work.instance.id);
      const pending = current.sourceArchive.filter(x => x.sequence > extracted);
      const revised = pending.some(x => sourceIdentity(x)?.previousEventId);
      const events = currentSourceEvents(current.sourceArchive).filter(x => revised || x.sequence > extracted);
      const patch = await extractor.extract({ previousState: current.state, events });
      if (current.state.objective.length) patch.objective = [];
      core.applyExtractorPatch(work.instance.id, patch, sequence);
    }
    const handler = new WorkPetMcpHandler(core);
    const response = handler.handle({ jsonrpc: '2.0', id: 'synthetic-read', method: 'tools/call', params: {
      name: 'get_work_context', arguments: { work_id: work.instance.id, context_version: 2 },
    } });
    assert.ok(!response.error, JSON.stringify(response.error));
    const context = JSON.parse(response.result.content[0].text);
    const firstActionText = context.position.pendingActions.find(x => x.id === context.firstAction.candidateActionId)?.text ?? null;
    cases.push({ id: fixture.id, name: fixture.name, inputs: fixture.events, expected: fixture.expected,
      observed: fixture.check({ context, firstActionText }), firstActionText, context });
  } finally { core.close(); }
}
const report = { kind: 'Synthetic source-level audit of current LocalRuleExtractor + SQLite core + MCP handler; no live user database, network, Electron UI, target Agent, or automatic phase extraction',
  sourceCommit: process.argv[4] ?? null,
  result: '6 structural/semantic gaps reproduced, 1 source-revision control passed; not a semantic quality pass rate', cases };
writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ result: report.result, reportPath, cases: cases.map(({ id, observed }) => ({ id, observed })) }, null, 2));
