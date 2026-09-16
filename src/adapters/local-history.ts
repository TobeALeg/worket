import { DatabaseSync } from "node:sqlite";
import type { NormalizedSourceEvent } from "./types.js";
import type { SourceEventKind } from "../core/types.js";

export function readDatabase<T>(path: string, read: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    db.exec("PRAGMA busy_timeout=1000; BEGIN");
    return read(db);
  } finally { db.close(); }
}

export function pageOffset(cursor?: string): number {
  if (cursor !== undefined && !/^\d{1,9}$/.test(cursor))
    throw new Error("历史分页游标无效");
  return Number(cursor ?? 0);
}

export function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

export function historyEvent(
  adapter: string, threadId: string, sourceId: string, sequence: number,
  kind: SourceEventKind, content: string, timestamp: string,
  metadata: Record<string, unknown> = {},
): NormalizedSourceEvent {
  const id = `${adapter}:${threadId}:${sourceId}`;
  return {
    id, externalId: id, sequence, kind, content, timestamp,
    executorType: kind === "user.prompt" ? "HUMAN" : "AGENT",
    environmentType: `${adapter.toUpperCase()}_DESKTOP`, metadata,
  };
}
