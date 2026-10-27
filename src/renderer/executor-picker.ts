import { WORK_PREPARATION_NOTICE } from "../ui-contract.js";

const options: Record<string, { logo: string; name: string; web?: boolean }> = {
  codex: { logo: "codex.png", name: "Codex" },
  workbuddy: { logo: "workbuddy.png", name: "WorkBuddy" },
  zcode: { logo: "zcode.png", name: "ZCode" },
  antigravity: { logo: "antigravity.png", name: "Antigravity" },
  qwenwork: { logo: "qwenwork.png", name: "QwenWork" },
  "qwenwork-web": { logo: "qwenwork.png", name: "QwenWork", web: true },
  "kimi-work": { logo: "kimi.png", name: "Kimi", web: true },
  "doubao-work": { logo: "doubao.png", name: "豆包", web: true },
  "deepseek-web": { logo: "deepseek.ico", name: "DeepSeek", web: true },
  "gemini-web": { logo: "gemini.png", name: "Gemini", web: true },
  "coze-web": { logo: "coze.ico", name: "扣子", web: true },
  "web-selected": { logo: "browser.svg", name: "其他", web: true },
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
      const presentation = options[executor.id];
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
      if (presentation) {
        const image = document.createElement("img");
        image.src = `./executor-logos/${presentation.logo}`;
        image.alt = "";
        if (executor.id === "web-selected") image.className = "executor-generic-icon";
        icon.append(image);
      } else {
        const mark = document.createElement("span");
        mark.textContent = executor.mark;
        icon.append(mark);
      }
      if (presentation?.web) {
        const badge = document.createElement("span");
        badge.className = "executor-web-badge";
        badge.textContent = "网页";
        badge.setAttribute("aria-hidden", "true");
        icon.append(badge);
      }
      const label = document.createElement("span");
      label.className = "executor-option-name";
      label.textContent = presentation?.name ?? executor.name;
      button.append(icon, label);
      button.addEventListener("click", () => {
        selected = executor.id;
        dialog.close();
      });
      option.append(button);
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
