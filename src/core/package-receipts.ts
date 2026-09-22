import type { DatabaseSync } from 'node:sqlite';
import type { CaptureBinding } from './types.js';

type Receipt = { binding_id: string; delivery_id: string; read_at: string | null };
/** Read evidence belongs to one delivery, not to the lifetime of a work. */
export class PackageReceipts {
  constructor(private readonly db: DatabaseSync) {
    db.exec(`CREATE TABLE IF NOT EXISTS work_package_receipts (
      binding_id TEXT PRIMARY KEY REFERENCES capture_bindings_v2(id) ON DELETE CASCADE,
      delivery_id TEXT NOT NULL REFERENCES handoff_packages(id) ON DELETE CASCADE,
      read_at TEXT
    ) STRICT`);
    // Upgrade an outstanding pre-receipt delivery without accepting its old global read flag.
    db.exec(`INSERT OR IGNORE INTO work_package_receipts (binding_id, delivery_id)
      SELECT binding.id, handoff.id FROM capture_bindings_v2 binding JOIN handoff_packages handoff
      ON binding.conversation_id='pending:' || handoff.id AND binding.work_instance_id=handoff.work_instance_id
      WHERE binding.status='ACTIVE'`);
  }
  register(binding: CaptureBinding): void {
    if (!binding.conversationId.startsWith('pending:')) return;
    this.db.prepare(`INSERT OR IGNORE INTO work_package_receipts (binding_id, delivery_id)
      SELECT ?, id FROM handoff_packages WHERE id=? AND work_instance_id=?`)
      .run(binding.id, binding.conversationId.slice(8), binding.workInstanceId);
  }
  find(binding: CaptureBinding | null): Receipt | null {
    if (!binding) return null;
    const exact = this.db.prepare('SELECT * FROM work_package_receipts WHERE binding_id=?').get(binding.id) as Receipt | undefined;
    if (exact) return exact; // A new delivery always wins, including an unread one.
    if (/^(pending|waiting):/.test(binding.conversationId)) return null;
    // Cancel/launch rollback or resume restores the same actual conversation in a new binding.
    return this.db.prepare(`SELECT receipt.* FROM work_package_receipts receipt
      JOIN capture_bindings_v2 source ON source.id=receipt.binding_id
      WHERE source.work_instance_id=? AND source.adapter=? AND source.conversation_id=?
      ORDER BY source.rowid DESC LIMIT 1`).get(binding.workInstanceId, binding.adapter, binding.conversationId) as Receipt | undefined ?? null;
  }
  record(binding: CaptureBinding | null, deliveryId: string, at: string): boolean {
    const receipt = this.find(binding);
    if (!receipt || receipt.delivery_id !== deliveryId) return false;
    this.db.prepare('UPDATE work_package_receipts SET read_at=? WHERE binding_id=? AND delivery_id=?').run(at, receipt.binding_id, deliveryId);
    return true;
  }
}
