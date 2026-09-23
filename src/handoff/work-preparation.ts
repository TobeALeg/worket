import type { AIClient } from "../ai-service/client.js";
import { hasPendingSourceChecks } from "../core/source-revisions.js";
import type { WorkCore } from "../core/index.js";
import { buildWorkPackage } from "../definitions/work-package.js";
import { hash } from "../definitions/storage.js";
import { packageMaterialVersions } from "./material-versions.js";
import { buildContinuationBasis, continuationBasisMatches, type ContinuationService, type ContinuationSnapshot } from "./continuation.js";

const NOTICE_VERSION = "automatic-work-preparation-v1";
const BATCH_DELAY_MS = 30_000;

/** Only explicit recording/handoff actions enroll a work. Startup never enrolls history. */
export class WorkPreparation {
  readonly #timers = new Map<string, { digest: string; timer: ReturnType<typeof setTimeout> }>();
  readonly #pending = new Map<string, Promise<ContinuationSnapshot>>();
  #closed = false;

  constructor(readonly core: WorkCore, readonly continuations: ContinuationService,
    readonly client?: AIClient, readonly delayMs = BATCH_DELAY_MS) {
    core.definitions.db.exec(`CREATE TABLE IF NOT EXISTS work_preparation (
      work_id TEXT PRIMARY KEY REFERENCES work_instances(id) ON DELETE CASCADE,
      identity TEXT NOT NULL, attempt_digest TEXT);
      CREATE TABLE IF NOT EXISTS work_preparation_notice (
      id INTEGER PRIMARY KEY CHECK(id=1), version TEXT NOT NULL);`);
    for (const row of core.definitions.db.prepare("SELECT work_id FROM work_preparation").all())
      this.schedule(String(row.work_id));
  }

  noticeRequired(): boolean {
    return this.core.definitions.db.prepare("SELECT version FROM work_preparation_notice WHERE id=1").get()?.version !== NOTICE_VERSION;
  }

  #identity(): string { return this.client?.improvementIdentity?.() ?? "local-client"; }

  enable(workId: string): void {
    this.core.definitions.db.prepare(`INSERT INTO work_preparation VALUES (?,?,NULL)
      ON CONFLICT(work_id) DO UPDATE SET identity=excluded.identity,
      attempt_digest=CASE WHEN identity=excluded.identity THEN attempt_digest ELSE NULL END`)
      .run(workId, this.#identity());
    this.core.definitions.db.prepare(`INSERT INTO work_preparation_notice VALUES (1,?)
      ON CONFLICT(id) DO UPDATE SET version=excluded.version`).run(NOTICE_VERSION);
  }

  #input(workId: string, background: boolean) {
    if (this.#closed) return null;
    const work = this.core.getWork(workId);
    const row = this.core.definitions.db.prepare("SELECT * FROM work_preparation WHERE work_id=?").get(workId);
    if (!work || work.instance.status !== "OPEN" || row?.identity !== this.#identity() ||
      background && (!work.activeBinding || hasPendingSourceChecks(work.sourceArchive) || /^(pending|waiting):/.test(work.activeBinding.conversationId))) return null;
    const pkg = buildWorkPackage(work, this.core.definitions);
    const materials = packageMaterialVersions(pkg);
    const basis = buildContinuationBasis(work, materials);
    return { work, materials, digest: hash(basis), attempted: row.attempt_digest,
      cached: pkg.continuation?.resolution !== "UNRESOLVED" && pkg.continuation &&
        continuationBasisMatches(work, materials, pkg.continuation.basis) ? pkg.continuation : undefined };
  }

  schedule(workId: string, immediate = false): void {
    if (this.#closed || !this.client?.continuation || this.#pending.has(workId)) return;
    let input;
    try { input = this.#input(workId, true); } catch { return; }
    if (!input || input.cached || input.attempted === input.digest) { this.cancel(workId); return; }
    if (this.#timers.get(workId)?.digest === input.digest) return;
    this.cancel(workId);
    const timer = setTimeout(() => {
      this.#timers.delete(workId);
      void this.#run(workId, true).catch(() => {});
    }, immediate ? 0 : this.delayMs);
    timer.unref();
    this.#timers.set(workId, { digest: input.digest, timer });
  }

  status(workId: string): "RUNNING" | "QUEUED" | undefined {
    return this.#pending.has(workId) ? "RUNNING" : this.#timers.has(workId) ? "QUEUED" : undefined;
  }

  async ensure(workId: string): Promise<ContinuationSnapshot> {
    this.enable(workId);
    this.cancel(workId);
    const pending = this.#pending.get(workId);
    if (pending) {
      const result = await pending;
      const current = this.#input(workId, false);
      if (current?.cached) return current.cached;
      // A handoff waits for the existing attempt, retrying only if its source changed.
      if (current && current.attempted === current.digest) return result;
    }
    return this.#run(workId, false);
  }

  #run(workId: string, background: boolean): Promise<ContinuationSnapshot> {
    const pending = this.#pending.get(workId);
    if (pending) return pending;
    const task = this.#prepare(workId, background).finally(() => {
      this.#pending.delete(workId);
      if (!this.#closed) this.schedule(workId);
    });
    this.#pending.set(workId, task);
    return task;
  }

  async #prepare(workId: string, background: boolean): Promise<ContinuationSnapshot> {
    const initial = this.#input(workId, background);
    if (!initial) throw new Error("WORK_NOT_OPEN: 工作或服务已改变");
    if (initial.cached) return initial.cached;
    if (!this.client?.continuation) return this.continuations.prepareContinuation(workId);
    const identity = this.#identity(), bindingId = initial.work.activeBinding?.id;
    const authorize = () => {
      const current = this.#input(workId, background);
      if (!current || this.#identity() !== identity || current.work.activeBinding?.id !== bindingId)
        throw new Error("CONTINUATION_SCOPE_CHANGED: 工作或服务已改变");
      return current;
    };
    const attempted = (digest: string) => this.core.definitions.db.prepare(
      "UPDATE work_preparation SET attempt_digest=? WHERE work_id=?").run(digest, workId);
    // Reading a temporarily unavailable source does not spend a model attempt.
    let generated = false;
    const result = await this.continuations.prepareContinuation(workId, {
      generate: input => {
        authorize();
        generated = true;
        attempted(hash(input.basis));
        return this.client!.continuation!({ schemaVersion: 1, input }, () => {
          const current = authorize();
          if (!continuationBasisMatches(current.work, current.materials, input.basis))
            throw new Error("CONTINUATION_SCOPE_CHANGED: 记录已变化");
        });
      },
    });
    const current = authorize();
    // Oversize input is also stable: do not retry it on every poll or restart.
    if (!generated) attempted(hash(result.basis));
    if (continuationBasisMatches(current.work, current.materials, result.basis))
      this.core.createHandoffPackage(workId, { continuation: result });
    return result;
  }

  cancel(workId: string): void {
    const entry = this.#timers.get(workId);
    if (entry) clearTimeout(entry.timer);
    this.#timers.delete(workId);
  }

  close(): void {
    this.#closed = true;
    for (const workId of this.#timers.keys()) this.cancel(workId);
  }
}
