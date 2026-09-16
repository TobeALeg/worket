import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { readConfig, writeConfig } from "../../integrations/json-config.js";
import { object } from "../local-history.js";
import { integrationNodeCommand } from "../../integrations/node-command.js";

const quote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;

export async function installAntigravityIntegration(appPath: string, gemini = join(homedir(), ".gemini")): Promise<string> {
  await access(join(gemini, "antigravity"));
  const node = await integrationNodeCommand();
  const mcpPath = join(gemini, "config/mcp_config.json"), hooksPath = join(gemini, "config/hooks.json");
  const mcp = await readConfig(mcpPath), hooks = await readConfig(hooksPath);
  const beforeMcp = JSON.stringify(mcp), beforeHooks = JSON.stringify(hooks);
  const previous = object(hooks["worket-capture"]);
  mcp.mcpServers = { ...object(mcp.mcpServers), worket: { command: node, args: [join(appPath, "integrations/workbuddy-marketplace/plugins/workpet/bridge/mcp-proxy.mjs")] } };
  const proxy = join(appPath, "integrations/executor-hooks/hook-proxy.mjs");
  hooks["worket-capture"] = { enabled: previous.enabled ?? true,
    ...Object.fromEntries(["PreInvocation", "PostInvocation", "Stop"].map(event => [event, [
      { type: "command", command: `${quote(node)} ${quote(proxy)} antigravity ${event}`, timeout: 5 },
    ]])),
  };
  if (JSON.stringify(mcp) !== beforeMcp) await writeConfig(mcpPath, mcp);
  if (JSON.stringify(hooks) !== beforeHooks) await writeConfig(hooksPath, hooks);
  return beforeMcp === JSON.stringify(mcp) && beforeHooks === JSON.stringify(hooks) ? "already-installed" : "installed";
}
