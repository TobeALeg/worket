import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron } from "playwright";

const root = process.cwd();
const output = join(root, "output", "playwright");
await mkdir(output, { recursive: true });
const testDirectory = await mkdtemp(join(tmpdir(), "workpet-ui-qa-"));
const packagedExecutable = process.env.WORKPET_EXECUTABLE_PATH;

const electronApp = await electron.launch({
  executablePath: packagedExecutable ?? join(root, "node_modules", "electron", "dist", "Electron.app", "Contents", "MacOS", "Electron"),
  args: packagedExecutable
    ? [`--user-data-dir=${testDirectory}`, "--dev"]
    : [".", `--user-data-dir=${testDirectory}`],
  cwd: root,
  env: {
    ...process.env, WORKPET_SKIP_INTEGRATIONS: "1",
    WORKPET_BRIDGE_CONFIG: join(testDirectory, "bridge.json"),
    WORKPET_DATA_DIR: testDirectory
  }
});

try {
  await new Promise((resolve) => setTimeout(resolve, 700));
  const pages = electronApp.windows();
  const pet = pages.find((page) => page.url().endsWith("/pet.html"));
  const panel = pages.find((page) => page.url().endsWith("/panel.html"));
  if (!pet || !panel) throw new Error(`窗口不完整：${pages.map((page) => page.url()).join(", ")}`);
  const appIdentity = await electronApp.evaluate(({ app }) => ({
    name: app.getName(),
    executable: process.execPath.split(/[\\/]/u).at(-1)
  }));
  if (appIdentity.name !== "Worket") {
    throw new Error(`应用显示名称错误：期望 Worket，实际 ${appIdentity.name}`);
  }
  if (packagedExecutable && appIdentity.executable !== "Worket") {
    throw new Error(`打包程序仍以 ${appIdentity.executable} 运行，macOS 会显示错误的应用名`);
  }
  const updateMenu = await electronApp.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()?.items[0]?.submenu?.items.some(item => item.label === "检查更新…")
  );
  if (!updateMenu) throw new Error("应用菜单缺少检查更新入口");
  const dockVisible = await electronApp.evaluate(({ app }) =>
    process.platform !== "darwin" || Boolean(app.dock?.isVisible())
  );
  if (!dockVisible) throw new Error("Worket 已启动但 Dock 图标被隐藏，用户无法确认程序正在运行");
  await electronApp.evaluate(({ app }) => app.emit("second-instance", {}, [], process.cwd()));
  await panel.waitForTimeout(100);
  const secondInstanceRestored = await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().some((window) => window.webContents.getURL().endsWith("/panel.html") && window.isVisible())
  );
  if (!secondInstanceRestored) throw new Error("再次双击 Worket 时没有把已有窗口带回前台");
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().endsWith("/panel.html"))?.hide()
  );

  await pet.screenshot({ path: join(output, "01-pet.png") });
  const petMetrics = await pet.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    body: document.querySelector("#pet-body")?.getBoundingClientRect().toJSON(),
    paper: document.querySelector("#paper-action")?.getBoundingClientRect().toJSON(),
    bubble: document.querySelector("#context-bubble")?.getBoundingClientRect().toJSON(),
    bodyShadow: document.querySelector("#pet-body") ? getComputedStyle(document.querySelector("#pet-body")).boxShadow : null
  }));
  const shadowInsets = petMetrics.body
    ? {
        right: petMetrics.width - petMetrics.body.right,
        bottom: petMetrics.height - petMetrics.body.bottom
      }
    : null;
  const minimumShadowInsets = { right: 32, bottom: 34 };
  if (!shadowInsets || shadowInsets.right < minimumShadowInsets.right || shadowInsets.bottom < minimumShadowInsets.bottom) {
    throw new Error(`桌宠阴影安全区不足，窗口边缘会裁切阴影：${JSON.stringify({ shadowInsets, bodyShadow: petMetrics.bodyShadow })}`);
  }
  // Check the real polling path before staging individual visual states.
  const pollingRetainsSprite = await pet.evaluate(async () => {
    const sprite = document.querySelector("#pet-visual svg");
    await new Promise(resolve => setTimeout(resolve, 2200));
    return Boolean(sprite) && sprite === document.querySelector("#pet-visual svg");
  });
  if (!pollingRetainsSprite) throw new Error("两秒状态轮询重建了角色，会反复触发提示动画");
  const characterVisuals = await pet.evaluate(async () => {
    const { createPetVisual } = await import("./pet-visual.js");
    const host = document.querySelector("#pet-visual");
    const render = createPetVisual(host);
    const states = ["sleeping", "awake", "waiting", "carrying", "alert", "distilling-running", "distilling-ready", "distilling-failed"];
    const updates = ["none", "available", "receiving", "ready"];
    const results = [];
    for (const docked of [false, true]) for (const state of states) for (const update of updates) {
      render(state, docked, update);
      const svg = host.querySelector("svg");
      const before = svg;
      const beforeLight = host.querySelector(".bud-status");
      render(state, docked, update);
      results.push({ state, docked, update,
        eyes: host.querySelectorAll(".awake-eyes").length,
        color: host.querySelector(".bud-status")?.getAttribute("data-color") ?? null,
        waves: host.querySelectorAll(".update-wave").length,
        width: Number(svg.getAttribute("width")), height: Number(svg.getAttribute("height")),
        retained: before === host.querySelector("svg") && beforeLight === host.querySelector(".bud-status"),
        base: svg.querySelector(":scope > image").getAttribute("href"),
      });
    }
    return { states: results, statusDotCount: document.querySelectorAll(".status-dot").length };
  });
  const colors = { sleeping: null, awake: "#55d59b", waiting: "#ffae58", carrying: "#76baff", alert: "#ff7969",
    "distilling-running": "#b294f6", "distilling-ready": "#c1fff1", "distilling-failed": "#ff7969" };
  for (const visual of characterVisuals.states) {
    if (visual.color !== colors[visual.state] || visual.eyes !== (visual.state === "sleeping" ? 0 : 1)
      || visual.waves !== (visual.update === "none" ? 0 : visual.update === "available" ? 1 : 2)
      || !visual.retained || visual.base !== "pet-assets/clay-poses-v2.png"
      || (visual.docked && (visual.width !== 32 || visual.height > 68))) {
      throw new Error(`啾啾状态色、眼神、更新提示或原尺寸错误：${JSON.stringify(visual)}`);
    }
  }
  if (characterVisuals.statusDotCount) throw new Error("旧状态圆点未清理");
  // Controlled PetView fixtures exercise the production renderer and polling, without recording any chat.
  await electronApp.evaluate(({ ipcMain }) => {
    const read = ipcMain._invokeHandlers.get("pet:get-view");
    ipcMain.removeHandler("pet:get-view");
    ipcMain.handle("pet:get-view", async (...args) => ({ ...await read(...args), ...globalThis.petVisualFixture }));
  });
  const appearanceOutput = join(root, "output", "pet-appearance", "native");
  await mkdir(appearanceOutput, { recursive: true });
  async function stage(state, updateState = "none") {
    await electronApp.evaluate((_, { state, updateState }) => {
      globalThis.petVisualFixture = {
        currentConversation: null, updateState,
        petState: state.startsWith("distilling-") ? "awake" : state,
        distillation: state.startsWith("distilling-") ? { jobId: "visual-qa", state: state.slice(11),
          label: "沉淀状态验收", detail: "受控界面状态", activeCount: 1 } : null,
      };
    }, { state, updateState });
    await pet.reload();
    await pet.waitForSelector(`#pet-visual[data-state="${state}"][data-update="${updateState}"] svg`);
    await pet.evaluate(async () => {
      const urls = new Set([...document.querySelectorAll("#pet-visual image")].map(node => node.getAttribute("href")));
      await Promise.all([...urls].map(src => { const img = new Image(); img.src = src; return img.decode(); }));
    });
  }
  for (const state of Object.keys(colors)) {
    await stage(state);
    await pet.locator("#pet").screenshot({ path: join(appearanceOutput, `${state}-free.png`) });
  }
  for (const update of ["available", "receiving", "ready"]) {
    await stage("awake", update);
    await pet.locator("#pet").screenshot({ path: join(appearanceOutput, `update-${update}.png`) });
  }
  await stage("distilling-ready");
  const noticeSettles = await pet.evaluate(async () => {
    const sprite = document.querySelector("#pet-visual svg");
    await new Promise(resolve => setTimeout(resolve, 4500));
    return sprite === document.querySelector("#pet-visual svg")
      && !document.querySelector("#pet-visual").getAnimations({ subtree: true }).some(animation => animation.playState === "running");
  });
  if (!noticeSettles) throw new Error("待审阅提示未停下或被轮询重播");
  await pet.locator("#pet-body").hover({ position: { x: 24, y: 45 } });
  await pet.waitForTimeout(220);
  const expandedPaper = await pet.locator("#paper-action").boundingBox();
  if (!expandedPaper || expandedPaper.width !== 43) throw new Error("便利贴没有展开独立操作入口");
  await pet.locator("#paper-action").click();
  const paperOpensPanel = await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith("/panel.html")).isVisible());
  if (!paperOpensPanel) throw new Error("点击便利贴没有打开审阅面板");
  await electronApp.evaluate(({ BrowserWindow }) => {
    globalThis.petVisualFixture = {};
    BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith("/panel.html")).hide();
  });
  await pet.reload();
  await pet.waitForSelector("#pet-visual svg");
  if (!petMetrics.body || !petMetrics.paper || petMetrics.body.width <= petMetrics.body.height || petMetrics.paper.x < petMetrics.body.x + petMetrics.body.width * .55) {
    throw new Error(`桌宠轮廓或便利贴位置没有对齐 Logo：${JSON.stringify(petMetrics)}`);
  }
  await pet.locator("#pet-body").click();
  await panel.waitForTimeout(250);
  const panelVisible = await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().some((window) => window.webContents.getURL().endsWith("/panel.html") && window.isVisible())
  );
  if (!panelVisible) throw new Error("点击桌宠后侧栏没有显示");

  await panel.screenshot({ path: join(output, "02-panel-empty.png") });
  const panelMetrics = await panel.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    clientWidth: document.documentElement.clientWidth,
    clientHeight: document.documentElement.clientHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    filters: document.querySelector(".filters")?.getBoundingClientRect().toJSON()
  }));
  const editableControlCount = await panel.locator("textarea[data-item-id], [data-remove-item]").count();
  if (editableControlCount) throw new Error("Work State 面板仍暴露编辑或删除控件");

  console.log(JSON.stringify({
    passed: true,
    dockVisible,
    secondInstanceRestored,
    petMetrics,
    shadowInsets,
    characterVisuals: { combinations: characterVisuals.states.length, statusDotCount: characterVisuals.statusDotCount },
    pollingRetainsSprite, noticeSettles, paperOpensPanel,
    panelMetrics,
    editableControlCount,
    screenshots: ["01-pet.png", "02-panel-empty.png"]
  }, null, 2));
} finally {
  await electronApp.close();
}
