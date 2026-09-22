import { mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
export const skillBasis = { type: 'USER_AUTHORED', reviewEventId: 'synthetic-skill-baseline' };
const item = (key, text) => ({ key, text, basis: skillBasis });
export const skillContent = {
  schemaVersion: 1, name: '带固定技能的报告', purpose: item('purpose', '依据本次主题生成带来源的报告。'),
  inputs: [{ ...item('subject', '本次主题'), valueType: 'TEXT', required: true }],
  deliverables: [item('report', 'Markdown 报告')], constraints: [item('sources', '结论附来源')],
  acceptanceCriteria: [item('traceable', '报告包含本次主题和来源')],
  methods: [{ ...item('builder', '使用 Report Builder skill 生成报告'), obligation: 'REQUIRED' }],
  materialRoles: [{ ...item('builder', 'Report Builder'), kind: 'SKILL', required: true }],
};
export function writeSkillFixture(directory, label = '固定格式 v1') {
  mkdirSync(join(directory, 'assets/empty'), { recursive: true });
  mkdirSync(join(directory, 'references'), { recursive: true }); mkdirSync(join(directory, 'scripts'), { recursive: true });
  writeFileSync(join(directory, 'SKILL.md'), '# Report Builder\n先读 [格式](references/format.md)，执行 scripts/report.mjs <本次主题> <输出路径>。\n');
  writeFileSync(join(directory, 'references/format.md'), label);
  writeFileSync(join(directory, 'scripts/format.mjs'), "import { readFileSync } from 'node:fs';\nexport const format = readFileSync(new URL('../references/format.md', import.meta.url), 'utf8');\n");
  writeFileSync(join(directory, 'scripts/report.mjs'), "import { writeFileSync } from 'node:fs';\nimport { format } from './format.mjs';\nwriteFileSync(process.argv[3], '# '+process.argv[2]+'\\n'+format+'\\n来源：合成验收资料');\n");
  chmodSync(join(directory, 'scripts/report.mjs'), 0o700);
}
