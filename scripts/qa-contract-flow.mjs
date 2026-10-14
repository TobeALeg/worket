/** Isolated UI fixture: production renderer + real services/SQLite; no external model or executor. */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { AppService } from '../dist/app/app-service.js';
import { DistillationDesktop } from '../dist/distillation/desktop.js';
import { FixtureClient, source, result } from '../test/distillation/fixtures.ts';
const directory = mkdtempSync(join(tmpdir(), 'worket-contract-flow-'));
const token = randomUUID();
let failPublish = process.argv.includes('--fail-publish-once');
let failDispatch = process.argv.includes('--fail-dispatch-once');
const adapter = {
  id: 'flow-test', name: '测试执行者', mark: 'T', bundleIds: [],
  environment: { type: 'OTHER', name: '流程测试' },
  source: { async listRecentThreads() { return []; }, async readThread() { throw new Error('unused'); }, close() {} },
  async resolveCurrent() { return null; }, async inspect() {},
  async deliver() {
    if (failDispatch) { failDispatch = false; throw new Error('EXECUTOR_UNAVAILABLE'); }
    return { conversationId: `flow-${randomUUID()}` };
  },
};
const app = new AppService({ databasePath: join(directory, 'work.sqlite'), executors: [adapter], foreground: { async current() { return null; } } });
const core = app.core();
const original = source(core, '为客户甲在中国市场制作竞品报告。交付竞品对比表和建议，每条事实必须标注来源并可追溯。');
class ReviewClient extends FixtureClient {
  async get(id) {
    const candidate = result(this.request);
    candidate.issues.push({ id: 'review-input', type: 'UNCERTAIN_GENERALIZATION', field: 'inputs.customer', message: '每次工作是否都需要指定客户？', blocking: true });
    return { requestId: id, status: 'SUCCEEDED', result: candidate };
  }
}
const desktop = new DistillationDesktop(app, new ReviewClient());
desktop.service.improvement.setEnabled(false);
const distillationActions = new Set(['prepare','start','activity','jobs','job','snapshot','seen','cancel','retry','draft','sourceReview','update','publish','definitions','definition','versions','revise','deleteDefinition','evolutionHistory','continuousEvolution','evolutionSources','improvementPreference','setImprovementPreference','recordingNotice','examples','create','dispatch','evidence','package']);
const rpc = async (method, args) => {
  if (method === 'distillation') {
    const [action, input] = args;
    if (!distillationActions.has(action)) throw new Error('QA_ACTION_UNSUPPORTED');
    if (action === 'publish' && failPublish) { failPublish = false; throw new Error('流程测试：保存暂时失败，请重试'); }
    return desktop.call(action, input);
  }
  if (method === 'getDashboard') return app.dashboard(args[0]);
  if (method === 'listExecutors') return app.listExecutors();
  if (method === 'listRecentConversations') return { conversations: [], sources: [], errors: [] };
  if (method === 'consumeSourceSelection') return null;
  if (method === 'closePanel') return null;
  if (method === 'chooseDefinitionFile') return null;
  throw new Error('QA_METHOD_UNSUPPORTED');
};
const shim = `const token=${JSON.stringify(token)};window.workpet=new Proxy({}, {get:(_,method)=>method.startsWith('on')?()=>()=>{}:method==='resizePanelRight'?()=>{}:async(...args)=>{const r=await fetch('/rpc',{method:'POST',headers:{'content-type':'application/json','x-qa-token':token},body:JSON.stringify({method,args})});const v=await r.json();if(!r.ok)throw new Error(v.error);return v;}});document.title='Worket · 独立流程测试';`;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const root = resolve('dist');
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/rpc' && req.method === 'POST') {
      if (req.headers['x-qa-token'] !== token) { res.writeHead(403).end(); return; }
      let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 2_000_000) throw new Error('TOO_LARGE'); }
      const { method, args } = JSON.parse(raw);
      const value = await rpc(method, args);
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value ?? null)); return;
    }
    if (url.pathname === '/qa-shim.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(shim); return; }
    const file = resolve(root, '.' + (url.pathname === '/' ? '/renderer/panel.html' : url.pathname));
    if (!file.startsWith(root + '/')) throw new Error('NOT_FOUND');
    let bytes = readFileSync(file);
    if (extname(file) === '.html') bytes = Buffer.from(bytes.toString().replace('<head>', '<head><base href="/renderer/"><script src="/qa-shim.js"></script>'));
    res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream'); res.end(bytes);
  } catch (error) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
});
let ticking = false;
const timer = setInterval(async () => { if (ticking) return; ticking = true; try { await desktop.service.tick(); } finally { ticking = false; } }, 500);
server.listen(8772, '127.0.0.1', () => console.log(JSON.stringify({ url: 'http://127.0.0.1:8772/', database: join(directory, 'work.sqlite'), source: original.instance.id })));
process.on('SIGINT', () => { clearInterval(timer); server.close(); app.close(); process.exit(); });
