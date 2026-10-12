import { deliveryMarkers } from "../executors/delivery-markers.js";
import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { NormalizedSourceEvent } from "../adapters/types.js";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
/** Persist only a digest to distinguish Worket's own transported bootstrap from new user evidence. */
export class DeliveryLedger {
  constructor(readonly db: DatabaseSync) {
    db.exec("CREATE TABLE IF NOT EXISTS connector_deliveries (delivery_id TEXT PRIMARY KEY, work_id TEXT NOT NULL, prompt_hash TEXT NOT NULL)");
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
        ? { ...event, metadata: { ...event.metadata, worketDelivery: { verified: true, deliveryId: match.deliveryId } } }
        : event;
    });
  }
}
