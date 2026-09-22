import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { ContractError } from '../../dist/contracts/definition.js';

// The configured provider/key stays inside the existing service container. Only authorized
// synthetic prompts and model responses cross this bridge, with no hidden retry.
const bridge = `import {readFileSync} from 'node:fs'; import {AdminStore} from '/app/server/admin/store.mjs'; import {ModelProvider} from '/app/server/workflow.mjs'; const store=Object.create(AdminStore.prototype); store.data=JSON.parse(readFileSync('/data/settings.json','utf8')); store.master=readFileSync('/data/encryption.key'); const config=store.data.provider; const provider=new ModelProvider({baseUrl:config.baseUrl,model:config.model,apiKey:store.apiKey()}); const chunks=[]; for await(const chunk of process.stdin)chunks.push(chunk); try {const value=await provider.call(JSON.parse(Buffer.concat(chunks)).messages,AbortSignal.timeout(180000)); process.stdout.write(JSON.stringify({...value,configuredModel:config.model}));}catch(error){process.stderr.write(JSON.stringify({code:typeof error.code==='string'&&/^[A-Z_]+$/.test(error.code)?error.code:'MODEL_CALL_FAILED',name:error.name}));process.exitCode=1;}`;
const quote = text => "'" + text.replaceAll("'", "'\\''") + "'";
export function recordedModelProvider({ directory, maxCalls = 2 }) {
  let calls = 0;
  const usages = [];
  return { model: 'configured-worket-provider', usages, get calls() { return calls; }, async call(messages, signal) {
    assert.ok(calls < maxCalls, 'semantic trial call budget exceeded'); calls++;
    writeFileSync(join(directory, `request-${calls}.json`), JSON.stringify(messages, null, 2));
    console.log(`model call ${calls}/${maxCalls}: ${directory}`);
    const startedAt = Date.now();
    const response = await new Promise((resolve, reject) => {
      const child = spawn('ssh', ['-o', 'BatchMode=yes', 'jp-server', `sudo docker exec -i worket node --input-type=module -e ${quote(bridge)}`], { stdio: ['pipe', 'pipe', 'pipe'] });
      let out = '', err = '';
      const timeout = setTimeout(() => child.kill('SIGTERM'), 190000);
      const abort = () => child.kill('SIGTERM'); signal?.addEventListener('abort', abort, { once: true });
      child.stdout.on('data', data => out += data); child.stderr.on('data', data => err += data);
      child.once('error', error => { clearTimeout(timeout); signal?.removeEventListener('abort', abort); reject(error); });
      child.once('close', code => { clearTimeout(timeout); signal?.removeEventListener('abort', abort); if (code !== 0) {
        let detail; try { detail = JSON.parse(err); } catch { detail = { code: 'MODEL_BRIDGE_FAILED', message: err.slice(-250) }; }
        const errorCode = ['MODEL_UNAVAILABLE', 'MODEL_REFUSAL', 'MODEL_TIMEOUT', 'INCOMPLETE_COVERAGE', 'INVALID_MODEL_OUTPUT'].includes(detail.code) ? detail.code : detail.name === 'TimeoutError' ? 'MODEL_TIMEOUT' : 'MODEL_UNAVAILABLE';
        const error = new ContractError(errorCode);
        writeFileSync(join(directory, `error-${calls}.json`), JSON.stringify({ ...detail, exitCode: code, elapsedMs: Date.now() - startedAt, usage: 'unknown' }, null, 2));
        reject(error);
      } else { try { resolve(JSON.parse(out)); } catch { reject(new Error('INVALID_BRIDGE_RESPONSE')); } } });
      child.stdin.end(JSON.stringify({ messages }));
    });
    writeFileSync(join(directory, `response-${calls}.json`), JSON.stringify(response, null, 2));
    usages.push(response.usage ?? { unavailable: true });
    return response;
  } };
}
