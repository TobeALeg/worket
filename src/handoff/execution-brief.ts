import { basename } from 'node:path';
import { ruleText } from '../contracts/rules.js';
import { workEvidence } from '../core/work-evidence.js';
import type { WorkSnapshot } from '../core/types.js';
import type { WorkPackage } from '../definitions/work-package.js';

const escape = (text: string) => text.replace(/[\\`*_{}\[\]<>()#!|]/g, '\\$&');

/** Executor-facing content only. Provenance and read receipts stay in the stored package. */
export function executionBrief(pkg: WorkPackage, work?: WorkSnapshot, target: 'local' | 'web' = 'local'): string {
  const lines = [`# ${escape(pkg.definition?.content.name ?? pkg.state.objective[0]?.text ?? work?.definition.name ?? '工作')}`];
  const section = (title: string, values: string[]) => {
    const unique = [...new Set(values.filter(value => value.trim()))];
    if (unique.length) lines.push(`\n## ${title}\n${unique.map(value => `- ${escape(value)}`).join('\n')}`);
  };
  const content = pkg.definition?.content;
  const snapshot = pkg.stateStatus === 'RESOLVED' ? pkg.continuation : undefined;
  const current = snapshot?.stages.find(stage => stage.id === snapshot.currentStageId);
  section('目标', [content?.purpose.text ?? '', ...pkg.state.objective.map(item => item.text)]);
  if (content) {
    for (const [label, rules] of [
      ['交付物', content.deliverables], ['约束', content.constraints],
      ['验收标准', content.acceptanceCriteria], ['方法', content.methods],
    ] as const) section(label, rules.map(rule => `${ruleText(rule)}${'obligation' in rule && rule.obligation === 'REFERENCE' ? '（建议）' : ''}`));
  }
  const inputNames = new Map(content?.inputs.map(input => [input.key, input.text]) ?? []);
  section('本次输入', Object.entries(pkg.inputs).map(([key, value]) => {
    const material = pkg.inputMaterials?.find(item => item.path === value);
    return `${inputNames.get(key) ?? key}：${target === 'web' && material ? `${basename(material.path)}（需上传）` : String(value)}`;
  }));
  if (snapshot) {
    section('当前阶段', current ? [current.task.text] : []);
    const statuses = { UNKNOWN: '状态待确认', NOT_STARTED: '未开始', IN_PROGRESS: '进行中', REPORTED_DONE: '执行者报告完成', SUPPORTED_DONE: '已完成' };
    for (const stage of snapshot.stages) {
      section(`进度：${stage.task.text}`, [
        statuses[stage.execution],
        ...stage.outcomes.map(outcome => `${outcome.summary.text}${outcome.acceptance === 'ACCEPTED' ? '（用户已验收）' : outcome.acceptance === 'NEEDS_CHANGES' ? '（需修改）' : '（尚未验收）'}`),
        ...stage.remaining.map(claim => `待做：${claim.text}`),
        ...stage.blockers.map(claim => `阻碍：${claim.text}`),
        ...stage.dependsOn.map(dependency => {
          const prior = snapshot.stages.find(item => item.id === dependency.stageId);
          return `依赖成果：${prior?.outcomes.find(item => item.id === dependency.outcomeId)?.summary.text ?? prior?.task.text ?? '待确认'}`;
        }),
      ]);
    }
    const labels = new Map(snapshot.stages.map(stage => [stage.id, stage.task.text]));
    for (const stage of snapshot.stages) for (const outcome of stage.outcomes) labels.set(outcome.id, outcome.summary.text);
    section('有效要求与决定', snapshot.requirements.filter(item => item.status !== 'SUPERSEDED').map(item => {
      const scope = item.scope.kind === 'WORK' ? '' : `（适用于：${item.scope.ids.map(id => labels.get(id) ?? '指定成果').join('、')}）`;
      return `${item.status === 'CONFLICT' ? '待澄清：' : ''}${item.claim.text}${scope}`;
    }));
    section('待澄清', snapshot.uncertainties.map(claim => claim.text));
  } else {
    for (const [label, key] of [
      ['约束补充', 'constraints'], ['已确认决定', 'decisions'], ['验收标准补充', 'successCriteria'],
      ['已记录进度', 'completedActions'], ['待办线索', 'pendingActions'],
    ] as const) section(label, pkg.state[key].map(item => item.text));
    // Without a resolved understanding, dropping conversation text would silently lose requirements.
    const messages = work ? workEvidence(work.sourceArchive).filter(event => event.kind === 'user.prompt' || event.kind === 'agent.response') : [];
    if (messages.length) {
      lines.push('\n## 尚待整理的工作对话\n当前阶段尚未理清；以下原话用于确认有效要求和进度，较早的要求可能已被后文更改。');
      for (const message of messages) lines.push(`\n### ${message.kind === 'user.prompt' ? '用户' : '执行者'}\n${escape(message.content ?? '')}`);
    }
  }
  section('必要背景', pkg.state.facts.filter(item => item.origin === 'USER_STATED' || item.origin === 'USER_EDITED').map(item => item.text));
  section('已有成果', pkg.state.artifacts.map(item => item.text));
  const materials = pkg.fixedMaterials.map(item => `${item.role}：${target === 'web' ? `${basename(item.path)}（需上传）` : item.path}`);
  for (const reference of pkg.referenceExamples) {
    if (reference && typeof reference === 'object' && 'path' in reference && typeof reference.path === 'string') {
      materials.push(`参考：${target === 'web' ? `${basename(reference.path)}（需上传）` : reference.path}`);
    }
  }
  for (const artifact of work?.artifactRefs ?? []) materials.push(`${artifact.role || artifact.filename}：${target === 'web' ? artifact.filename : artifact.path}${artifact.availability === 'MISSING' ? '（缺失，需补充）' : artifact.availability === 'CHANGED' ? '（内容已变化，需确认版本）' : target === 'web' ? '（需上传）' : ''}`);
  section('资料', materials);
  section('执行技能', (pkg.skills ?? []).map(skill => `${skill.name}（${skill.required ? '必需' : '参考'}）：${target === 'web' ? '需另行提供技能正文及配套文件' : skill.entrypoint}`));
  if (target === 'local' && pkg.skills?.length) lines.push('先读取技能入口，并按其目录查找配套文件。');
  const missing = work ? workEvidence(work.sourceArchive).flatMap(event => Array.isArray(event.metadata.missingAttachments) ? event.metadata.missingAttachments.filter((name): name is string => typeof name === 'string') : []) : [];
  section('待补充资料', missing);
  if (pkg.sourceNotice) section('待确认的来源变化', [pkg.sourceNotice]);
  return lines.join('\n');
}
