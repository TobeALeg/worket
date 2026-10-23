import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, relative, join, sep } from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';

// Documentation only: parses repository source without loading application code or user data.
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'docs/reference/code-index.md');
const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)]);
const files = [...walk(resolve(root, 'src')), ...walk(resolve(root, 'server'))]
  .filter(path => /\.(ts|cjs|mjs|js)$/.test(path)).sort();
const sources = files.map(path => {
  const text = readFileSync(path, 'utf8');
  return { path: relative(root, path).split(sep).join('/'), text, ast: ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true) };
});
const byPath = new Map(sources.map(source => [source.path, source]));
const digest = createHash('sha256');
for (const source of sources) digest.update(source.path + '\0' + source.text + '\0');
const selected = [
  'src/core/types.ts', 'src/ui-contract.ts', 'src/contracts/definition.ts',
  'src/contracts/rules.ts', 'src/contracts/evolution.ts', 'src/contracts/continuation.ts',
  'src/contracts/improvement.ts', 'src/contracts/problem-report.ts',
  'src/definitions/repository.ts', 'src/definitions/storage.ts',
  'src/definitions/instance-files.ts', 'src/definitions/instance-file-update.ts', 'src/definitions/evolution.ts',
  'src/definitions/skill-materials.ts', 'src/definitions/work-package.ts',
  'src/distillation/service.ts', 'src/distillation/activity.ts', 'src/distillation/analysis-input.ts', 'src/distillation/continuous-evolution.ts',
  'src/handoff/continuation.ts', 'src/workflows/types.ts', 'src/workflows/drafts.ts',
  'src/workflows/queries.ts', 'src/workflows/outputs.ts',
  'src/executors/types.ts', 'src/adapters/types.ts', 'src/ai-service/client.ts',
  'src/connectors/selected-content.ts', 'src/connectors/inline-package.ts',
  'src/connectors/delivery-ledger.ts', 'src/problem-reports/store.ts',
];
const classFiles = [
  'src/app/app-service.ts', 'src/definitions/repository.ts', 'src/distillation/service.ts',
  'src/distillation/desktop.ts', 'src/workflows/core.ts', 'src/workflows/drafts.ts',
  'src/workflows/desktop.ts', 'src/ai-service/client.ts',
];
const visit = (node, callback) => { callback(node); ts.forEachChild(node, child => visit(child, callback)); };
const exported = node => node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
const line = (source, node) => source.ast.getLineAndCharacterOfPosition(node.getStart(source.ast)).line + 1;
const link = (source, node) => `[${source.path}:${line(source, node)}](../../${source.path}#L${line(source, node)})`;
const cell = text => text.replaceAll('|', '\\|').replace(/\s+/g, ' ');
const out = [
  '# 代码索引（自动生成）', '',
  '入口：[架构总览](README.md) · [接口手册](interfaces.md) · [字段字典](fields.md)', '',
  '此文件保留代码中的原始名称与可选标记，不补造缺失的运行时约束。只索引源码，不读取数据库、配置或用户记录。', '',
  `覆盖 src/ 与 server/ 下 ${sources.length} 个 TypeScript/JavaScript 文件；内容摘要 SHA-256：\`${digest.digest('hex')}\`。`, '',
  '更新：`node scripts/architecture-reference.mjs`；检查是否过期：`node scripts/architecture-reference.mjs --check`。需先安装项目依赖。', '',
  '## 桌面 IPC 完整索引', '',
  '包含 preload 调用、主进程注册和事件监听；同一通道可能有多个方向。回调参数为源码签名，event 是 Electron 事件。', '',
  '| 文件/位置 | 操作 | 通道 | 包装方法或回调参数 |', '| --- | --- | --- | --- |',
];
for (const source of sources.filter(source => source.path.startsWith('src/'))) {
  visit(source.ast, node => {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return;
    const receiver = node.expression.expression.getText(source.ast), method = node.expression.name.text;
    const electronReceiver = ['ipcRenderer', 'ipcMain', 'ipc'].includes(receiver) || /(?:\.|\?\.)webContents$/.test(receiver);
    if (!electronReceiver || !['handle', 'on', 'once', 'invoke', 'send'].includes(method)) return;
    const channel = node.arguments[0];
    if (!channel || !ts.isStringLiteral(channel)) return;
    let ancestor = node.parent;
    while (ancestor && !ts.isPropertyAssignment(ancestor) && !ts.isSourceFile(ancestor)) ancestor = ancestor.parent;
    const callback = node.arguments.find(arg => ts.isArrowFunction(arg) || ts.isFunctionExpression(arg));
    const signature = ts.isPropertyAssignment(ancestor) ? ancestor.name.getText(source.ast)
      : callback ? '(' + callback.parameters.map(p => p.getText(source.ast)).join(', ') + ')' : '—';
    out.push(`| ${link(source, node)} | ${receiver}.${method} | \`${channel.text}\` | ${cell(signature)} |`);
  });
}
out.push('', '## 命令分发完整索引', '',
  '三组 action 字符串分别属于不同通道，不能跨组混用。精确参数与返回值沿处理分支追至下方方法签名；通用入口本身没有完整的逐命令静态类型。', '',
  '| 入口 | action | 处理分支 |', '| --- | --- | --- |');
for (const [path, channel] of [['src/distillation/desktop.ts', 'distillation:command'], ['src/workflows/desktop.ts', 'workflow:command'], ['src/problem-reports/desktop.ts', 'feedback:command']]) {
  const source = byPath.get(path);
  visit(source.ast, node => {
    if (ts.isSwitchStatement(node) && node.expression.getText(source.ast) === 'action') {
      for (const clause of node.caseBlock.clauses) if (ts.isCaseClause(clause) && ts.isStringLiteral(clause.expression))
        out.push(`| \`${channel}\` | \`${clause.expression.text}\` | ${link(source, clause)} |`);
    }
  });
}
out.push('', '## 核心模块方法签名', '',
  '只列显式公开的方法、访问器与构造器。省略 private/# 成员；未标注返回类型的方法保留原状，须查看实现，不能据此推定 void。', '');
for (const path of classFiles) {
  const source = byPath.get(path);
  for (const node of source.ast.statements.filter(n => ts.isClassDeclaration(n) && exported(n))) {
    const methods = node.members.filter(m => (ts.isMethodDeclaration(m) || ts.isGetAccessor(m) || ts.isConstructorDeclaration(m))
      && !m.modifiers?.some(mod => mod.kind === ts.SyntaxKind.PrivateKeyword || mod.kind === ts.SyntaxKind.ProtectedKeyword)
      && !(m.name && ts.isPrivateIdentifier(m.name)));
    out.push(`### ${node.name.text}`, '', link(source, node), '', '```typescript');
    for (const method of methods) {
      const text = source.text.slice(method.getStart(source.ast), method.body ? method.body.getStart(source.ast) : method.end).trim();
      out.push(text.replace(/;$/, '') + ';');
    }
    out.push('```', '');
  }
}
out.push('## 核心数据类型原文', '',
  '下列文件中的导出 type/interface 为选定的核心业务与协议范围；工具函数、UI 私有类型及未选文件请沿源码继续查阅。交叉引用的 TypeScript 类型保留引用，不自动展开。', '');
for (const path of selected) {
  const source = byPath.get(path);
  const types = source.ast.statements.filter(n => exported(n) && (ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n)));
  if (!types.length) continue;
  out.push(`### ${path}`, '', link(source, types[0]), '', '```typescript');
  out.push(...types.map(node => node.getText(source.ast)), '```', '');
}
out.push('## 数据库建表语句来源', '',
  '这是源码中的 CREATE TABLE 语句索引，含初建与迁移前结构，不代表当前物理表清单；ALTER/RENAME 和运行时增表见字段字典。', '',
  '| 声明文件/位置 | SQL 中的表名 |', '| --- | --- |');
for (const source of sources) {
  visit(source.ast, node => {
    if (!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node) && !ts.isTemplateHead(node) && !ts.isTemplateMiddle(node) && !ts.isTemplateTail(node)) return;
    for (const match of node.text.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?([a-z_]+)/gi))
      out.push(`| ${link(source, node)} | \`${match[1]}\` |`);
  });
}
const rendered = out.join('\n') + '\n';
if (process.argv.includes('--check')) {
  if (readFileSync(output, 'utf8') !== rendered) throw new Error('代码索引已过期，请运行 node scripts/architecture-reference.mjs');
  console.log('架构代码索引与当前源码一致');
} else {
  writeFileSync(output, rendered);
  console.log('已更新 docs/reference/code-index.md');
}
