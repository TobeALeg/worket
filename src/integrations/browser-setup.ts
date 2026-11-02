import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

export type BrowserName = "chrome" | "edge";
export interface BrowserSetupStatus {
  directory: string;
  extensionId: string;
  paired: boolean;
  connected: boolean;
  message: string;
}
const HOST = "site.dandi.worket.selected";
const exec = promisify(execFile);
const quote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;
const winQuote = (value: string) => `"${value.replace(/%/g, "%%")}"`;

export class BrowserSetup {
  constructor(readonly options: {
    root: string; home: string; resourceRoot: string; runtime: string; bridgeConfig: string;
    platform?: NodeJS.Platform;
  }) {}
  get directory(): string { return join(this.options.root, "browser-extension"); }
  #browser(browser: string): BrowserName {
    if (browser !== "chrome" && browser !== "edge") throw new Error("请选择 Chrome 或 Edge。");
    return browser;
  }
  #platform() { return this.options.platform ?? process.platform; }
  #hostDirectory(browser: BrowserName): string {
    if (this.#platform() === "darwin") return join(this.options.home, "Library/Application Support",
      browser === "chrome" ? "Google/Chrome" : "Microsoft Edge", "NativeMessagingHosts");
    if (this.#platform() === "win32") return join(this.options.root, "browser-native", browser);
    throw new Error("浏览器插件配对目前支持 macOS 和 Windows。");
  }
  #manifest(browser: BrowserName) { return join(this.#hostDirectory(browser), `${HOST}.json`); }
  async prepare(): Promise<string> {
    await mkdir(this.directory, { recursive: true });
    await cp(join(this.options.resourceRoot, "integrations/browser-extension"), this.directory, { recursive: true });
    return this.directory;
  }
  async pair(browserInput: string, extensionId: string): Promise<BrowserSetupStatus> {
    const browser = this.#browser(browserInput);
    if (!/^[a-p]{32}$/.test(extensionId)) throw new Error("请填写扩展管理页中 32 位的 Worket 扩展 ID。");
    await this.prepare();
    const directory = join(this.options.root, "browser-native", browser);
    await mkdir(directory, { recursive: true });
    await cp(join(this.options.resourceRoot, "integrations"), join(directory, "integrations"), { recursive: true });
    const origin = `chrome-extension://${extensionId}/`;
    await writeFile(join(directory, "integrations/browser-native/pairing.json"), JSON.stringify({ allowed_origins: [origin] }), { mode: 0o600 });
    const script = join(directory, "integrations/browser-native/host.mjs");
    const windows = this.#platform() === "win32";
    const runner = join(directory, windows ? "worket-selected-host.bat" : "worket-selected-host");
    const body = windows
      ? `@echo off\r\nset "ELECTRON_RUN_AS_NODE=1"\r\nset "WORKPET_BRIDGE_CONFIG=${this.options.bridgeConfig.replace(/%/g, "%%")}"\r\n${winQuote(this.options.runtime)} ${winQuote(script)} %*\r\n`
      : `#!/bin/sh\nexport ELECTRON_RUN_AS_NODE=1\nexport WORKPET_BRIDGE_CONFIG=${quote(this.options.bridgeConfig)}\nexec ${quote(this.options.runtime)} ${quote(script)} "$@"\n`;
    await writeFile(runner, body, { mode: 0o700 });
    await mkdir(this.#hostDirectory(browser), { recursive: true });
    const manifest = this.#manifest(browser);
    await writeFile(manifest, JSON.stringify({ name: HOST, description: "Worket browser connection", path: runner, type: "stdio", allowed_origins: [origin] }, null, 2), { mode: 0o600 });
    if (windows) await exec("reg.exe", ["ADD", `HKCU\\Software\\${browser === "chrome" ? "Google\\Chrome" : "Microsoft\\Edge"}\\NativeMessagingHosts\\${HOST}`, "/ve", "/t", "REG_SZ", "/d", manifest, "/f"], { windowsHide: true });
    return this.status(browser);
  }
  async status(browserInput: string): Promise<BrowserSetupStatus> {
    const browser = this.#browser(browserInput);
    const result: BrowserSetupStatus = { directory: this.directory, extensionId: "", paired: false, connected: false, message: "尚未配对。加载扩展后，复制其 ID 到下方完成配对。" };
    try {
      const manifest = JSON.parse(await readFile(this.#manifest(browser), "utf8"));
      const origin = manifest.allowed_origins?.[0];
      const match = typeof origin === "string" && origin.match(/^chrome-extension:\/\/([a-p]{32})\/$/);
      if (!match || typeof manifest.path !== "string") throw new Error("配对信息无效，请重新配对。");
      result.extensionId = match[1]!; result.paired = true;
      // Exercise the actual registered host and framed protocol, not just its files.
      const reply = await new Promise<{ ok?: boolean; connected?: boolean; error?: string }>((resolve, reject) => {
        const child = this.#platform() === "win32"
          ? spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `"${winQuote(manifest.path)} ${winQuote(origin)}"`], { windowsHide: true, windowsVerbatimArguments: true })
          : spawn(manifest.path, [origin], { windowsHide: true });
        const chunks: Buffer[] = []; let total = 0;
        const timer = setTimeout(() => { child.kill(); reject(new Error("连接检查超时，请重新配对。")); }, 6000);
        child.on("error", error => { clearTimeout(timer); reject(error); });
        child.stderr.resume();
        child.stdout.on("data", chunk => { total += chunk.length; if (total > 1_000_004) { child.kill(); return; } chunks.push(chunk); });
        child.on("close", () => {
          clearTimeout(timer);
          const bytes = Buffer.concat(chunks);
          try {
            if (total > 1_000_004 || bytes.length < 4 || bytes.readUInt32LE(0) !== bytes.length - 4) throw new Error("本机连接需更新，请重新配对。");
            resolve(JSON.parse(bytes.subarray(4).toString("utf8")));
          } catch (error) { reject(error); }
        });
        const body = Buffer.from(JSON.stringify({ action: "status" })), header = Buffer.alloc(4);
        header.writeUInt32LE(body.length); child.stdin.on("error", () => {}); child.stdin.end(Buffer.concat([header, body]));
      });
      result.connected = reply.ok === true && reply.connected === true;
      result.message = result.connected ? "本机连接正常。浏览器中仍需保持 Worket 扩展启用。"
        : reply.error === "Only selected-content staging is supported" ? "本机连接版本较旧，请点击“配对 / 修复连接”更新。"
        : (reply.error ?? "本机连接需更新，请重新配对。");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") result.message = error instanceof Error ? error.message : String(error);
      else if (result.paired) result.message = "本机连接文件已移动，请重新配对。";
    }
    return result;
  }
}
