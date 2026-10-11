import { execFile } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { promisify } from "node:util";

/** Finder-launched apps do not necessarily inherit the user's Node/nvm PATH. */
export async function integrationNodeCommand(): Promise<string> {
  if (!process.versions.electron) return process.execPath;
  if (process.platform === "win32") {
    const { stdout } = await promisify(execFile)("where.exe", ["node.exe"], { timeout: 5000, windowsHide: true });
    for (const candidate of stdout.trim().split(/\r?\n/u)) {
      if (!isAbsolute(candidate)) continue;
      try { await access(candidate, constants.X_OK); return candidate; } catch { /* Try the next PATH entry. */ }
    }
    throw new Error("找不到 Node.js，无法安装执行者接入。");
  }
  const { stdout } = await promisify(execFile)("/bin/zsh", ["-lc", "command -v node"], { timeout: 5000 });
  const command = stdout.trim().split("\n").at(-1) ?? "";
  if (!isAbsolute(command)) throw new Error("找不到 Node.js，无法安装执行者接入。");
  await access(command, constants.X_OK);
  return command;
}
