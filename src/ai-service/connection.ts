import { randomBytes } from "node:crypto";
import { ContractError, ensure } from "../contracts/definition.js";

export type ServiceConfig = {
  url: string;
  token: string;
  development?: boolean;
  installationSecret?: string;
  recoveryCode?: string;
  userId?: string;
  deviceId?: string;
  subject?: string;
  expiresAt?: string;
};
export const PRODUCTION_WORKET_SERVICE_URL = "https://worket.dandi.site";
export interface CredentialStore {
  read(): ServiceConfig;
  write(value: ServiceConfig): void;
}

export class AutomaticConnection {
  private pending: Promise<void> | undefined;
  constructor(readonly store: CredentialStore, readonly defaultUrl = "") {}
  initialize(): void {
    const current = this.store.read();
    if (!current.url && this.defaultUrl) this.store.write({
      url: this.defaultUrl,
      token: "",
      installationSecret: randomBytes(32).toString("hex"),
      recoveryCode: randomBytes(32).toString("base64url"),
    });
  }
  restore(recoveryCode: string): void {
    ensure(/^[A-Za-z0-9_-]{40,100}$/.test(recoveryCode), "INVALID_INPUT", "恢复码格式不正确");
    const current = this.store.read();
    ensure(current.url, "MODEL_UNAVAILABLE", "请先配置 Worket 服务");
    this.store.write({
      url: current.url,
      token: "",
      installationSecret: randomBytes(32).toString("hex"),
      recoveryCode,
    });
  }
  async ready(): Promise<void> {
    this.initialize();
    const current = this.store.read();
    if (!current.url || !current.installationSecret) return; // Preserve unconfigured and manual services.
    if (current.token && Date.parse(current.expiresAt ?? "") > Date.now() + 86400000) return;
    if (!this.pending) this.pending = this.enroll(current).finally(() => { this.pending = undefined; });
    await this.pending;
  }
  private async enroll(current: ServiceConfig): Promise<void> {
    const url = new URL(current.url);
    ensure(url.protocol === "https:" || (current.development && url.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname)), "INVALID_SERVICE_URL");
    ensure(!url.username && !url.password && !url.search && !url.hash, "INVALID_SERVICE_URL");
    try {
      const response = await fetch(`${current.url.replace(/\/$/, "")}/v1/installations`, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: current.installationSecret,
          recoveryCode: current.recoveryCode,
        }),
      });
      const value = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new ContractError(
        typeof value.code === "string" ? value.code : "MODEL_UNAVAILABLE",
        value.code === "AUTH_REVOKED" ? "此安装的后台接入已被撤销" : "暂时无法连接 Worket 服务，请稍后重试",
      );
      ensure(typeof value.token === "string" && value.token.length > 0 &&
        typeof value.userId === "string" && typeof value.deviceId === "string" &&
        typeof value.expiresAt === "string" &&
        Date.parse(value.expiresAt) > Date.now(), "AUTH_REQUIRED");
      const latest = this.store.read();
      // A manual service change while the request is in flight takes precedence.
      if (latest.url !== current.url || latest.installationSecret !== current.installationSecret) return;
      ensure(!current.userId || current.userId === value.userId, "AUTH_REQUIRED");
      this.store.write({ ...current, token: value.token as string,
        userId: value.userId as string, deviceId: value.deviceId as string,
        subject: value.userId as string, expiresAt: value.expiresAt as string });
    } catch (error) {
      if (error instanceof ContractError) throw error;
      throw new ContractError("MODEL_UNAVAILABLE", "暂时无法连接 Worket 服务；本地工作仍然保留", true);
    }
  }
}
