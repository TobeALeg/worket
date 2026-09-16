import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { readConfig, writeConfig } from "../../integrations/json-config.js";
import { object } from "../local-history.js";

export async function installZCodeIntegration(appPath: string, root = join(homedir(), ".zcode")): Promise<string> {
  await access(root); // Do not create configuration for an uninstalled executor.
  const path = join(root, "cli/config.json"), config = await readConfig(path);
  const before = JSON.stringify(config), mcp = object(config.mcp), hooks = object(config.hooks);
  const events = object(hooks.events);
  // Native MCP entries shadow .agents fallback as a whole. Preserve that fallback.
  const fallback = await readConfig(join(root, "..", ".agents/mcp.json"));
  const native = object(mcp.servers);
  mcp.servers = { ...(Object.keys(native).length ? {} : object(fallback.mcpServers)), ...native,
    worket: { command: "node", args: [join(appPath, "integrations/workbuddy-marketplace/plugins/workpet/bridge/mcp-proxy.mjs")] } };
  const proxy = join(appPath, "integrations/executor-hooks/hook-proxy.mjs");
  for (const event of ["UserPromptSubmit", "Stop"]) {
    const entries = Array.isArray(events[event]) ? events[event] as unknown[] : [];
    events[event] = [...entries.filter(entry => object(entry).worket !== true), {
      worket: true, hooks: [{ type: "process", command: "node", args: [proxy, "zcode", event], timeoutMs: 5000 }],
    }];
  }
  // Preserve an explicit global opt-out rather than re-enable unrelated hooks.
  config.hooks = { ...hooks, enabled: hooks.enabled ?? true, events };
  config.mcp = mcp;
  if (JSON.stringify(config) !== before) await writeConfig(path, config);
  return hooks.enabled === false ? "MCP 已安装；ZCode Hooks 已被用户禁用，需启用后自动确认交接" : before === JSON.stringify(config) ? "already-installed" : "installed";
}
