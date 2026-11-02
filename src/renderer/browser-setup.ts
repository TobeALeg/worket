import type { BrowserSetupStatus } from "../integrations/browser-setup.js";

export async function openBrowserSetup(): Promise<void> {
  if (document.querySelector("#browser-setup-dialog")) return;
  const dialog = document.createElement("dialog");
  dialog.id = "browser-setup-dialog";
  dialog.innerHTML = `<form method="dialog" class="dialog-card">
    <h2>浏览器插件</h2>
    <label>浏览器<select data-browser><option value="chrome">Chrome</option><option value="edge">Edge</option></select></label>
    <ol><li>打开扩展管理页，开启开发者模式。</li><li>选择“加载已解压的扩展程序”，加载下面的插件文件夹。</li><li>复制 Worket 扩展卡片上的 ID，粘贴到下方并配对。</li></ol>
    <label>扩展管理地址<input data-url readonly value="chrome://extensions/"></label>
    <div class="dialog-actions"><button type="button" data-open class="secondary">打开扩展管理页</button><button type="button" data-folder class="secondary">打开插件文件夹</button><button type="button" data-path class="secondary">复制文件夹路径</button></div>
    <label>Worket 扩展 ID<input data-id autocomplete="off" spellcheck="false" maxlength="32" pattern="[a-p]{32}"></label>
    <p data-status class="notice" role="status">正在检查本机连接…</p>
    <p class="field-help">更新插件后，请在扩展管理页点击 Worket 卡片上的“重新加载”。网页选区导入与工作包、附件填入需要此插件。配对后，在聊天网页点击 Worket 插件；准备交接时，先在 Worket 选择网页执行者。</p>
    <div class="dialog-actions"><button value="close" class="secondary">关闭</button><button type="button" data-check class="secondary">检查连接</button><button type="button" data-pair>配对 / 修复连接</button></div>
  </form>`;
  document.body.append(dialog); dialog.showModal();
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  const browser = dialog.querySelector<HTMLSelectElement>("[data-browser]")!;
  const id = dialog.querySelector<HTMLInputElement>("[data-id]")!;
  const status = dialog.querySelector<HTMLElement>("[data-status]")!;
  let generation = 0;
  const run = async (action: string) => {
    const revision = ++generation;
    const buttons = dialog.querySelectorAll<HTMLButtonElement>('button[type="button"]');
    buttons.forEach(button => button.disabled = true); browser.disabled = true;
    status.textContent = action === "pair" ? "正在配对…" : "正在检查…";
    try {
      const result = await window.workpet.browserSetup(action, { browser: browser.value, extensionId: id.value.trim() }) as BrowserSetupStatus | null;
      if (!dialog.open || revision !== generation) return;
      if (result) {
        status.textContent = result.message;
        if (result.extensionId) id.value = result.extensionId;
      } else status.textContent = action === "open" ? "在浏览器中加载插件，然后将扩展 ID 粘贴到此处。" : "插件文件夹已准备。加载后复制扩展 ID 完成配对。";
    } catch (error) { if (dialog.open && revision === generation) status.textContent = error instanceof Error ? error.message : String(error); }
    finally { if (dialog.open && revision === generation) { buttons.forEach(button => button.disabled = false); browser.disabled = false; } }
  };
  for (const action of ["open", "folder", "path", "check", "pair"])
    dialog.querySelector(`[data-${action}]`)!.addEventListener("click", () => void run(action === "check" ? "status" : action));
  browser.addEventListener("change", () => { dialog.querySelector<HTMLInputElement>("[data-url]")!.value = browser.value === "chrome" ? "chrome://extensions/" : "edge://extensions/"; id.value = ""; void run("status"); });
  await run("status");
}
