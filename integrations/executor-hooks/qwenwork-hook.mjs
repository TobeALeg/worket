import { postToWorkPet } from "../workbuddy-marketplace/plugins/workpet/bridge/config.mjs";
try {
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) { size += chunk.length; if (size > 1_000_000) throw new Error("payload too large"); chunks.push(chunk); }
  const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (input.hook_event_name === "UserPromptSubmit" && typeof input.session_id === "string" && typeof input.prompt === "string")
    await postToWorkPet("/hooks/qwenwork", { hook_event_name: "UserPromptSubmit", session_id: input.session_id, prompt: input.prompt }, 2500);
} catch { process.stderr.write("Worket 未收到有限事件；不阻断工作。\n"); }
process.stdout.write("{}\n"); process.exit(0);
