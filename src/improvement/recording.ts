import { recordingView } from "./recording-view.js";
import { IMPROVEMENT_POLICY } from "../contracts/improvement.js";
import { randomUUID } from "node:crypto";
import type { WorkCore } from "../core/index.js";
import type { ImprovementCollector } from "./collector.js";

// Enrollment happens only at an explicit recording action, never by scanning old works.
export class RecordingCollection {
  constructor(readonly core: WorkCore, readonly collector: ImprovementCollector) {
    collector.db.exec(`CREATE TABLE IF NOT EXISTS recording_samples (
      sample_id TEXT PRIMARY KEY, work_id TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS recording_samples_work ON recording_samples(work_id);
      CREATE TABLE IF NOT EXISTS recording_views (
        sample_id TEXT PRIMARY KEY, view_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS recording_checkpoints (
        sample_id TEXT PRIMARY KEY, source_row_id INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS recording_notice (
        id INTEGER PRIMARY KEY CHECK(id=1), version TEXT NOT NULL);`);
  }
  noticeRequired(): boolean {
    return this.collector.enabled() && this.collector.db.prepare("SELECT version FROM recording_notice WHERE id=1").get()?.version !== IMPROVEMENT_POLICY.recordingVersion;
  }
  start(workId: string): void {
    if (!this.collector.enabled()) return;
    const work = this.core.getWork(workId);
    if (!work || work.instance.status !== "OPEN" || !work.activeBinding) return;
    const existing = this.collector.db.prepare(`SELECT 1 FROM recording_samples r
      JOIN improvement_subscriptions s ON s.id=r.sample_id
      WHERE r.work_id=? AND s.state='ACTIVE'`).get(workId);
    if (existing) return;
    const id = randomUUID();
    const title = work.sourceArchive.find(e => e.kind === "conversation.title")?.content?.slice(0, 200) || "工作对话";
    // A crash before enrollment leaves only an inert ID mapping, never an unscoped upload.
    this.collector.db.prepare("INSERT INTO recording_samples VALUES (?,?)").run(id, workId);
    this.collector.enroll(id, "RECORDING", title, { workId, title });
    // Only a successful explicit recording action acknowledges the visible notice.
    // Browsing, cancellation, opt-out and application startup never dismiss it.
    this.collector.db.prepare("INSERT INTO recording_notice VALUES (1,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version")
      .run(IMPROVEMENT_POLICY.recordingVersion);
    this.collect();
  }
  stop(workId: string): void {
    for (const row of this.collector.db.prepare("SELECT sample_id FROM recording_samples WHERE work_id=?").all(workId)) {
      this.collector.stop(String(row.sample_id));
    }
  }
  collect(): void {
    const rows = this.collector.db.prepare(`SELECT r.sample_id,r.work_id,s.consent,c.source_row_id FROM recording_samples r
      JOIN improvement_subscriptions s ON s.id=r.sample_id
      LEFT JOIN recording_checkpoints c ON c.sample_id=r.sample_id WHERE s.state='ACTIVE'`).all();
    for (const row of rows) {
      const id = String(row.sample_id), workId = String(row.work_id);
      const checkpoint = this.core.sourceCheckpoint(workId);
      const expiresAt = Date.parse(JSON.parse(String(row.consent)).at) + IMPROVEMENT_POLICY.retentionDays * 86400000;
      // Lifecycle and consent are checked even when the archive has not changed.
      if (!checkpoint?.recording || expiresAt <= Date.now()) {
        this.collector.stop(id);
        continue;
      }
      if (row.source_row_id === checkpoint.rowId) continue;
      const work = this.core.getWork(workId)!;
      const previous = this.collector.db.prepare("SELECT view_json FROM recording_views WHERE sample_id=?").get(id);
      const baseline = previous ? JSON.parse(String(previous.view_json)) as import('../contracts/recording-view.js').RecordingView : undefined;
      const old = new Map(baseline?.entries.map(entry => [entry.sourceEventId, JSON.stringify(entry)]) ?? []);
      for (const event of work.sourceArchive) {
        // A saved view proves all pieces of this immutable source were queued first.
        if (old.has(event.id) || !["user.prompt", "agent.response"].includes(event.kind) || !event.content?.trim()) continue;
        const parts = Math.ceil(event.content.length / 16000);
        for (let part = 0; part < parts; part++) {
          this.collector.record(id, `${event.id}-${part}`, "MESSAGE", {
            sourceEventId: event.id, sequence: event.sequence, kind: event.kind,
            timestamp: event.timestamp, content: event.content.slice(part * 16000, (part + 1) * 16000),
            part, parts,
          });
        }
      }
      const view = recordingView(work.sourceArchive);
      const changed = view.entries.filter(entry => old.get(entry.sourceEventId) !== JSON.stringify(entry));
      const saveCheckpoint = () => this.collector.db.prepare(`INSERT INTO recording_checkpoints VALUES (?,?)
        ON CONFLICT(sample_id) DO UPDATE SET source_row_id=excluded.source_row_id`).run(id, checkpoint.rowId);
      if (baseline && !changed.length) { saveCheckpoint(); continue; }
      // Source ordinals are not an append cursor: a late message may reuse an older ordinal.
      if (baseline) view.sequence = Math.max(view.sequence, baseline.sequence + 1);
      const wire = baseline ? { sequence: view.sequence, baseSequence: baseline.sequence, entries: changed } : view;
      // View, outbox and scan checkpoint commit together. Partial message queues safely replay.
      this.collector.record(id, `view-${view.sequence}`, "RECORDING_VIEW", wire, () => {
        this.collector.db.prepare("INSERT INTO recording_views VALUES (?,?) ON CONFLICT(sample_id) DO UPDATE SET view_json=excluded.view_json").run(id, JSON.stringify(view));
        saveCheckpoint();
      });
    }
  }
}
