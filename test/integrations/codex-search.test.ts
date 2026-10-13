import assert from 'node:assert/strict';
import test from 'node:test';
import { makeService } from '../helpers/app-options.ts';

test('history search passes the query and cursor to its selected source without reading or recording a conversation', async () => {
 const calls: unknown[][]=[];
 const codex={async listThreadPage(...args: unknown[]){calls.push(args);return{threads:[],nextCursor:'next',notice:'兼容搜索提示'};},async readThread(){throw new Error('Search must not read history');},close(){}};
 const service=makeService({databasePath:':memory:',codex});
 try{
  const page=await service.listConversationHistory('codex','cursor','Agent SOURCE');
  assert.deepEqual(calls,[[30,'cursor','Agent SOURCE']]);
  assert.equal(page.nextCursor,'next');assert.equal(page.notice,'兼容搜索提示');
  assert.equal(service.dashboard().works.length,0);
 }finally{service.close();}
});
