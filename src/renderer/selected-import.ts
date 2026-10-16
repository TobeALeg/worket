import { SELECTED_IMPORT_CONNECTORS } from "../connectors/catalog.js";
import type { SelectedContent } from "../connectors/selected-content.js";
import type { DashboardView } from "../ui-contract.js";
export function setupSelectedImport(onRecorded: (value: DashboardView) => void): void {
  const button = document.createElement("button");
  button.id = "import-selected";
  button.className = "source-import";
  button.type = "button";
  button.title = "导入选定内容";
  button.setAttribute("aria-label", button.title);
  const icon = document.createElement("span");
  icon.className = "source-icon";
  const logo = document.createElement("img");
  logo.src = "./executor-logos/chrome.png";
  logo.alt = "";
  icon.append(logo);
  button.append(icon);
  document.querySelector(".source-actions")!.append(button);
  button.addEventListener("click", () => void open());
  async function open() {
    const dialog = document.createElement("dialog");
    dialog.innerHTML = '<form method="dialog" class="dialog-card"><h2>导入选定内容</h2><p class="field-help">只保存你选择的可见正文。未加载历史、回复分支和附件正文未包含。此操作不上传到工作服务；后续交接或分析另沿既有范围说明。</p><label>连接器<select data-site></select></label><label>来源地址（桌面选定正文可不填）<input data-url type="url" required></label><label>实际会话标识（同一聊天重复使用）<input data-conversation required></label><label>标题<input data-title maxlength="512"></label><label>消息角色<select data-role><option value="user">用户</option><option value="assistant">助手</option></select></label><label>选定正文（可编辑、脱敏）<textarea data-text rows="6"></textarea></label><details data-advanced><summary>结构化多条消息</summary><label><input type="checkbox" data-json-mode>使用消息 JSON</label><textarea data-messages rows="6" spellcheck="false" aria-label="消息 JSON"></textarea></details><label>未导入的附件名称（一行一个）<textarea data-attachments rows="2"></textarea></label><div class="dialog-actions"><button type="button" data-file class="secondary">选择 JSON 文件</button><button type="button" data-inbox class="secondary">待确认箱</button></div><div data-inbox-list></div><pre data-preview hidden style="white-space:pre-wrap;max-height:240px;overflow:auto"></pre><p data-error class="notice" hidden></p><div class="dialog-actions"><button type="button" data-cancel class="secondary">取消</button><button type="button" data-preview-button class="secondary">预览</button><button type="button" data-confirm disabled>确认导入</button></div></form>';
    document.body.append(dialog); dialog.showModal(); dialog.addEventListener("close", () => dialog.remove(), { once: true });
    const element = <T extends HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!;
    element<HTMLButtonElement>("[data-cancel]").addEventListener("click", () => dialog.close());
    const site = element<HTMLSelectElement>("[data-site]"), url = element<HTMLInputElement>("[data-url]"), conversation = element<HTMLInputElement>("[data-conversation]"), title = element<HTMLInputElement>("[data-title]"), messages = element<HTMLTextAreaElement>("[data-messages]"), attachments = element<HTMLTextAreaElement>("[data-attachments]");
    for (const item of SELECTED_IMPORT_CONNECTORS) { const option = document.createElement("option"); option.value = item.id; option.textContent = item.name; site.append(option); }
    const jsonMode = element<HTMLInputElement>("[data-json-mode]"), role = element<HTMLSelectElement>("[data-role]"), text = element<HTMLTextAreaElement>("[data-text]");
    let loadedSingle: SelectedContent["messages"][number] | undefined;
    let reviewed: SelectedContent | null = null, inboxId: string | null = null, busy = false, editRevision = 0;
    const confirm = element<HTMLButtonElement>("[data-confirm]"), preview = element<HTMLPreElement>("[data-preview]"), error = element<HTMLParagraphElement>("[data-error]");
    const fail = (value: unknown) => { error.hidden = !value; error.textContent = value ? String(value) : ""; };
    const invalidate = () => { editRevision++; reviewed = null; confirm.disabled = true; preview.hidden = true; };
    dialog.addEventListener("input", invalidate);
    site.addEventListener("change", async () => {
      const item = SELECTED_IMPORT_CONNECTORS.find(item => item.id === site.value);
      url.value = item?.url ?? ""; url.required = !(item && "desktop" in item); invalidate();
      if (item && "desktop" in item) {
        const revision = editRevision;
        try {
          const dashboard = await window.workpet.getDashboard();
          const binding = dashboard.selectedWork?.bindings.find(value => value.status === "ACTIVE" && value.adapter === item.id && !/^(pending|waiting):/.test(value.conversationId));
          if (binding && dialog.open && revision === editRevision) { conversation.value = binding.conversationId; invalidate(); }
        } catch (e) { fail(e); }
      }
    });
    site.dispatchEvent(new Event("change")); messages.value = JSON.stringify([{ role: "user", content: "" }], null, 2);
    const load = (input: SelectedContent) => { site.value = input.adapterId; url.value = input.url; conversation.value = input.conversationId; title.value = input.title; messages.value = JSON.stringify(input.messages, null, 2); attachments.value = (input.missingAttachments ?? []).join("\n"); loadedSingle = input.messages.length === 1 ? input.messages[0] : undefined; jsonMode.checked = input.messages.length !== 1; element<HTMLDetailsElement>("[data-advanced]").open = jsonMode.checked; role.value = loadedSingle?.role ?? "user"; text.value = loadedSingle?.content ?? ""; invalidate(); };
    element("[data-file]").addEventListener("click", async () => { try { const input = await window.workpet.chooseSelectedImport(); if (input) { inboxId = null; load(input); } } catch (e) { fail(e); } });
    element("[data-inbox]").addEventListener("click", async () => {
      try {
        const list = element("[data-inbox-list]"); list.replaceChildren();
        const items = await window.workpet.listSelectedInbox();
        if (!items.length) list.textContent = "暂无待确认内容（10 分钟过期，重启清空）";
        for (const item of items) {
          const row = document.createElement("div"), read = document.createElement("button"), remove = document.createElement("button");
          read.type = remove.type = "button"; read.className = remove.className = "secondary";
          read.textContent = item.title || item.adapterId; remove.textContent = "丢弃";
          read.addEventListener("click", async () => { try { load(await window.workpet.readSelectedInbox(item.id)); inboxId = item.id; } catch (e) { fail(e); } });
          remove.addEventListener("click", async () => { await window.workpet.removeSelectedInbox(item.id); row.remove(); if (inboxId === item.id) { inboxId = null; invalidate(); } });
          row.append(read, remove); list.append(row);
        }
      } catch (e) { fail(e); }
    });
    element("[data-preview-button]").addEventListener("click", async () => {
      try {
        fail(null); invalidate(); const previewRevision = editRevision;
        const input: SelectedContent = { schemaVersion: 1, adapterId: site.value, url: url.value, conversationId: conversation.value.trim(), title: title.value,
          scope: "SELECTED_CONTENT", messages: jsonMode.checked ? JSON.parse(messages.value) : [{ ...(loadedSingle?.id ? { id: loadedSingle.id } : {}), role: role.value as "user" | "assistant", content: text.value }], missingAttachments: attachments.value.split("\n").map(x => x.trim()).filter(Boolean) };
        const result = await window.workpet.previewSelectedContent(input); if (!dialog.open || previewRevision !== editRevision) return;
        reviewed = input; preview.textContent = `${result.notice}\n\n${result.thread.events.map(event => `[${event.kind}]\n${event.content}`).join("\n\n")}\n\n附件未导入：${input.missingAttachments?.join("、") || "未指定（不能据此推断无附件）"}`;
        preview.hidden = false; confirm.disabled = false;
      } catch (e) { fail(e); }
    });
    confirm.addEventListener("click", async () => {
      if (!reviewed || busy) return; busy = true; confirm.disabled = true;
      try { const result = await window.workpet.importSelectedContent(reviewed); if (inboxId) await window.workpet.removeSelectedInbox(inboxId); dialog.close(); onRecorded(result); }
      catch (e) { fail(e); } finally { busy = false; confirm.disabled = !reviewed; }
    });
  }
}
