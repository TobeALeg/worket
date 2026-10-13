import { createInterface } from "node:readline";

import { postToWorkPet } from "./config.mjs";

const lines = createInterface({ input: process.stdin });
for await (const line of lines) {
  if (!line.trim()) continue;
  let message;
  try {
    message = JSON.parse(line);
    const response = await postToWorkPet("/mcp", message);
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  } catch (error) {
    // Notifications have no response. Failed requests still retain their correlation ID.
    if (typeof message?.method === "string" && !Object.hasOwn(message, "id")) continue;
    process.stdout.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: message?.id ?? null,
      error: { code: -32603, message: error instanceof Error ? error.message : String(error) }
    })}\n`);
  }
}
