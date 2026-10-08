import type { ServiceConfig } from "../ai-service/connection.js";
import { ContractError, ensure } from "../contracts/definition.js";
import { reportHash } from "../contracts/problem-report.js";
export class ReportClient {
  constructor(readonly config: ()=>ServiceConfig, readonly connect?: ()=>Promise<void>) {}
  scope(): string {
    const c=this.config(); let claims: {uid?: string; sub?: string}={};
    try {claims=JSON.parse(Buffer.from(c.token.split(".")[1] ?? "","base64url").toString());} catch {}
    return reportHash([c.url.replace(/\/$/,""),c.recoveryCode ?? c.userId ?? claims.uid ?? claims.sub ?? c.installationSecret ?? c.token,c.installationSecret ?? c.deviceId ?? claims.sub ?? c.token]);
  }
  async request(path: string, method="GET", input?: unknown, scope=this.scope(), signal?: AbortSignal): Promise<any> {
    await this.connect?.();
    ensure(this.scope() === scope,"AUTH_CHANGED","服务或身份已变化，原反馈不会发送");
    const c=this.config(); ensure(c.url && c.token,"AUTH_REQUIRED","请在 Worket 服务中完成连接");
    const url=new URL(c.url);
    ensure((url.protocol === "https:" || (c.development && url.protocol === "http:" && ["127.0.0.1","localhost","[::1]"].includes(url.hostname))) && !url.username && !url.password && !url.search && !url.hash,"INVALID_SERVICE_URL");
    try {
      const response=await fetch(c.url.replace(/\/$/,"")+path,{method,redirect:"error",headers:{Authorization:`Bearer ${c.token}`,"Content-Type":"application/json"},...(input ? {body:JSON.stringify(input)} : {}),signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000)});
      const value=await response.json();
      if (!response.ok) throw new ContractError(value.code ?? "REPORT_UNAVAILABLE","暂时无法处理反馈",value.retryable || response.status >= 500 || response.status === 429);
      ensure(this.scope() === scope,"AUTH_CHANGED"); return value;
    } catch (error) {
      if (error instanceof ContractError) throw error;
      throw new ContractError("REPORT_NETWORK_UNAVAILABLE","网络不可用，联网后自动发送本次反馈",true);
    }
  }
}
