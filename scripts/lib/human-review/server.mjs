import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ReviewStore } from './store.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export async function createReviewServer({ outputDir, samples, reviewer = 'work-owner', store: providedStore } = {}) {
  if (!providedStore && (!outputDir || !samples?.length)) throw new Error('需要固定的审阅材料和保存目录');
  const store = providedStore ?? new ReviewStore(samples, outputDir, reviewer);
  await store.initialize();
  const token = randomBytes(24).toString('hex');
  const assets = new Map([['/', ['index.html', 'text/html']], ['/app.js', ['app.js', 'text/javascript']], ['/style.css', ['style.css', 'text/css']]]);
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    try {
      const host = `127.0.0.1:${server.address().port}`;
      if (req.headers.host !== host) return send(403, { error: '仅允许本机访问' });
      if (req.headers.origin && req.headers.origin !== `http://${host}`) return send(403, { error: '来源不匹配' });
      const url = new URL(req.url, `http://${host}`);
      if (req.method === 'GET' && assets.has(url.pathname)) {
        const [file, type] = assets.get(url.pathname);
        let body = await readFile(join(here, 'public', file), 'utf8');
        if (file === 'index.html') body = body.replace('__REVIEW_TOKEN__', token);
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); return res.end(body);
      }
      if (req.headers['x-review-token'] !== token) return send(403, { error: '请重新打开审阅页面' });
      if (req.method === 'GET' && url.pathname === '/api/cases') return send(200, { cases: store.list() });
      const match = url.pathname.match(/^\/api\/cases\/([a-z0-9-]+)(\/export)?$/);
      if (!match) return send(404, { error: '页面不存在' });
      const [, id, exporting] = match;
      if (req.method === 'GET') return send(200, exporting ? store.export(id) : store.detail(id));
      if (req.method !== 'POST' || exporting) return send(405, { error: '不支持的操作' });
      if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: '需要 JSON 请求' });
      let body = '';
      for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 100000) throw Object.assign(new Error('提交内容过大'), { status: 413 }); }
      let command; try { command = JSON.parse(body); } catch { throw Object.assign(new Error('无效的 JSON'), { status: 400 }); }
      send(200, await store.mutate(id, command));
    } catch (error) { send(error.status ?? 500, { error: error.status ? error.message : '保存失败，请保留页面并重试。' }); }
  });
  return { server, store };
}
