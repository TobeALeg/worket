import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, readdirSync, statSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { REPORT_LIMITS, DIAGNOSTIC_CODES, validateSnapshot, validateEvent, type DiagnosticAction, type DiagnosticEvent, type DiagnosticSnapshot } from "../contracts/problem-report.js";

export class Diagnostics {
  readonly directory: string;
  readonly previousExit: boolean;
  private context=new AsyncLocalStorage<string>();
  traceId(): string {return this.context.getStore() ?? randomUUID();}
  private previous: DiagnosticSnapshot | null = null;
  private failedWrite = false;
  private omitted = false;
  constructor(directory: string) {
    this.directory=join(directory,"diagnostics");
    this.previousExit=existsSync(join(this.directory,"running"));
    try {
      mkdirSync(this.directory,{recursive:true,mode:0o700});
      this.prune();
      if (existsSync(join(this.directory,"fault.json"))) {const snapshot:unknown=JSON.parse(readFileSync(join(this.directory,"fault.json"),"utf8"));validateSnapshot(snapshot);this.previous=snapshot;}
      if (this.previousExit && !this.previous) this.previous=this.snapshot();
      writeFileSync(join(this.directory,"running"),"1",{mode:0o600});
    } catch { this.failedWrite=true; }
    this.event("app","start");
  }
  event(action: DiagnosticAction, phase: DiagnosticEvent["phase"], fields: Partial<Pick<DiagnosticEvent,"traceId"|"code"|"elapsedMs"|"requestId"|"executor"|"count">> = {}): void {
    try {
      const event: DiagnosticEvent={at:new Date().toISOString(),traceId:this.traceId(),action,phase,...fields};
      validateEvent(event);
      appendFileSync(join(this.directory,`${event.at.slice(0,10)}.jsonl`),JSON.stringify(event)+"\n",{mode:0o600});
      this.failedWrite=false;
      this.prune();
      if (phase === "failed" && action !== "feedback") {
        const snapshot=this.snapshot();
        writeFileSync(join(this.directory,"fault.json.tmp"),JSON.stringify(snapshot),{mode:0o600});
        renameSync(join(this.directory,"fault.json.tmp"),join(this.directory,"fault.json"));
        this.previous=snapshot;
      }
    } catch { this.failedWrite=true; }
  }
  async operation<T>(action: DiagnosticAction, fn: ()=>Promise<T>, fields: Partial<Pick<DiagnosticEvent,"executor">> = {}): Promise<T> {
    const traceId=this.traceId(), start=Date.now(); this.event(action,"start",{traceId,...fields});
    try { const value=await this.context.run(traceId,fn); this.event(action,action === "handoff" ? "pending" : "complete",{traceId,elapsedMs:Date.now()-start,...fields}); return value; }
    catch (error) { this.event(action,"failed",{traceId,code:safeCode(error),elapsedMs:Date.now()-start,...fields}); throw error; }
  }
  snapshot(): DiagnosticSnapshot {
    const to=new Date().toISOString(), from=new Date(Date.now()-REPORT_LIMITS.windowMs).toISOString();
    const events: DiagnosticEvent[]=[]; let truncated=this.failedWrite || this.omitted, size=0;
    try {
      for (const name of readdirSync(this.directory).filter(n=>/^\d{4}-\d\d-\d\d\.jsonl$/.test(n)).sort()) {
        if (name.slice(0,10) < from.slice(0,10)) continue;
        for (const line of readFileSync(join(this.directory,name),"utf8").split("\n")) {
          if (!line) continue;
          try { const event: unknown=JSON.parse(line); validateEvent(event); if (event.at < from || event.at > to) continue;
            if (events.length >= 10000 || size+line.length > REPORT_LIMITS.logBytes-4096) {truncated=true; continue;}
            size+=line.length; events.push(event);
          } catch {truncated=true;}
        }
      }
    } catch {truncated=true;}
    return {from,to,events,truncated,previousExit:this.previousExit};
  }
  fault(): DiagnosticSnapshot | null { return this.previous; }
  close(): void { this.event("app","complete"); try {unlinkSync(join(this.directory,"running"));} catch {} }
  private prune(): void {
    const files=readdirSync(this.directory).filter(n=>/^\d{4}-\d\d-\d\d\.jsonl$/.test(n)).sort();
    let total=files.reduce((n,f)=>n+statSync(join(this.directory,f)).size,0);
    // Leave room for a bounded fault snapshot.
    for (const name of files) {
      const path=join(this.directory,name), info=statSync(path);
      if (Date.now()-Date.parse(name.slice(0,10)) > REPORT_LIMITS.localTtl || total > REPORT_LIMITS.logStorageBytes-2*REPORT_LIMITS.logBytes) {if(info.mtimeMs>Date.now()-REPORT_LIMITS.windowMs)this.omitted=true;unlinkSync(path); total-=info.size;}
    }
    const fault=join(this.directory,"fault.json");
    if (existsSync(fault) && Date.now()-statSync(fault).mtimeMs > REPORT_LIMITS.localTtl) unlinkSync(fault);
  }
}
export function safeCode(error: unknown): string {
  const code=(error as {code?:unknown})?.code;
  return typeof code === "string" && (DIAGNOSTIC_CODES as readonly string[]).includes(code) ? code : "OPERATION_FAILED";
}
