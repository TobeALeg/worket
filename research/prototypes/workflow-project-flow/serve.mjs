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
// Read the user's analysis files only at runtime. Never copy the Pro scene or
// artwork into the repository, a distributable build or the Worket client.
const referenceRoot=process.env.WORKET_FLOW_REFERENCE_DIR ?? '/Users/dandi/Documents/skills/rea/project-flow-reconstruction';
async function referencePage(theme){
 const [css,scene,assetText]=await Promise.all([
  readFile(`${referenceRoot}/scene.css`,'utf8'),
  readFile(`${referenceRoot}/scene-${theme}.html`,'utf8'),
  readFile(`${referenceRoot}/assets.json`,'utf8'),
 ]);
 const assets=JSON.parse(assetText);
 const html=scene.replace(/__A_\w+?__/g,key=>assets[key]).replaceAll('__MASK__','local-reference-mask');
 return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Project Flow · 本机参考原稿</title><style>${css}</style><style>body{margin:0;background:${theme==='dark'?'#141414':'#fafafa'};font-family:Inter,system-ui,sans-serif;color:${theme==='dark'?'white':'#333'}}header{display:flex;align-items:center;gap:22px;padding:20px 30px;font-size:12px}header a{color:inherit}header span{margin-right:auto;color:#999}.ui-pf{--ui-pf-fade:${theme==='dark'?'#141414':'#fafafa'};max-width:1400px;margin:0 auto}button{font:inherit;border:1px solid #9995;background:transparent;color:inherit;border-radius:7px;padding:7px 12px;cursor:pointer}</style><header><a href="/?variant=A">← 工作流原型</a><span>Project Flow · 用户提供的本机参考</span><button id="replay">重播动画</button><a href="/reference?theme=${theme==='dark'?'light':'dark'}">${theme==='dark'?'浅色':'深色'} ↗</a></header><div class="ui-pf" data-theme="${theme}" role="img" aria-label="Project Flow 原始动画插画"><div class="pf-stage" aria-hidden="true">${html}</div></div><script>const root=document.querySelector('.ui-pf');const stage=document.querySelector('.pf-stage');new ResizeObserver(()=>stage.style.transform='scale('+root.clientWidth/2312+')').observe(root);document.querySelector('#replay').onclick=()=>location.reload();</script></html>`;
}
http.createServer(async(req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
 const url=new URL(req.url,`http://127.0.0.1:${port}`);
 if(url.pathname==='/reference'){
  try{const data=await referencePage(url.searchParams.get('theme')==='dark'?'dark':'light');res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}).end(req.method==='HEAD'?undefined:data);}
  catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}).end('本机参考文件不可用。设置 WORKET_FLOW_REFERENCE_DIR 后重试。');}
  return;
 }
 const entry=files.get(url.pathname);
 if(!entry){res.writeHead(404).end();return;}
 const data=await readFile(entry[0]);res.writeHead(200,{'Content-Type':entry[1],'Cache-Control':'no-store'}).end(req.method==='HEAD'?undefined:data);
}).listen(port,'127.0.0.1',()=>console.log(`Worket workflow direction: http://127.0.0.1:${port}/?variant=A`));
