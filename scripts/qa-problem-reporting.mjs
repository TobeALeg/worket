import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright";
import { createManagedService } from "../server/managed.mjs";

const root = process.cwd();
const directory = await mkdtemp(join(tmpdir(), "worket-feedback-qa-"));
const data = join(directory, "desktop");
const output = join(root, "output", "playwright", "problem-reporting-main");
await mkdir(output, { recursive: true });
const service = createManagedService({ directory: join(directory, "server") });
await new Promise(resolve => service.server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${service.server.address().port}`;
let uploads = 0;
service.server.on("request", request => {
  if (request.method === "POST" && request.url === "/v1/problem-reports") uploads++;
});
let cookie = "", csrf = "", desktop;
const adminApi = async (path, method = "GET", input) => {
  const response = await fetch(`${base}/admin/api/${path}`, {
    method, headers: { Cookie: cookie, "X-Worket-CSRF": csrf, "Content-Type": "application/json" },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
  assert.equal(response.status, 200, `Admin request failed: ${path}`);
  return { value: await response.json(), headers: response.headers };
};
const executable = process.env.WORKPET_EXECUTABLE_PATH ?? (process.argv.includes("--packaged")
  ? process.platform === "win32"
    ? join(root, "release", "Worket-win32-x64", "Worket.exe")
    : join(root, "release", "Worket-darwin-arm64", "Worket.app", "Contents", "MacOS", "Worket")
  : process.platform === "win32"
    ? join(root, "node_modules", "electron", "dist", "electron.exe")
    : join(root, "node_modules", "electron", "dist", "Electron.app", "Contents", "MacOS", "Electron"));
async function launch() {
  desktop = await electron.launch({
    executablePath: executable,
    args: [...(process.argv.includes("--packaged") || process.env.WORKPET_EXECUTABLE_PATH ? [] : ["."]), "--dev", `--user-data-dir=${data}`],
    cwd: root,
    env: { ...process.env, WORKPET_SKIP_INTEGRATIONS: "1", WORKPET_DATA_DIR: data, WORKPET_BRIDGE_CONFIG: join(directory, "bridge.json") },
  });
  await assert.doesNotReject(async () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const panel = desktop.windows().find(page => page.url().endsWith("/panel.html"));
      if (panel) {
        await panel.locator("#tab-open").waitFor({ state: "attached" });
        await desktop.evaluate(({ BrowserWindow }) => {
          for (const window of BrowserWindow.getAllWindows()) if (window.webContents.getURL().endsWith("/panel.html")) window.show();
        });
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error("Panel did not start");
  });
  return desktop.windows().find(page => page.url().endsWith("/panel.html"));
}
async function openFeedback(panel) {
  await panel.locator("[data-feedback-open]:visible").click();
  await panel.locator("#feedback-description").waitFor();
}
const errors = [];
try {
  const setup = await adminApi("setup", "POST", { password: "synthetic-feedback-password" });
  cookie = setup.headers.get("set-cookie").split(";")[0]; csrf = setup.value.csrf;
  const client = (await adminApi("clients", "POST", { name: "Synthetic desktop QA", days: 1 })).value;
  let panel = await launch();
  panel.on("pageerror", error => errors.push(error.message));
  await panel.evaluate(input => window.workpet.configureWorketService(input), { url: base, token: client.token });
  assert.equal(await panel.locator("[data-feedback-open]:visible").count(), 1);
  await openFeedback(panel);
  assert.equal(await panel.locator("#feedback-consent").isChecked(), false);
  const description = "Windows 主线反馈闭环：合成测试，不含真实工作内容";
  await panel.locator("#feedback-description").fill(description);
  await panel.locator("#feedback-consent").check();
  await panel.locator('[data-fb="capture"]').click();
  await panel.locator("#feedback-image-preview[open]").waitFor();
  assert.equal(await panel.locator("#feedback-dialog[open]").count(), 0);
  await panel.locator("[data-capture-use]").click();
  await panel.locator("#feedback-image-preview[open]").waitFor({ state: "hidden" });
  assert.equal(await panel.locator("#feedback-dialog[open]").count(), 0);
  assert.equal(uploads, 0, "Drafts and screenshots must not upload before submit");
  await openFeedback(panel);
  const saved = await panel.evaluate(() => window.workpet.feedback("draft"));
  assert.equal(saved.description, description); assert.equal(saved.screenshots.length, 1);
  assert.equal(saved.consent, true);
  await panel.screenshot({ path: join(output, "feedback-draft.png") });
  await desktop.close(); desktop = undefined;
  panel = await launch();
  panel.on("pageerror", error => errors.push(error.message));
  assert.equal(await panel.locator("#feedback-dialog[open]").count(), 0);
  await openFeedback(panel);
  const restored = await panel.evaluate(() => window.workpet.feedback("draft"));
  assert.deepEqual(restored, saved, "Restart must preserve the original image, consent and frozen log range");
  assert.equal(uploads, 0);
  await panel.locator('[data-fb="send"]').click();
  await panel.getByRole("heading", { name: "反馈已收到" }).waitFor();
  const items = (await adminApi("problem-reports")).value.items;
  assert.equal(items.length, 1); assert.equal(uploads, 1);
  const item = items[0], path = `problem-reports/${item.subject}/${item.reportId}`;
  const received = (await adminApi(path)).value;
  assert.equal(received.report.description, description);
  assert.equal(received.report.environment.platform, process.platform);
  assert.equal(received.report.screenshots.length, 1);
  assert.deepEqual(received.report.diagnostics, saved.diagnostics);
  const [cookieName, ...cookieValue] = cookie.split("=");
  await desktop.context().addCookies([{ name: cookieName, value: cookieValue.join("="), url: base }]);
  const adminWindow = desktop.waitForEvent("window");
  await desktop.evaluate(({ BrowserWindow }, url) => {
    const window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
    void window.loadURL(url);
  }, `${base}/admin/`);
  const inbox = await adminWindow;
  inbox.on("pageerror", error => errors.push(error.message));
  await inbox.locator('[data-tab="reports"]').click();
  await inbox.locator("#reports-list button").click();
  await inbox.locator("#report-state").selectOption("已解决");
  await inbox.locator("#report-note").fill("PRIVATE_SYNTHETIC_NOTE");
  await inbox.locator("#report-public-note").fill("合成问题已检查");
  await inbox.locator("#save-report").click();
  await inbox.getByText("处理进展已保存", { exact: true }).waitFor();
  await inbox.screenshot({ path: join(output, "admin-inbox.png") });
  await panel.locator('[data-fb="refresh-detail"]').click();
  await panel.getByText("合成问题已检查", { exact: true }).waitFor();
  assert.equal(await panel.getByText("PRIVATE_SYNTHETIC_NOTE").count(), 0);
  const user = await panel.evaluate(id => window.workpet.feedback("remote-detail", id), item.reportId);
  assert.equal(user.note, undefined); assert.equal(user.state, "已解决");
  await panel.locator('[data-fb="delete"]').click();
  await panel.locator(".fb-confirm [data-confirm]").click();
  await panel.locator(".fb-confirm[open]").waitFor({ state: "hidden" });
  assert.equal((await adminApi("problem-reports")).value.items.length, 0);
  await desktop.close(); desktop = undefined;
  const names = (await readdir(join(data, "diagnostics"))).filter(name => name.endsWith(".jsonl"));
  const logs = (await Promise.all(names.map(name => readFile(join(data, "diagnostics", name), "utf8")))).join("");
  assert.ok(names.length); assert.ok(logs.includes('"action":"app"'));
  assert.equal(logs.includes(client.token), false); assert.equal(logs.includes(description), false);
  assert.deepEqual(errors, []);
  console.log("PASS: packaged feedback, real window capture, silent draft restart, receipt, private admin UI, user status and deletion; no production traffic");
} finally {
  await desktop?.close();
  await service.close();
  assert.ok(resolve(directory).startsWith(join(resolve(tmpdir()), "worket-feedback-qa-")));
  await rm(directory, { recursive: true, force: true });
}
