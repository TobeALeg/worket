import { randomUUID } from 'node:crypto';
import { ensure, LIMITS } from '../contracts/definition.js';
import { hash } from '../definitions/storage.js';
import type { DistillationService, Job, Snapshot } from './service.js';

export const CONTINUOUS_CONSENT = 'worket-continuous-v1';
export const CONTINUOUS_IDLE_MS = 120_000;
export const CONTINUOUS_DAILY_LIMIT = 3;
export type AutomaticComparison = { definitionKey: string; generation: string; destination: string };
type Subscription = AutomaticComparison & {
  enabled: boolean;
  excluded: string[];
  observed: string;
  observedAt: number;
  attempted: string[];
  attemptsAt: number[];
  error?: string;
  lastJobId?: string;
};
const pending = new Set(['PREPARED', 'SUBMITTED', 'RUNNING', 'AWAITING_REVIEW', 'NEEDS_SELECTION']);
export const eventIdentity = (workId: string, event: { id: string; content?: string | null }) => `${workId}/${event.id}/${hash(event.content ?? '')}`;

// This queue observes existing records. It neither starts recording nor reads new files.
export class ContinuousEvolution {
  busy = false;
  private intents = new Map<string, number>();
  constructor(readonly service: DistillationService, readonly now = Date.now) {
    service.repository.db.exec('CREATE TABLE IF NOT EXISTS continuous_evolution (definition_key TEXT PRIMARY KEY, payload_json TEXT NOT NULL)');
  }
  private read(key: string): Subscription | undefined {
    const row = this.service.repository.db.prepare('SELECT payload_json FROM continuous_evolution WHERE definition_key=?').get(key);
    return row ? JSON.parse(row.payload_json as string) : undefined;
  }
  private save(s: Subscription): void {
    this.service.repository.db.prepare('INSERT INTO continuous_evolution VALUES (?,?) ON CONFLICT(definition_key) DO UPDATE SET payload_json=excluded.payload_json').run(s.definitionKey, JSON.stringify(s));
  }
  private pendingJob(key: string): Job | undefined {
    const ids = new Set(this.service.repository.versions(key).map(d => d.id));
    return this.service.repository.list<Job>('distillation_jobs').find(job => {
      if (!pending.has(job.status)) return false;
      const snapshot = this.service.repository.read<Snapshot>('source_snapshots', job.snapshotId);
      return !!snapshot.baseDefinitionId && ids.has(snapshot.baseDefinitionId);
    });
  }
  status(definitionId: string) {
    const key = this.service.repository.get(definitionId).definitionKey, s = this.read(key);
    const job = this.pendingJob(key) ?? (s?.lastJobId ? this.service.repository.list<Job>('distillation_jobs').find(j => j.id === s.lastJobId) : undefined);
    return { enabled: s?.enabled ?? false, consentVersion: CONTINUOUS_CONSENT,
      destinationChanged: !!s?.enabled && s.destination !== this.service.client.improvementIdentity?.(),
      pendingJobId: job?.id, pendingStatus: job?.status, error: s?.error ?? job?.error,
      remaining: CONTINUOUS_DAILY_LIMIT - (s?.attemptsAt.filter(at => at > this.now() - 86_400_000).length ?? 0),
      idleSeconds: CONTINUOUS_IDLE_MS / 1000, dailyLimit: CONTINUOUS_DAILY_LIMIT };
  }
  async set(definitionId: string, enabled: boolean, consentVersion?: unknown) {
    const base = this.service.repository.get(definitionId), previous = this.read(base.definitionKey);
    const intent = (this.intents.get(base.definitionKey) ?? 0) + 1; this.intents.set(base.definitionKey, intent);
    if (!enabled) {
      if (previous) { previous.enabled = false; this.save(previous); }
      return this.status(definitionId);
    }
    ensure(consentVersion === CONTINUOUS_CONSENT, 'CONSENT_REQUIRED');
    const expectedDestination = this.service.client.improvementIdentity?.();
    ensure(expectedDestination, 'AUTH_REQUIRED');
    const capabilities = await this.service.client.capabilities() as { evolutionSchemaVersions?: number[] };
    ensure(!this.service.closed && this.intents.get(base.definitionKey) === intent, 'CONTINUOUS_STOPPED');
    this.service.repository.get(definitionId);
    ensure(capabilities.evolutionSchemaVersions?.includes(1), 'SERVICE_UPGRADE_REQUIRED');
    const destination = this.service.client.improvementIdentity?.();
    ensure(destination === expectedDestination, 'CONTINUOUS_STOPPED', '服务身份已改变，请重新确认发送范围');
    // Repeated enable is idempotent; reauthorization after a destination change is a new scope.
    if (previous?.enabled && previous.destination === destination) return this.status(definitionId);
    const excluded = this.service.core.listWorks().filter(w => w.definition.key === base.definitionKey)
      .flatMap(w => w.sourceArchive.map(e => eventIdentity(w.instance.id, e)));
    this.save({ definitionKey: base.definitionKey, generation: randomUUID(), destination,
      enabled: true, excluded, observed: '', observedAt: this.now(), attempted: previous?.attempted ?? [], attemptsAt: previous?.attemptsAt ?? [] });
    return this.status(definitionId);
  }
  assertAuthorized(authorization: AutomaticComparison): void {
    const s = this.read(authorization.definitionKey);
    ensure(!this.service.closed && s?.enabled && s.generation === authorization.generation && s.destination === authorization.destination && s.destination === this.service.client.improvementIdentity?.(), 'CONTINUOUS_STOPPED', '持续比较已停止或服务身份已改变');
  }
  tick(): void {
    if (this.busy || this.service.closed) return;
    this.busy = true;
    try {
      const rows = this.service.repository.db.prepare('SELECT payload_json FROM continuous_evolution').all();
      for (const row of rows) {
        const s: Subscription = JSON.parse(row.payload_json as string);
        const base = this.service.repository.versions(s.definitionKey)[0];
        if (!base) {
          this.service.repository.db.prepare('DELETE FROM continuous_evolution WHERE definition_key=?').run(s.definitionKey);
          continue;
        }
        if (!s.enabled || s.destination !== this.service.client.improvementIdentity?.() || this.pendingJob(s.definitionKey)) continue;
        const seen = new Set([...s.excluded, ...this.service.repository.evolutionHistory(s.definitionKey).flatMap(h => h.sourceEvents).filter(e => !('deleted' in e)).map(e => `${e.workId}/${e.eventId}/${e.hash}`)]);
        const sources = this.service.core.listWorks().filter(w => w.definition.key === s.definitionKey).map(work => ({
          workId: work.instance.id,
          events: work.sourceArchive.filter(e => e.content?.trim() && ['user.prompt', 'agent.response', 'work.input_provided'].includes(e.kind) && !seen.has(eventIdentity(work.instance.id, e))),
        })).filter(s => s.events.some(e => e.kind === 'user.prompt' || e.kind === 'agent.response'));
        // Batch whole instances; oversized individual histories require an explicit range review.
        const selected = sources.slice(0, LIMITS.maxSources);
        const identities = selected.flatMap(s => s.events.map(e => eventIdentity(s.workId, e))).sort();
        if (!identities.length) continue;
        const fingerprint = hash(identities);
        if (fingerprint !== s.observed) {
          s.observed = fingerprint; s.observedAt = this.now(); delete s.error; this.save(s); continue;
        }
        if (this.now() - s.observedAt < CONTINUOUS_IDLE_MS || s.attempted.includes(fingerprint)) continue;
        s.attemptsAt = s.attemptsAt.filter(at => at > this.now() - 86_400_000);
        if (s.attemptsAt.length >= CONTINUOUS_DAILY_LIMIT) continue;
        // Persist before any asynchronous dispatch; crashes must never create an automatic retry storm.
        s.attempted.push(fingerprint); s.attemptsAt.push(this.now()); this.save(s);
        try {
          this.assertAuthorized(s);
          const snapshot = this.service.prepare({ baseDefinitionId: base.id, workIds: selected.map(s => s.workId), includedFileIds: [] }, new Set(identities));
          const job = this.service.start({ preparationId: snapshot.id, expectedContentHash: snapshot.contentHash, consentVersion: 'worket-data-v1', commandId: randomUUID() },
            { definitionKey: s.definitionKey, generation: s.generation, destination: s.destination });
          s.lastJobId = job.id; this.save(s);
        } catch (error) {
          s.error = error instanceof Error ? error.message : 'COMPARISON_FAILED'; this.save(s);
        }
      }
    } finally { this.busy = false; }
  }
}
