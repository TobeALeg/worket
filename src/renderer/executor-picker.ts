export async function chooseExecutor(): Promise<{ executorId: string; organize: boolean } | null> {
  const dialog = document.createElement("dialog");
  dialog.innerHTML =
    '<form method="dialog" class="dialog-card"><h2 id="executor-picker-title">交接给执行者</h2><label class="checkbox-row"><input type="checkbox" name="organize">先整理当前记录</label><p class="field-help">勾选后将本次可见记录、要求与材料版本发给 Worket 服务；不上传附件正文，不授权后续自动上传。</p><div class="executor-options"></div><p class="notice" hidden></p><div class="dialog-actions"><button class="secondary" value="cancel">取消</button></div></form>';
  dialog.setAttribute("aria-labelledby", "executor-picker-title");
  document.body.append(dialog);
  const list = dialog.querySelector(".executor-options")!;
  const message = dialog.querySelector<HTMLParagraphElement>(".notice")!;
  let selected: { executorId: string; organize: boolean } | null = null;
  const result = new Promise<{ executorId: string; organize: boolean } | null>((resolve) =>
    dialog.addEventListener(
      "close",
      () => {
        dialog.remove();
        resolve(selected);
      },
      { once: true },
    ),
  );
  dialog.showModal();
  try {
    const executors = await window.workpet.listExecutors();
    if (!dialog.open) return result;
    for (const executor of executors) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary";
      button.textContent = executor.name;
      button.disabled = !executor.available || !executor.canDeliver;
      button.addEventListener("click", () => {
        selected = { executorId: executor.id, organize: dialog.querySelector<HTMLInputElement>('[name="organize"]')!.checked };
        dialog.close();
      });
      list.append(button);
      if (executor.error) {
        const error = document.createElement("p");
        error.textContent = `${executor.name}：${executor.error}`;
        list.append(error);
      }
    }
    if (!executors.some((e) => e.available && e.canDeliver)) {
      message.hidden = false;
      message.textContent = "当前没有可接收工作的执行者。";
    }
  } catch (error) {
    message.hidden = false;
    message.textContent = String(error);
  }
  return result;
}
