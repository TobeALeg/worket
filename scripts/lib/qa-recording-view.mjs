import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createManagedService } from '../../server/managed.mjs';
export async function recordingViewService(directory) {
  let calls = 0, admin, uploadedBytes = 0, uploads = 0;
  const service = createManagedService({ directory: join(directory, 'sample-server'), providerFactory: () => ({model:'unused',async call(){calls++;throw Error('No model expected');}}) });
  await new Promise(r => service.server.listen(0, '127.0.0.1', r));
  service.server.on('request', req => {
    if (req.method === 'POST' && req.url === '/v1/improvement-samples') { uploads++; const bytes = Number(req.headers['content-length']); assert.ok(Number.isSafeInteger(bytes) && bytes >= 0); uploadedBytes += bytes; }
  });
  service.store.setup('synthetic-password'); const user = service.store.issue({ name:'QA source view', days:1 });
  const url = `http://127.0.0.1:${service.server.address().port}`;
  const login = await fetch(url+'/admin/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'synthetic-password'})});
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const get = async path => { const response = await fetch(url+'/admin/api/'+path,{headers:{cookie}});assert.equal(response.status,200);return response.json(); };
  return {
    async configure(panel) { await panel.evaluate(config => window.workpet.configureWorketService(config),{url,token:user.token}); await panel.evaluate(()=>window.workpet.distillation('setImprovementPreference',{enabled:true})); },
    async sync(panel, read = true) {
      const until = Date.now()+15000;
      while(Date.now()<until) {
        await panel.evaluate(()=>window.workpet.distillation('syncImprovement'));
        const local = await panel.evaluate(()=>window.workpet.distillation('improvementSamples'));
        assert.ok(!local.some(s=>s.error),JSON.stringify(local));
        if(local.length && local.every(s=>s.pending===0)) {
          if (!read) return;
          const list=await get('samples');assert.equal(list.items.length,1);
          const detail=await get('samples/'+list.items[0].id);assert.equal(calls,0);return detail;
        }
        await new Promise(r=>setTimeout(r,50));
      }
      throw Error('Sample queue did not drain');
    },
    async inspect(app, output, name) {
      if (!admin) {
        await app.evaluate(({BrowserWindow},url)=>{const w=new BrowserWindow({width:1100,height:900,webPreferences:{contextIsolation:true,nodeIntegration:false}});void w.loadURL(url+'/admin/');},url);
        const until=Date.now()+10000;
        while(!admin&&Date.now()<until){admin=app.windows().find(p=>p.url().startsWith(url+'/admin/'));if(!admin)await new Promise(r=>setTimeout(r,50));}
        assert.ok(admin);admin.setDefaultTimeout(10000);
        await admin.locator('#admin-password').fill('synthetic-password');await admin.locator('#login-submit').click();
        await admin.locator('[data-tab="samples"]').click();
      }
      await admin.locator('#refresh-samples').click();await admin.locator('#samples-list button').first().click();
      await admin.locator('#sample-detail').getByRole('heading',{name:'当前有效原文'}).waitFor();
      await admin.screenshot({path:join(output,name+'.png')});
      return admin.locator('#sample-detail').innerText();
    },
    metrics(){return {uploadedBytes,uploads};},
    async close(){await service.close();},
  };
}
