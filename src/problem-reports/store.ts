import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, chmodSync, fsyncSync, openSync, closeSync } from "node:fs";
import { join } from "node:path";
import { REPORT_LIMITS, validateEnvelope, type DiagnosticSnapshot, type ReportEnvelope, type ReportImage, type ReportReceipt } from "../contracts/problem-report.js";
import { ensure } from "../contracts/definition.js";

export type FeedbackDraft = { description: string; screenshots: ReportImage[]; diagnostics: DiagnosticSnapshot; consent: boolean; scope: string; occurredAt: string; updatedAt: number };
export type SendState = "WAITING" | "SENDING" | "RECEIVED" | "PAUSED" | "CANCELLED" | "EXPIRED" | "DELETED";
export type LocalReport = { id: string; scope: string; createdAt: number; status: SendState; attempts: number; nextAttempt: number; error: string; envelope: ReportEnvelope | null; receipt: ReportReceipt | null };
type Saved = {schemaVersion: 1; draft: FeedbackDraft | null; reports: LocalReport[]};
export class ReportStore {
  private data: Saved={schemaVersion:1,draft:null,reports:[]};
  private broken=false;
  readonly path: string;
  constructor(directory: string) {
    const root=join(directory,"problem-reports"); this.path=join(root,"state.json");
    try {
      mkdirSync(root,{recursive:true,mode:0o700}); chmodSync(root,0o700);
      if (existsSync(this.path)) {
        const value=JSON.parse(readFileSync(this.path,"utf8")) as Saved;
        ensure(value.schemaVersion === 1 && Array.isArray(value.reports),"INVALID_INPUT");
        for (const report of value.reports) if (report.envelope) validateEnvelope(report.envelope);
        this.data=value;
      }
      for (const report of this.data.reports) if (report.status === "SENDING") report.status="WAITING";
      this.expire();
    } catch {this.broken=true;}
  }
  private save(next: Saved): void {
    ensure(!this.broken,"REPORT_STORAGE_UNAVAILABLE","本地反馈数据无法读取，请保留数据目录并检查磁盘");
    const serialized=JSON.stringify(next);
    ensure(Buffer.byteLength(serialized) <= REPORT_LIMITS.localBytes,"REPORT_STORAGE_FULL","反馈暂存空间不足，请先处理待发送反馈");
    const temp=this.path+".tmp";
    writeFileSync(temp,serialized,{mode:0o600});
    const fd=openSync(temp,"r"); try {fsyncSync(fd);} finally {closeSync(fd);}
    renameSync(temp,this.path); this.data=next;
  }
  draft(): FeedbackDraft | null {
    ensure(!this.broken,"REPORT_STORAGE_UNAVAILABLE"); this.expire();
    return this.data.draft ? structuredClone(this.data.draft) : null;
  }
  writeDraft(value: FeedbackDraft): void {this.save({...this.data,draft:structuredClone(value)});}
  discard(): void {this.save({...this.data,draft:null});}
  reports(): LocalReport[] { this.expire(); return structuredClone(this.data.reports); }
  get(id: string): LocalReport {const item=this.data.reports.find(r=>r.id === id); ensure(item,"NOT_FOUND"); return structuredClone(item);}
  enqueue(scope: string, envelope: ReportEnvelope): LocalReport {
    validateEnvelope(envelope); this.expire();
    const item: LocalReport={id:envelope.report.reportId,scope,createdAt:Date.now(),status:"WAITING",attempts:0,nextAttempt:0,error:"",envelope:structuredClone(envelope),receipt:null};
    this.save({...this.data,draft:null,reports:[item,...this.data.reports]}); return item;
  }
  update(id: string, patch: Partial<Omit<LocalReport,"id"|"scope"|"createdAt">>): void {
    this.save({...this.data,reports:this.data.reports.map(r=>r.id === id ? {...r,...patch} : r)});
  }
  expire(): void {
    const now=Date.now(); let changed=false;
    const next=structuredClone(this.data);
    if (next.draft && now-next.draft.updatedAt >= REPORT_LIMITS.localTtl) {next.draft=null;changed=true;}
    next.reports=next.reports.filter(r=>{if (now-r.createdAt >= REPORT_LIMITS.reportTtl) {changed=true;return false;} return true;});
    for (const report of next.reports) if (report.envelope && report.status !== "RECEIVED" && now-report.createdAt >= REPORT_LIMITS.localTtl) {
      report.envelope=null; report.status="EXPIRED"; report.error="未发送，已到期";changed=true;
    }
    if (changed) this.save(next);
  }
  newId(): string {return randomUUID();}
}
