import type { SelectedContent } from "../../connectors/selected-content.js";
/** Official QwenWork event contract only; no guessed transcript/assistant fields. */
export function normalizeQwenWorkHook(payload: Record<string, unknown>): SelectedContent | null {
  if (payload.hook_event_name !== "UserPromptSubmit" || typeof payload.session_id !== "string" || typeof payload.prompt !== "string") return null;
  return { schemaVersion: 1, adapterId: "qwenwork", conversationId: payload.session_id, title: "QwenWork 有限事件",
    url: "", scope: "HOOK_EVENTS", messages: [{ role: "user", content: payload.prompt }] };
}
