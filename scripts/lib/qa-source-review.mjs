// Synthetic model boundary; the real service validates and saves the candidate. No provider calls.
import { result } from '../../test/distillation/fixtures.ts';
export async function seedSourceReview(app, prepared) {
    const wire = { sources: prepared.sources.map(s => ({ ...s, events: [...s.events].sort((a,b) => Number(b.kind === "user.prompt") - Number(a.kind === "user.prompt")) })) };
    return await app.evaluate(async ({app}, {prepared, candidate}) => {
      const require = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/package.json');
      const {createWorkCore} = require('./dist/core/index.js'); const {DistillationService} = require('./dist/distillation/service.js');
      const core = createWorkCore({databasePath: process.env.WORKPET_DATA_DIR + '/workpet.sqlite'});
      const client = {capabilities:async()=>({ruleSchemaVersions:[1],skillSchemaVersions:[1]}),submit:async(_,id)=>({requestId:id,status:'RUNNING'}),get:async id=>({requestId:id,status:'SUCCEEDED',result:candidate}),ack:async()=>({})};
      try {const service=new DistillationService(core,client); const job=service.start({preparationId:prepared.id,expectedContentHash:prepared.contentHash,consentVersion:'worket-data-v1',commandId:crypto.randomUUID()}); await new Promise(r=>setImmediate(r)); return await service.get(job.id);} finally {core.close();}
    }, {prepared, candidate:result(wire)});
}
