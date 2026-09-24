// Local-only, read-only prototype server. No production services, credentials or workspace listing.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('./', import.meta.url);
const repository = new URL('../../../', root);
const files = new Map([
  ['/', ['refinement.html', 'text/html; charset=utf-8']],
  ['/index.html', ['refinement.html', 'text/html; charset=utf-8']],
  ['/exploration', ['index.html', 'text/html; charset=utf-8']],
  ['/refinement.css', ['refinement.css', 'text/css; charset=utf-8']],
  ['/refinement.js', ['refinement.js', 'text/javascript; charset=utf-8']],
  ['/appearance.css', ['appearance.css', 'text/css; charset=utf-8']],
  ['/appearance.js', ['appearance.js', 'text/javascript; charset=utf-8']],
  ['/assets/previous-material-study.png', ['assets/previous-material-study.png', 'image/png']],
  ['/assets/previous-edge-study.png', ['assets/previous-edge-study.png', 'image/png']],
  ['/assets/clay-poses-v1.png', ['assets/clay-poses-v1.png', 'image/png']],
  ['/assets/clay-poses-v2.png', ['assets/clay-poses-v2.png', 'image/png']],
]);
const allowedStates = ['sleeping','awake','distilling-running','distilling-ready','distilling-failed'];
async function baseline(state) {
  let html = await readFile(new URL('src/renderer/pet.html', repository), 'utf8');
  html = html.replace('href="theme.css"', 'href="/baseline-theme.css"').replace('href="pet.css"', 'href="/baseline-pet.css"');
  html = html.replace('<div id="pet" class="pet sleeping">', `<div id="pet" class="pet ${state}">`);
  html = html.replace('<script type="module" src="pet.js"></script>', `<style>.pet-anchor{--pet-x:14px;--pet-y:12px}body[data-paused="true"] *{animation-play-state:paused!important}</style><script>addEventListener('message',event=>{if(event.origin!==location.origin||event.data?.type!=='prototype-state')return;const states=${JSON.stringify(allowedStates)};if(states.includes(event.data.state))document.querySelector('#pet').className='pet '+event.data.state;document.body.dataset.paused=String(Boolean(event.data.paused));});</script>`);
  return html;
}
const port = Number(process.env.WORKET_PET_PREVIEW_PORT ?? 4178);
http.createServer(async (request, response) => {
  if(request.method !== 'GET' && request.method !== 'HEAD'){response.writeHead(405).end();return;}
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  try {
    let data, type;
    if(url.pathname === '/baseline'){
      const state = allowedStates.includes(url.searchParams.get('state')) ? url.searchParams.get('state') : 'awake';
      data = await baseline(state);type = 'text/html; charset=utf-8';
    } else if(url.pathname === '/baseline-theme.css' || url.pathname === '/baseline-pet.css'){
      data = await readFile(new URL(`src/renderer/${url.pathname === '/baseline-theme.css' ? 'theme' : 'pet'}.css`,repository));type='text/css; charset=utf-8';
    } else {
      const entry = files.get(url.pathname);if(!entry){response.writeHead(404).end('Not found');return;}
      data = await readFile(new URL(entry[0],root));type=entry[1];
    }
    response.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'}).end(request.method === 'HEAD' ? undefined : data);
  } catch(error){console.error(error.message);response.writeHead(500).end('Prototype asset unavailable');}
}).listen(port,'127.0.0.1',()=>console.log(`Worket clay refinement: http://127.0.0.1:${port}/\nSource: ${fileURLToPath(root)}`));
