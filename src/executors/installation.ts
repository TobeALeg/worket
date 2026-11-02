import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { getCodexBinaryCandidates } from "../adapters/codex/app-server-client.js";

const applications: Record<string, { names: string[]; protocols: string[] }> = {
  codex: { names: ["Codex", "ChatGPT"], protocols: ["codex://"] },
  workbuddy: { names: ["WorkBuddy"], protocols: ["workbuddy://"] },
  zcode: { names: ["ZCode"], protocols: ["zcode://"] },
  antigravity: { names: ["Antigravity"], protocols: ["antigravity://"] },
};

// Only missing paths mean absence. Permission and filesystem failures remain errors.
export async function installationPathExists(path: string): Promise<boolean> {
  try { await stat(path); return true; }
  catch (error) {
    if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return false;
    throw error;
  }
}

export async function desktopExecutorInstalled(
  id: string,
  applicationForProtocol?: (url: string) => Promise<string | null>,
): Promise<boolean> {
  const application = applications[id];
  if (!application) return true;
  // Protocol lookup also covers custom install locations and Windows Store apps.
  for (const protocol of application.protocols) {
    const path = await applicationForProtocol?.(protocol);
    if (path && await installationPathExists(path)) return true;
  }
  const paths = process.platform === "darwin"
    ? ["/Applications", join(homedir(), "Applications")].flatMap(root =>
        application.names.map(name => join(root, `${name}.app`)))
    : [process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs") : "",
        process.env.LOCALAPPDATA ?? "", process.env.ProgramFiles ?? "", process.env["ProgramFiles(x86)"] ?? ""]
        .filter(isAbsolute).flatMap(root => application.names.flatMap(name =>
          [join(root, name, `${name}.exe`), join(root, name.toLowerCase(), `${name}.exe`)]));
  // A desktop-managed App Server is also sufficient installation evidence.
  if (id === "codex") paths.push(...getCodexBinaryCandidates());
  for (const path of paths) if (await installationPathExists(path)) return true;
  return false;
}
