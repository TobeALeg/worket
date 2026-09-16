import { postToWorkPet } from "../workbuddy-marketplace/plugins/workpet/bridge/config.mjs";

const [executor, event] = process.argv.slice(2);
try {
  if (!["zcode", "antigravity"].includes(executor)) throw new Error("Unknown executor");
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error("Hook payload too large");
    chunks.push(chunk);
  }
  const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const payload = {
    session_id: executor === "zcode" ? input.session_id : input.conversationId,
    hook_event_name: executor === "zcode" ? event : "ConversationUpdated",
    ...(executor === "zcode" && event === "UserPromptSubmit" && typeof input.prompt === "string"
      ? { prompt: input.prompt } : {}),
  };
  await Promise.race([
    postToWorkPet(`/hooks/${executor}`, payload),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Worket hook timeout")), 3500).unref()),
  ]);
} catch {
  // Notification failure must never block a model or change its permissions.
  process.stderr.write("Worket 暂未收到会话通知；已有记录将由轮询同步。\n");
}
process.stdout.write("{}\n");
process.exit(0);
