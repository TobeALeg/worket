import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { readConfig, writeConfig } from "../../integrations/json-config.js";
import { integrationNodeCommand } from "../../integrations/node-command.js";
/** Explicit opt-in only. Preserve unrelated hooks and opt-outs. MCP setup stays user-visible. */
export async function installQwenWorkIntegration(appPath: string, root = join(homedir(), ".qwenwork")): Promise<string> {
  await access(root);
  const path = join(root, "settings.json"), config = await readConfig(path);
  const hooks = config.hooks && typeof config.hooks === "object" ? config.hooks as Record<string, unknown> : {};
  const node = await integrationNodeCommand();
  const proxy = join(appPath, "integrations/executor-hooks/qwenwork-hook.mjs");
  const quote = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
  const command = `${quote(node)} ${quote(proxy)}`;
  const entries = Array.isArray(hooks.UserPromptSubmit) ? hooks.UserPromptSubmit : [];
  hooks.UserPromptSubmit = [...entries.filter(entry => !JSON.stringify(entry).includes("/integrations/executor-hooks/qwenwork-hook.mjs")), { hooks: [{ type: "command", command, timeout: 5 }] }];
  config.hooks = hooks;
  await writeConfig(path, config);
  return "有限用户提交 Hook 已配置；请重启 QwenWork。MCP 需在应用连接器设置中显式添加 stdio proxy。";
}
