// PROTOTYPE: static assets on loopback only; no Worket or executor API.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
const files = new Map([
 ['/', [new URL('./index.html', import.meta.url),'text/html; charset=utf-8']],
 ['/prototype.css',[new URL('./prototype.css',import.meta.url),'text/css; charset=utf-8']],
 ['/prototype.js',[new URL('./prototype.js',import.meta.url),'text/javascript; charset=utf-8']],
 ['/workbuddy.png',[new URL('../../../src/renderer/executor-logos/workbuddy.png',import.meta.url),'image/png']],
]);
const port=Number(process.env.WORKET_FLOW_PREVIEW_PORT ?? 4331);
http.createServer(async(req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
 const entry=files.get(new URL(req.url,`http://127.0.0.1:${port}`).pathname);
 if(!entry){res.writeHead(404).end();return;}
 const data=await readFile(entry[0]);res.writeHead(200,{'Content-Type':entry[1],'Cache-Control':'no-store'}).end(req.method==='HEAD'?undefined:data);
}).listen(port,'127.0.0.1',()=>console.log(`Worket workflow direction: http://127.0.0.1:${port}/?variant=A`));
