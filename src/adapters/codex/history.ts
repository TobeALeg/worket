import type { CodexThreadPayload } from './normalize.js';

type Turn = CodexThreadPayload['turns'][number];
type Item = Turn['items'][number];
export type HistoryRequest = <T>(method: string, params: Record<string, unknown>) => Promise<T>;
type Page<T> = { data: T[]; nextCursor: string | null };
const PAGE_SIZE = 20, MAX_PAGES = 512, MAX_BYTES = 64 * 1024 * 1024;
function incomplete(message: string): never { throw new Error(`CODEX_HISTORY_INCOMPLETE: ${message}`); }
function checkThread(thread: CodexThreadPayload, id: string): void {
  if (!thread || thread.id !== id || !Array.isArray(thread.turns)) incomplete('来源会话身份或历史格式不一致');
}
function checkTurn(turn: Turn): void {
  if (!turn || typeof turn.id !== 'string' || !Array.isArray(turn.items)) incomplete('回合格式不完整');
}
function checkItem(item: Item): void {
  if (!item || typeof item.id !== 'string' || typeof item.type !== 'string') incomplete('消息缺少稳定标识');
}
function uniqueItems(items: Item[]): Item[] {
  const found = new Map<string, Item>();
  for (const item of items) {
    checkItem(item); const old = found.get(item.id);
    if (old && JSON.stringify(old) !== JSON.stringify(item)) incomplete('分页期间消息发生变化，请重试');
    if (!old) found.set(item.id, item);
  }
  return [...found.values()];
}
/** Load a selected conversation completely before exposing any of its events to recording. */
export async function readCodexHistory(request: HistoryRequest, threadId: string): Promise<CodexThreadPayload> {
  const initial = await request<{ thread: CodexThreadPayload }>('thread/read', { threadId, includeTurns: false });
  checkThread(initial.thread, threadId);
  let bytes = 0, pages = 0;
  const account = (value: unknown) => {
    bytes += Buffer.byteLength(JSON.stringify(value));
    if (bytes > MAX_BYTES || ++pages > MAX_PAGES) incomplete('历史超过单次读取上限，未导入不完整内容');
  };
  async function page<T>(method: string, params: Record<string, unknown>, cursor?: string): Promise<Page<T>> {
    const value = await request<Page<T>>(method, { ...params, ...(cursor ? { cursor } : {}) });
    if (!value || !Array.isArray(value.data) || value.nextCursor !== null && (typeof value.nextCursor !== 'string' || !value.nextCursor)) incomplete('分页响应缺少明确的结束标识');
    if (!value.data.length && value.nextCursor) incomplete('分页未取得内容却仍有后续游标');
    account(value); return value;
  }
  const params = { threadId, limit: PAGE_SIZE, sortDirection: 'asc', itemsView: 'full' };
  let first: Page<Turn>;
  try { first = await page<Turn>('thread/turns/list', params); }
  catch (error) {
    // Only an explicit unsupported-method response permits legacy full-history fallback.
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== -32601) throw error;
    const legacy = await request<{ thread: CodexThreadPayload }>('thread/read', { threadId, includeTurns: true });
    checkThread(legacy.thread, threadId); account(legacy);
    for (const turn of legacy.thread.turns) {
      checkTurn(turn);
      if (turn.itemsView !== undefined && turn.itemsView !== 'full') incomplete('旧接口只返回了摘要，未导入部分历史');
      turn.items = uniqueItems(turn.items);
    }
    return legacy.thread;
  }
  const turns = new Map<string, Turn>(), cursors = new Set<string>();
  let current = first;
  for (;;) {
    for (const raw of current.data) {
      checkTurn(raw);
      const old = turns.get(raw.id);
      if (old) {
        if (JSON.stringify(old) !== JSON.stringify(raw)) incomplete('分页期间回合发生变化，请重试');
        continue;
      }
      // Keep the received turn until pagination is finished, so overlaps compare the same representation.
      turns.set(raw.id, structuredClone(raw));
    }
    if (!current.nextCursor) break;
    if (cursors.has(current.nextCursor)) incomplete('回合分页游标重复');
    cursors.add(current.nextCursor);
    current = await page<Turn>('thread/turns/list', params, current.nextCursor);
  }
  for (const turn of turns.values()) {
    if (turn.itemsView === 'full') { turn.items = uniqueItems(turn.items); continue; }
    if (turn.itemsView !== 'summary' && turn.itemsView !== 'notLoaded') incomplete('分页接口未声明消息完整性');
    const items: Item[] = [], itemCursors = new Set<string>(); let cursor: string | undefined;
    for (;;) {
      const next = await page<{ turnId: string; item: Item }>('thread/items/list', { threadId, turnId: turn.id, limit: 100, sortDirection: 'asc' }, cursor);
      for (const entry of next.data) {
        if (!entry || entry.turnId !== turn.id) incomplete('消息属于其他回合');
        checkItem(entry.item); items.push(entry.item);
      }
      if (!next.nextCursor) break;
      if (itemCursors.has(next.nextCursor)) incomplete('消息分页游标重复');
      itemCursors.add(next.nextCursor); cursor = next.nextCursor;
    }
    turn.items = uniqueItems(items); turn.itemsView = 'full';
  }
  return { ...initial.thread, turns: [...turns.values()] };
}
