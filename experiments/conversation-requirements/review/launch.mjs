import { spawn } from 'node:child_process';
import { createReviewServer } from './server.mjs';

const port = Number(process.env.WORKET_REVIEW_PORT ?? 4318);
const url = `http://127.0.0.1:${port}`;
let existing = false;
try { existing = (await (await fetch(url, { signal: AbortSignal.timeout(1200) })).text()).includes('<title>Worket · 工作审阅</title>'); } catch {}
if (existing) {
  spawn('open', [url], { stdio: 'ignore' });
  console.log(`已打开现有审阅页面：${url}`);
} else {
  const { server } = await createReviewServer();
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 正由其他程序使用。可设置 WORKET_REVIEW_PORT 换一个端口。` : error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => {
    console.log(`真人审阅已打开：${url}\n关闭本窗口会停止服务，已保存的审阅保留在本机。`);
    spawn('open', [url], { stdio: 'ignore' });
  });
}
