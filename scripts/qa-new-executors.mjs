// Real local history UI, isolated Worket database, no model calls or uploads.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright";

const directory = await mkdtemp(join(tmpdir(), "worket-executors-ui-"));
const output = resolve("output/playwright/executors");
await mkdir(output, { recursive: true });
const app = await electron.launch({
  executablePath: resolve("release/Worket-darwin-arm64/Worket.app/Contents/MacOS/Worket"),
  args: [`--user-data-dir=${directory}`, "--dev"],
  env: { ...process.env, WORKPET_SKIP_INTEGRATIONS: "1", WORKPET_DATA_DIR: directory, WORKPET_BRIDGE_CONFIG: join(directory, "bridge.json") },
});
try {
  let panel;
  for (let i = 0; i < 40 && !panel; i++) {
    panel = app.windows().find(page => page.url().endsWith("/panel.html"));
    if (!panel) await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(panel, "panel window exists");
  await panel.waitForLoadState("domcontentloaded");
  const executors = await panel.evaluate(() => window.workpet.listExecutors());
  for (const id of ["zcode", "antigravity"]) {
    const item = executors.find(e => e.id === id);
    assert.ok(item?.available && item.canDeliver, `${id} available`);
  }
  await panel.locator("#tab-recent").click();
  await panel.locator("#record-history").click();
  await panel.locator("#history-executor option[value='antigravity']").waitFor({ state: "attached" });
  const counts = {};
  for (const id of ["zcode", "antigravity"]) {
    await panel.locator("#history-executor").selectOption(id);
    await panel.waitForFunction(() => !document.querySelector("#history-executor").disabled);
    await panel.locator("#history-sources .source-row").first().waitFor();
    counts[id] = await panel.locator("#history-sources .source-row").count();
    assert.ok(counts[id] > 0);
    assert.ok(await panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await panel.screenshot({ path: join(output, `${id}-history.png`) });
  }
  await panel.locator("#history-close").click();
  // Exercise the production picker against the real registry without delivering data.
  await panel.evaluate(() => { void import("./executor-picker.js").then(m => m.chooseExecutor()); });
  for (const name of ["ZCode", "Antigravity"]) {
    await panel.getByRole("button", { name, exact: true }).waitFor();
    assert.equal(await panel.getByRole("button", { name, exact: true }).isEnabled(), true);
  }
  await panel.screenshot({ path: join(output, "executor-picker.png") });
  await panel.keyboard.press("Escape");
  const report = { packaged: true, realLocalHistory: true, counts, modelCalls: false, uploaded: false };
  await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await app.close(); }
