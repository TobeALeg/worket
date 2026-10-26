import { deliveryMarkers, isInlineDelivery } from "../executors/delivery-markers.js";
import { createHash } from "node:crypto";
import type { DeliveryRequest } from "../executors/types.js";
import type { DatabaseSync } from "node:sqlite";
import type { NormalizedSourceEvent } from "../adapters/types.js";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
/** Digest identifies transported evidence; pending requests preserve exact bytes for reopening. */
export class DeliveryLedger {
  constructor(readonly db: DatabaseSync) {
    db.exec("CREATE TABLE IF NOT EXISTS connector_deliveries (delivery_id TEXT PRIMARY KEY, work_id TEXT NOT NULL, prompt_hash TEXT NOT NULL)");
    db.exec("CREATE TABLE IF NOT EXISTS connector_reopen_requests (delivery_id TEXT PRIMARY KEY REFERENCES handoff_packages(id) ON DELETE CASCADE, work_id TEXT NOT NULL REFERENCES work_instances(id) ON DELETE CASCADE, request_json TEXT NOT NULL)");
  }
  saveRequest(request: DeliveryRequest): void {
    this.db.prepare("INSERT INTO connector_reopen_requests VALUES (?,?,?)").run(request.deliveryId, request.workId, JSON.stringify(request));
  }
  request(workId: string, deliveryId: string): DeliveryRequest | null {
    const row = this.db.prepare("SELECT request_json FROM connector_reopen_requests WHERE work_id=? AND delivery_id=?").get(workId, deliveryId);
    if (!row) return null;
    const request = JSON.parse(String(row.request_json)) as DeliveryRequest;
    const digest = this.db.prepare("SELECT prompt_hash FROM connector_deliveries WHERE work_id=? AND delivery_id=?").get(workId, deliveryId);
    if (request.workId !== workId || request.deliveryId !== deliveryId || digest?.prompt_hash !== hash(request.prompt)) throw new Error("原交付内容校验失败，未重新打开。");
    return request;
  }
  forgetRequest(workId: string): void {
    this.db.prepare("DELETE FROM connector_reopen_requests WHERE work_id=?").run(workId);
  }
  record(workId: string, deliveryId: string, prompt: string): void {
    this.db.prepare("INSERT INTO connector_deliveries VALUES (?,?,?) ON CONFLICT(delivery_id) DO UPDATE SET prompt_hash=excluded.prompt_hash")
      .run(deliveryId, workId, hash(prompt));
  }
  annotate(workId: string, events: NormalizedSourceEvent[]): NormalizedSourceEvent[] {
    return events.map(event => {
      if (event.kind !== "user.prompt") return event;
      const match = deliveryMarkers(event.content);
      if (!match || match.workId !== workId) return event;
      const row = this.db.prepare("SELECT prompt_hash FROM connector_deliveries WHERE delivery_id=? AND work_id=?").get(match.deliveryId, workId);
      return row?.prompt_hash === hash(event.content)
        ? { ...event, metadata: { ...event.metadata, worketDelivery: { verified: true, deliveryId: match.deliveryId, inline: isInlineDelivery(event.content) } } }
        : event;
    });
  }
}
