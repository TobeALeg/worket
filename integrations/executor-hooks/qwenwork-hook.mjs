import { readFile, writeFile, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { postToWorkPet } from "../workbuddy-marketplace/plugins/workpet/bridge/config.mjs";
try {
  const arguments_ = process.argv.slice(2);
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index], value = arguments_[index + 1];
    if (!["--bridge-config", "--capture-scope"].includes(key) || !value) throw new Error("Invalid hook arguments");
    process.env[key === "--bridge-config" ? "WORKPET_BRIDGE_CONFIG" : "WORKPET_QWEN_SCOPE"] = value;
  }
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) { size += chunk.length; if (size > 1_000_000) throw new Error("payload too large"); chunks.push(chunk); }
  const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (input.hook_event_name === "UserPromptSubmit" && typeof input.session_id === "string" && typeof input.prompt === "string") {
    const scopePath = process.env.WORKPET_QWEN_SCOPE;
    if (scopePath) {
      const scope = JSON.parse(await readFile(scopePath, "utf8"));
      if (!Array.isArray(scope.sessions) || !Array.isArray(scope.deliveries)) throw new Error("Invalid test scope");
      const initiated = scope.deliveries.some(pair => typeof pair.workId === "string" && typeof pair.deliveryId === "string" &&
        input.prompt.startsWith(`[WORKPET:${pair.workId}]\n[DELIVERY:${pair.deliveryId}]`));
      if (!scope.sessions.includes(input.session_id) && !initiated) { process.stdout.write("{}\n"); process.exit(0); }
      if (initiated && !scope.sessions.includes(input.session_id)) {
        scope.sessions.push(input.session_id); const temporary = `${scopePath}.${randomUUID()}.tmp`;
        await writeFile(temporary, JSON.stringify(scope), { mode: 0o600 }); await rename(temporary, scopePath);
      }
    }
    await postToWorkPet("/hooks/qwenwork", { hook_event_name: "UserPromptSubmit", session_id: input.session_id, prompt: input.prompt }, 2500);
  }
} catch { process.stderr.write("Worket 未收到有限事件；不阻断工作。\n"); }
process.stdout.write("{}\n"); process.exit(0);
