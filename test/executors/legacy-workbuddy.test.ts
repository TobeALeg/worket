import test from "node:test";
import assert from "node:assert/strict";
import { reconcileLegacyEvents } from "../../dist/adapters/workbuddy/legacy-events.js";
import type { SourceEvent } from "../../src/core/types.ts";
import type { NormalizedThread } from "../../src/adapters/types.ts";
test("older WorkBuddy text IDs survive SDK migration without collapsing repeated messages", () => {
  const base = {
    kind: "user.prompt",
    content: "继续",
    timestamp: "2026-09-09T00:00:00Z",
  };
  const archive = [
    { ...base, externalId: "workbuddy:chat:old1:text:0", sequence: 1 },
    { ...base, externalId: "workbuddy:chat:old2:text:0", sequence: 2 },
  ] as SourceEvent[];
  const thread = {
    threadId: "chat",
    events: [1, 2, 3].map((i) => ({
      ...base,
      externalId: `workbuddy:chat:req${i}:user:0`,
      id: `new${i}`,
      sequence: i,
    })),
  } as NormalizedThread;
  const result = reconcileLegacyEvents(thread, archive);
  assert.deepEqual(
    result.events.map((e) => e.externalId),
    [
      "workbuddy:chat:old1:text:0",
      "workbuddy:chat:old2:text:0",
      "workbuddy:chat:req3:user:0",
    ],
  );
  assert.equal(thread.events[0]!.id, "new1");
  assert.deepEqual(reconcileLegacyEvents(thread, archive), result);
});
test('legacy aliases retain known presence while streaming, and unknown mappings cannot prove absence', () => {
  const old = { id: 'old', episodeId: 'episode', metadata: {}, externalId: 'workbuddy:chat:old:text:0', kind: 'agent.response', content: 'answer', timestamp: '2026-09-09T00:00:00Z', sequence: 1 } as SourceEvent;
  const nativeId = 'workbuddy:chat:req:assistant:0';
  const live = { threadId: 'chat', events: [], history: { complete: true, observedExternalIds: [nativeId] } } as NormalizedThread;
  assert.equal(reconcileLegacyEvents(live, [old]).history, undefined);
  const mapped = { ...old, id: 'mapped', externalId: 'worket-revision:mapped', metadata: { workbuddyNativeExternalId: nativeId, worketSource: { adapter: 'workbuddy', conversationId: 'chat', externalId: old.externalId } }, sequence: 2 };
  assert.deepEqual(reconcileLegacyEvents(live, [old, mapped]).history!.observedExternalIds, [old.externalId]);
  const changed = { ...live, events: [{ ...old, id: nativeId, externalId: nativeId, content: 'new answer', executorType: 'AGENT', environmentType: 'WORKBUDDY_DESKTOP' }] } as NormalizedThread;
  assert.equal(reconcileLegacyEvents(changed, [old, mapped]).events[0].externalId, old.externalId);
});
