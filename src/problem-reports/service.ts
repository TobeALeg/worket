import type { Diagnostics } from "../diagnostics/recorder.js";
import { safeCode } from "../diagnostics/recorder.js";
import { REPORT_LIMITS, reportHash, validateImage, validateEnvelope, type ReportImage, type ProblemReport, type ReportReceipt } from "../contracts/problem-report.js";
import { ensure, ContractError } from "../contracts/definition.js";
import { ReportStore, type FeedbackDraft } from "./store.js";
import { ReportClient } from "./client.js";
export class ProblemReports {
  private active=new Map<string,AbortController>();
  private stopped=false;
  constructor(readonly store: ReportStore, readonly client: ReportClient, readonly diagnostics: Diagnostics, readonly environment: ProblemReport["environment"]) {}
  draft(): FeedbackDraft {
    const saved=this.store.draft();
    const draft=saved ?? {description:"",screenshots:[],diagnostics:this.diagnostics.snapshot(),consent:false,scope:this.client.scope(),occurredAt:new Date().toISOString(),updatedAt:Date.now()};
    const changed=draft.scope !== this.client.scope();
    if (changed) {draft.scope=this.client.scope();draft.consent=false;}
    if (!saved || changed) this.store.writeDraft(draft);
    return draft;
  }
  save(input: unknown): FeedbackDraft {
    ensure(input && typeof input === "object","INVALID_INPUT");
    const value=input as {description?:unknown;consent?:unknown;scope?:unknown};
    ensure(typeof value.description === "string" && value.description.length <= REPORT_LIMITS.text && typeof value.consent === "boolean" && Object.keys(value).every(k=>["description","consent","scope"].includes(k)),"INVALID_INPUT");
    ensure(value.scope === this.client.scope(),"AUTH_CHANGED","服务或身份已改变，请重新确认本次日志选择");
    const draft=this.draft(); draft.description=value.description;draft.consent=value.consent;draft.updatedAt=Date.now();this.store.writeDraft(draft);return draft;
  }
  add(image: ReportImage): FeedbackDraft {
    validateImage(image); const draft=this.draft();ensure(draft.screenshots.length<REPORT_LIMITS.images,"INPUT_TOO_LARGE","最多添加 3 张截图");
    draft.screenshots.push(image);draft.updatedAt=Date.now();this.store.writeDraft(draft);return draft;
  }
  remove(id: string): FeedbackDraft {const draft=this.draft(); draft.screenshots=draft.screenshots.filter(i=>i.id!==id);draft.updatedAt=Date.now();this.store.writeDraft(draft);return draft;}
  fault(): FeedbackDraft {
    const fault=this.diagnostics.fault();ensure(fault,"NOT_FOUND","没有保留的故障现场");const draft=this.draft();draft.diagnostics=fault;draft.occurredAt=fault.to;draft.consent=false;draft.updatedAt=Date.now();this.store.writeDraft(draft);return draft;
  }
  submit(input: unknown) {
    const draft=this.save(input);
    const report: ProblemReport={schemaVersion:1,reportId:this.store.newId(),occurredAt:draft.occurredAt,submittedAt:new Date().toISOString(),description:draft.description.trim(),environment:this.environment,screenshots:draft.screenshots,diagnostics:draft.consent ? draft.diagnostics : null,authorization:{scopeVersion:1,diagnostics:draft.consent}};
    const envelope={report,sha256:reportHash(report)};validateEnvelope(envelope);
    const queued=this.store.enqueue(this.client.scope(),envelope);
    void this.send(queued.id).catch(() => this.diagnostics.event("feedback","failed",{code:"REPORT_STORAGE_UNAVAILABLE"}));return queued;
  }
  async send(id: string): Promise<void> {
    if (this.stopped || this.active.has(id)) return;
    const item=this.store.get(id);
    if (item.status !== "WAITING" || !item.envelope || item.nextAttempt>Date.now()) return;
    if (item.scope !== this.client.scope()) {this.store.update(id,{status:"PAUSED",error:"服务或身份已变化，未发送"});return;}
    const controller=new AbortController();this.active.set(id,controller);
    this.store.update(id,{status:"SENDING",attempts:item.attempts+1});
    try {
      const caps=await this.client.request("/v1/capabilities","GET",undefined,item.scope,controller.signal);
      ensure(caps.problemReportSchemaVersions?.includes(1),"SERVICE_UPGRADE_REQUIRED","后台暂不支持问题反馈，请升级后台或导出诊断包");
      const receipt=await this.client.request("/v1/problem-reports","POST",item.envelope,item.scope,controller.signal) as ReportReceipt;
      ensure(receipt.reportId===id && receipt.sha256===item.envelope.sha256 && Number.isFinite(Date.parse(receipt.receivedAt)),"INVALID_RECEIPT");
      if (this.store.get(id).status === "SENDING") this.store.update(id,{status:"RECEIVED",receipt,error:""});
    } catch (error) {
      if (this.store.get(id).status === "SENDING") {
        const retry=error instanceof ContractError && error.retryable && item.attempts+1<REPORT_LIMITS.maxAttempts;
        this.store.update(id,{status:retry ? "WAITING" : "PAUSED",nextAttempt:Date.now()+Math.min(3600000,3000*2**item.attempts),error:error instanceof ContractError && error.code === "SERVICE_UPGRADE_REQUIRED" ? "后台暂不支持问题反馈，请升级或导出诊断包" : retry ? "网络不可用，联网后自动发送本次反馈" : "发送暂停，请检查服务连接或导出诊断包"});
        this.diagnostics.event("feedback","failed",{code:safeCode(error)});
      }
    } finally {this.active.delete(id);}
  }
  async tick(): Promise<void> {if(this.stopped)return; for (const item of this.store.reports()) if(item.status==="WAITING") await this.send(item.id);}
  retry(id: string) {const item=this.store.get(id);ensure(["WAITING","PAUSED"].includes(item.status) && item.scope===this.client.scope(),"AUTH_CHANGED","请恢复提交时的服务和身份");ensure(item.envelope,"REPORT_EXPIRED");this.store.update(id,{status:"WAITING",attempts:0,nextAttempt:0,error:""});void this.send(id).catch(() => this.diagnostics.event("feedback","failed",{code:"REPORT_STORAGE_UNAVAILABLE"}));}
  async cancel(id: string) {
    const item=this.store.get(id);ensure(!["EXPIRED","DELETED"].includes(item.status),"INVALID_STATE");
    this.active.get(id)?.abort();this.store.update(id,{status:"PAUSED",error:"正在核对接收状态"});
    // Deletion is idempotent, and erases even a report committed just before the abort.
    try {
      await this.client.request(`/v1/problem-reports/${id}`,"DELETE",undefined,item.scope);
      this.store.update(id,{status:"DELETED",envelope:null,receipt:null,error:""});
    } catch(error) {
      if (error instanceof ContractError && error.code === "NOT_FOUND") this.store.update(id,{status:"CANCELLED",envelope:null,receipt:null,error:""});
      else throw new ContractError("REPORT_CANCEL_UNCONFIRMED","已停止重试；接收状态暂时无法核对，联网后请再次取消或删除");
    }
  }
  close(): void {this.stopped=true;for(const controller of this.active.values())controller.abort();}
}
