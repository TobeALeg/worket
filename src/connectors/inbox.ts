import { randomUUID } from "node:crypto";
import { normalizeSelectedContent, type SelectedContent } from "./selected-content.js";
/** Ephemeral, bounded review inbox. Staging is never capture or model authorization. */
export class SelectedContentInbox {
  readonly #items = new Map<string, { input: SelectedContent; expiresAt: number }>();
  constructor(readonly now: () => number = Date.now) {}
  #prune() { for (const [id, item] of this.#items) if (item.expiresAt <= this.now()) this.#items.delete(id); }
  stage(input: SelectedContent): string {
    if (input.scope !== "SELECTED_CONTENT") throw new Error("浏览器只能提交主动选定内容。");
    normalizeSelectedContent(input); this.#prune();
    if (this.#items.size >= 10) throw new Error("待确认内容过多，请先确认或丢弃。");
    const id = randomUUID(); this.#items.set(id, { input: structuredClone(input), expiresAt: this.now() + 10 * 60_000 });
    return id;
  }
  list() { this.#prune(); return [...this.#items].map(([id, item]) => ({ id, title: item.input.title, adapterId: item.input.adapterId, expiresAt: item.expiresAt })); }
  read(id: string): SelectedContent { this.#prune(); const item = this.#items.get(id); if (!item) throw new Error("待确认内容已过期或丢弃。"); return structuredClone(item.input); }
  remove(id: string) { this.#items.delete(id); }
}
