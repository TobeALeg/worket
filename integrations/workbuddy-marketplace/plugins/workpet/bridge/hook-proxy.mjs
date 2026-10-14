import { postToWorkPet } from "./config.mjs";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);

try {
  const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  // WorkBuddy wraps submitted text with system/user-context blocks. Resolve
  // delivery markers from the account-scoped local transcript, not that wrapper.
  // Stop/SessionEnd also retry when UserPromptSubmit precedes the disk write.
  await postToWorkPet("/hooks/workbuddy", {
    session_id: payload.session_id,
    hook_event_name: "ConversationUpdated",
  }, 2500);
  process.stdout.write(JSON.stringify({ continue: true }));
} catch (error) {
  process.stderr.write(`Worket hook 未写入：${error instanceof Error ? error.message : String(error)}\n`);
  process.stdout.write(JSON.stringify({ continue: true }));
}
