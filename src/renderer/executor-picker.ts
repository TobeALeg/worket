import { WORK_PREPARATION_NOTICE } from "../ui-contract.js";

const logos: Record<string, string> = {
  codex: "codex.png",
  workbuddy: "workbuddy.png",
  zcode: "zcode.png",
  antigravity: "antigravity.png",
};

export async function chooseExecutor(): Promise<string | null> {
  const dialog = document.createElement("dialog");
  dialog.innerHTML =
    '<form method="dialog" class="dialog-card"><h2 id="executor-picker-title">交接给执行者</h2><p class="field-help" data-preparation-notice hidden></p><div class="executor-options"></div><p class="notice" hidden></p><div class="dialog-actions"><button class="secondary" value="cancel">取消</button></div></form>';
  dialog.setAttribute("aria-labelledby", "executor-picker-title");
  document.body.append(dialog);
  const list = dialog.querySelector(".executor-options")!;
  const message = dialog.querySelector<HTMLParagraphElement>(".notice")!;
  let selected: string | null = null;
  const result = new Promise<string | null>((resolve) =>
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
    const [executors, disclosure] = await Promise.all([window.workpet.listExecutors(), window.workpet.distillation("recordingNotice")]);
    const notice = dialog.querySelector<HTMLElement>("[data-preparation-notice]")!;
    notice.textContent = WORK_PREPARATION_NOTICE;
    notice.hidden = disclosure.preparationRequired === false;
    if (!dialog.open) return result;
    for (const executor of executors) {
      const option = document.createElement("div");
      option.className = "executor-option-wrap";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "executor-option";
      button.setAttribute("aria-label", executor.name);
      button.title = executor.name;
      button.disabled = !executor.canDeliver;
      const icon = document.createElement("span");
      icon.className = "executor-option-icon";
      if (logos[executor.id]) {
        const image = document.createElement("img");
        image.src = `./executor-logos/${logos[executor.id]}`;
        image.alt = "";
        icon.append(image);
      } else {
        const mark = document.createElement("span");
        mark.textContent = executor.mark;
        icon.append(mark);
      }
      const label = document.createElement("span");
      label.className = "executor-option-name";
      label.textContent = executor.name;
      button.append(icon, label);
      button.addEventListener("click", () => {
        selected = executor.id;
        dialog.close();
      });
      option.append(button);
      if (executor.capabilities?.deliveryMode === "INLINE_PACKAGE") {
        const hint = document.createElement("small");
        hint.textContent = "复制工作包 · 手动发送 · 主动导入回流";
        option.append(hint);
      }
      if (executor.deliveryError || executor.error) {
        const error = document.createElement("p");
        error.textContent = `${executor.name}：${executor.deliveryError || (executor.canDeliver ? `历史读取暂不可用；仍可交付。${executor.error}` : executor.error)}`;
        option.append(error);
      }
      list.append(option);
    }
    if (!executors.some((e) => e.canDeliver)) {
      message.hidden = false;
      message.textContent = "当前没有可接收工作的执行者。";
    }
  } catch (error) {
    message.hidden = false;
    message.textContent = String(error);
  }
  return result;
}
