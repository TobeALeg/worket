import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export async function readBridgeConfig() {
  const path = process.env.WORKPET_BRIDGE_CONFIG || join(homedir(), ".workpet", "bridge.json");
  const parsed = JSON.parse(await readFile(path, "utf8"));
  if (parsed.host !== "127.0.0.1" || !Number.isInteger(parsed.port) || typeof parsed.token !== "string") {
    throw new Error("Worket bridge 配置无效");
  }
  return parsed;
}

export async function postToWorkPet(path, body, timeoutMs = 60_000) {
  const config = await readBridgeConfig();
  let response;
  try {
    response = await fetch(`http://${config.host}:${config.port}${path}`, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "Content-Type": "application/json", "X-WorkPet-Token": config.token },
    body: JSON.stringify(body)
    });
  } catch (error) {
    const code = error?.cause?.code;
    throw new Error(`Worket bridge 请求失败${code ? `（${code}）` : ""}：${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  if (!response.ok) throw new Error(`Worket bridge 返回 HTTP ${response.status}`);
  if (response.status === 204) return null;
  return response.json();
}
