// Local prototype only. No real feedback service or user database.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
const files = new Map([
  ['/', [new URL('./index.html', import.meta.url), 'text/html; charset=utf-8']],
  ['/prototype.css', [new URL('./prototype.css', import.meta.url), 'text/css; charset=utf-8']],
  ['/prototype.js', [new URL('./prototype.js', import.meta.url), 'text/javascript; charset=utf-8']],
  ['/sample-window.svg', [new URL('./sample-window.svg', import.meta.url), 'image/svg+xml']],
  ['/theme.css', [new URL('../../../src/renderer/theme.css', import.meta.url), 'text/css; charset=utf-8']],
  ['/panel.css', [new URL('../../../src/renderer/panel.css', import.meta.url), 'text/css; charset=utf-8']],
]);
const port = Number(process.env.WORKET_FEEDBACK_PREVIEW_PORT ?? 4327);
http.createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
  const entry = files.get(new URL(request.url, `http://127.0.0.1:${port}`).pathname);
  if (!entry) { response.writeHead(404).end('Not found'); return; }
  try {
    const body = await readFile(entry[0]);
    response.writeHead(200, { 'Content-Type': entry[1], 'Cache-Control': 'no-store' }).end(request.method === 'HEAD' ? undefined : body);
  } catch { response.writeHead(500).end('Prototype asset unavailable'); }
}).listen(port, '127.0.0.1', () => console.log(`Worket feedback prototype: http://127.0.0.1:${port}/?variant=A`));
