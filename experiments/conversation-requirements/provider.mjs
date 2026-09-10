import { createHash } from 'node:crypto';
export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');

/** Credentials remain in memory. Trace contains public answer/usage, never reasoning or headers. */
export class DeepSeek {
  constructor({key=process.env.DEEPSEEK_API_KEY, baseUrl=process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com', model='deepseek-flash', thinking=false, effort=process.env.WORKET_RESEARCH_EFFORT??'high', timeoutMs=300000, retries=2}={}) {
    if (!key) throw new Error('DEEPSEEK_API_KEY is required; no mock fallback');
    const url = new URL(baseUrl);
    if(url.protocol !== 'https:' || url.username || url.password || url.search) throw new Error('Provider must be an HTTPS URL without credentials/query');
    if(!['low','high','max'].includes(effort))throw new Error('Invalid reasoning effort');
    Object.assign(this,{key,baseUrl:baseUrl.replace(/\/$/,''),model,thinking,effort,timeoutMs,retries});
    this.calls=[];
  }
  async json(system, input, {phase='extract', maxTokens=10000}={}) {
    const body={model:this.model,messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(input)}],response_format:{type:'json_object'},thinking:{type:this.thinking?'enabled':'disabled'},max_tokens:this.thinking?Math.max(maxTokens,32768):maxTokens,...(this.thinking?{reasoning_effort:this.effort}:{temperature:0})};
    for(let attempt=0;attempt<=this.retries;attempt++) {
      const start=Date.now(); let response;
      try {
        response=await fetch(`${this.baseUrl}/chat/completions`,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${this.key}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(this.timeoutMs)});
      } catch(error) {
        this.calls.push({phase,attempt,status:'NETWORK_ERROR',durationMs:Date.now()-start,requestHash:digest(body)});
        if(attempt===this.retries) throw new Error(`Provider network/timeout failure (${error.name}); no result produced`);
        await new Promise(r=>setTimeout(r,1000*(attempt+1))); continue;
      }
      const trace={phase,attempt,httpStatus:response.status,durationMs:Date.now()-start,requestHash:digest(body)};
      if(!response.ok) {
        await response.body?.cancel(); this.calls.push(trace);
        if([429,500,502,503,504].includes(response.status) && attempt<this.retries) {await new Promise(r=>setTimeout(r,2000*(attempt+1)));continue;}
        throw new Error(`Provider HTTP ${response.status}; response body omitted to protect credentials`);
      }
      const value=await response.json();
      Object.assign(trace,{durationMs:Date.now()-start,responseId:value.id,requestedModel:this.model,returnedModel:value.model,usage:value.usage,finishReason:value.choices?.[0]?.finish_reason});
      this.calls.push(trace);
      if(value.model!==this.model) throw new Error(`Model mismatch: requested ${this.model}, returned ${value.model}; explicit version review required`);
      if(trace.finishReason==='length'&&this.thinking&&body.max_tokens<65536&&attempt<this.retries){
        trace.status='OUTPUT_LIMIT_RETRY';trace.rawAnswer=value.choices?.[0]?.message?.content??'';
        body.max_tokens=Math.min(body.max_tokens*2,65536);continue;
      }
      if(trace.finishReason!=='stop') throw new Error(`Incomplete model output: ${trace.finishReason}`);
      const content=value.choices?.[0]?.message?.content;
      if(typeof content!=='string') throw new Error('Provider returned no answer');
      try {const answer=JSON.parse(content); trace.answer=answer; return answer;} catch {
        trace.status='INVALID_JSON'; trace.rawAnswer=content;
        if(attempt===this.retries)throw new Error('Provider returned invalid JSON after explicit syntax retries');
        body.messages.push({role:'assistant',content},{role:'user',content:'Your preceding answer was invalid JSON. Return the complete answer as valid JSON only, with no Markdown fences. Preserve meanings; fix JSON syntax.'});
      }
    }
  }
}
