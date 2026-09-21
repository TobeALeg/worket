import { errorText, jobError, progressLabel, runningJob, type DistillationActivity } from "../distillation/activity.js";
import { IMPROVEMENT_POLICY } from "../contracts/improvement.js";
import { mountDefinitionReview } from "./definition-review.js";
import type { Definition, Draft } from "../definitions/repository.js";
import type { Job, Snapshot } from "../distillation/service.js";
import type { DashboardView, WorkDetailView } from "../ui-contract.js";
const api = (action: string, input: unknown = {}) =>
  window.workpet.distillation(action, input);
const esc = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
function improvementConsent(scope: "DISTILLATION" | "REUSE", enabled: boolean): string {
  const materials = scope === "DISTILLATION"
    ? "本次所选文本与附件范围、候选原稿、问题、后续保存的修改、确认或取消状态"
    : "本次定义版本、非文件输入及后续逐项验收结果；不采集文件路径、文件正文或新工作对话";
  return `<section class="state-section"><label class="file-choice"><input id="improvement-consent" type="checkbox" ${enabled ? "checked" : ""}>参与改进 Worket</label><p class="consent">保存${materials}，供管理员评审，${IMPROVEMENT_POLICY.retentionDays} 天后删除。</p><details class="policy-details"><summary>采集与退出</summary><p>用于诊断、评测和功能改进，关联来源与版本，不增加模型调用。默认开启，取消后记住选择并停止全部样本后续采集；重新开启仅适用于之后主动开始或恢复的记录及提交范围。</p><p>在“Worket 服务 → 改进数据”可停止采集或删除样本。停止会丢弃待同步反馈，已发送数据需单独删除。</p></details></section>`;
}
const improvementVersion = () => modal.querySelector<HTMLInputElement>("#improvement-consent")?.checked ? IMPROVEMENT_POLICY.version : undefined;
const commandId = () => crypto.randomUUID();
const modal = document.createElement("dialog");
modal.id = "definition-dialog";
modal.setAttribute("aria-labelledby", "definition-title");
document.body.append(modal);
let changed: (dashboard?: DashboardView) => void = () => {};
let preferenceSave: Promise<unknown> = Promise.resolve();
let disposeReview: (() => void) | null = null;
function show(title: string, html: string): void {
  disposeReview?.();
  disposeReview = null;
  modal.removeAttribute("aria-label");
  modal.setAttribute("aria-labelledby", "definition-title");
  modal.innerHTML = `<div class="dialog-card definition-card"><div class="source-heading"><h2 id="definition-title">${esc(title)}</h2><button data-close class="icon-button" aria-label="关闭">×</button></div><div id="definition-error" class="notice" hidden role="alert"></div>${html}</div>`;
  modal
    .querySelector("[data-close]")!
    .addEventListener("click", () => modal.close());
  const preference = modal.querySelector<HTMLInputElement>("#improvement-consent");
  preference?.addEventListener("change", () => {
    const enabled = preference.checked;
    preference.disabled = true;
    preferenceSave = api("setImprovementPreference", { enabled })
      .then(async () => {
        if (preference.hasAttribute("data-refresh-improvement")) await openImprovementData();
      })
      .catch((error) => {
        preference.checked = !enabled;
        const notice = modal.querySelector<HTMLElement>("#definition-error")!;
        notice.hidden = false;
        notice.textContent = `未能保存参与改进设置：${errorText(error)}`;
      })
      .finally(() => { preference.disabled = false; });
  });
  modal.scrollTop = 0;
  if (!modal.open) modal.showModal();
}
function bind(selector: string, action: () => Promise<void>): void {
  modal.querySelector(selector)?.addEventListener("click", (event) => {
    event.preventDefault();
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    void preferenceSave.then(action)
      .catch((error) => {
        const notice = modal.querySelector<HTMLElement>("#definition-error");
        if (notice) {
          notice.hidden = false;
          notice.textContent = errorText(error);
          notice.scrollIntoView({ block: "nearest" });
        }
      })
      .finally(() => {
        button.disabled = false;
      });
  });
}
const value = (selector: string) =>
  (modal.querySelector(selector) as HTMLInputElement).value;
const check = (selector: string) =>
  (modal.querySelector(selector) as HTMLInputElement).checked;
export function setupDistillation(
  onChanged: typeof changed,
  selection: () => string[],
): void {
  changed = onChanged;
  const activityButton = document.querySelector<HTMLButtonElement>("#distillation-activity")!;
  activityButton.onclick = () => { if (activityButton.dataset.job) void openJob(activityButton.dataset.job); };
  window.workpet.onOpenDistillation?.(id => void openJob(id));
  setInterval(() => void refreshActivity().catch(() => {}), 1000);
  void refreshActivity().catch(() => {});
  document
    .querySelector("#distill-selected")!
    .addEventListener(
      "click",
      () =>
        void openPreparation(selection()).catch((error) =>
          window.alert(errorText(error)),
        ),
    );
  document.querySelector("#service-settings")!.addEventListener("click", () => {
    void openServiceSettings().catch(error => window.alert(errorText(error)));
  });
}
async function refreshActivity(): Promise<void> {
  const activity: DistillationActivity | null = await api("activity");
  const button = document.querySelector<HTMLButtonElement>("#distillation-activity")!;
  button.hidden = !activity;
  if (!activity) return;
  button.dataset.job = activity.jobId;
  button.dataset.state = activity.state;
  button.querySelector("[data-activity-label]")!.textContent = activity.label;
  button.querySelector("[data-activity-detail]")!.textContent = activity.detail;
}
async function openServiceSettings(connected = false): Promise<void> {
  const status = await window.workpet.getWorketServiceStatus();
  const account = status.automatic
    ? `<section class="state-section"><h3>Worket 用户</h3><p>${status.userId ? `用户 ${esc(status.userId.slice(0, 8))}` : "首次使用时自动创建"}</p><button id="copy-recovery" ${status.hasRecoveryCode ? "" : "disabled"}>复制恢复码</button><details><summary>在此设备恢复已有用户</summary><p class="consent">恢复后，此设备的模型额度和已授权上传归入同一用户。请把恢复码当作密码保管。</p><label class="field">恢复码<input id="recovery-code" type="password" autocomplete="off"></label><button id="restore-account">恢复用户</button></details></section>`
    : "";
  show("Worket 服务", `<p>${connected ? "已连接" : status.automatic ? "自动连接" : "自定义连接"}</p><p class="consent">${esc(status.url)}</p>${account}<button id="check-service">检查连接</button><button id="improvement-data">改进数据</button><details><summary>高级连接设置</summary><label class="field">服务地址<input id="service-url" type="url" value="${esc(status.url)}"></label><label class="field">Worket 访问令牌<input id="service-token" type="password" autocomplete="off"></label><button id="save-service">保存并检查连接</button></details>`);
  bind("#improvement-data", openImprovementData);
  bind("#check-service", async () => { await api("capabilities"); await openServiceSettings(true); });
  bind("#copy-recovery", async () => {
    await window.workpet.copyWorketRecoveryCode();
    window.alert("恢复码已复制。请像密码一样保管，不要发送给其他人。");
  });
  bind("#restore-account", async () => {
    const recoveryCode = value("#recovery-code").trim();
    if (!recoveryCode) return;
    if (!window.confirm("此设备将切换到恢复码对应的 Worket 用户。继续吗？")) return;
    await window.workpet.restoreWorketAccount(recoveryCode);
    await openServiceSettings(true);
  });
  bind("#save-service", async () => {
    await window.workpet.configureWorketService({ url: value("#service-url"), token: value("#service-token") });
    await api("capabilities");
    await openServiceSettings(true);
  });
}
export async function renderDefinitions(): Promise<void> {
  const panel = document.querySelector<HTMLElement>("#definitions-panel")!;
  const [page, jobs] = await Promise.all([api("definitions"), api("jobs")]);
  panel.innerHTML = `${page.items.length ? page.items.map((d: Definition) => `<button class="work-row" data-definition="${esc(d.id)}"><h3>${esc(d.content.name)}</h3><span class="row-meta">v${d.version} · ${esc(new Date(d.confirmedAt).toLocaleDateString())}</span><p>${esc(d.content.purpose.text)}</p></button>`).join("") : '<p class="empty">暂无已沉淀工作</p>'}${jobs.some((j: Job) => j.status !== "SAVED") ? "<h3>沉淀任务</h3>" : ""}${jobs
    .filter((j: Job) => j.status !== "SAVED")
    .map(
      (j: Job) =>
        `<button class="work-row" data-job="${esc(j.id)}">${esc(j.createdAt.slice(0, 16).replace("T", " "))} · ${esc(jobLabel(j.status))}${j.error ? `<p>${esc(jobError(j.error))}</p>` : ""}</button>`,
    )
    .join("")}`;
  panel
    .querySelectorAll<HTMLElement>("[data-definition]")
    .forEach(
      (b) => (b.onclick = () => void openDefinition(b.dataset.definition!)),
    );
  panel
    .querySelectorAll<HTMLElement>("[data-job]")
    .forEach((b) => (b.onclick = () => void openJob(b.dataset.job!)));
}
function jobLabel(status: string): string {
  return (
    (
      {
        PREPARED: "等待提交",
        SUBMITTED: "正在提交",
        RUNNING: "正在分析",
        AWAITING_REVIEW: "等待检查",
        NEEDS_SELECTION: "请重新选择",
        FAILED: "失败，可重试",
        INTERRUPTED: "请求中断",
        CANCELLED: "已取消",
        SAVED: "已保存",
      } as Record<string, string>
    )[status] ?? status
  );
}
export async function openPreparation(workIds: string[]): Promise<void> {
  if (!workIds.length) throw new Error("请先选择至少一条工作记录");
  let snapshot: Snapshot = await api("prepare", {
    workIds,
    includedFileIds: [],
  });
  async function render() {
    const { enabled } = await api("improvementPreference");
    show(
      "确认沉淀范围",
      `<p class="consent">截至 ${esc(new Date(snapshot.capturedAt).toLocaleString())}</p>${snapshot.sources.map((s) => `<section class="state-section"><h3>${esc(s.title)}</h3><p>${s.events.length} 条记录 · ${s.status === "OPEN" ? "当前快照" : s.status === "COMPLETED" ? "已完成" : "已归档"}</p>${s.files.map((f) => f.content !== undefined ? `<label class="file-choice"><input type="checkbox" data-file-id="${esc(f.id)}" checked> ${esc(f.name)} — 含正文</label>` : f.availability === "MISSING" ? `<label class="file-choice unavailable"><input type="checkbox" data-file-id="${esc(f.id)}" disabled> ${esc(f.name)} — 文件已不可用，仅保留文件信息</label>` : `<label class="file-choice"><input type="checkbox" data-file-id="${esc(f.id)}"> ${esc(f.name)} — ${f.availability === "CHANGED" ? "内容已更新，勾选后重新分析" : "仅文件信息"}</label>`).join("")}</section>`).join("")}<button id="apply-range">更新附件内容范围</button><p class="consent">所选文本与附件将交由 Worket 服务及模型供应商处理。</p><details class="policy-details"><summary>云端处理与留存</summary><p>未勾选改进授权时，后台不持久保存正文；结果内存暂存最多 10 分钟，收取或取消后清除；无正文运行元数据默认保留 30 天。正文可能含敏感信息，ID 替换不代表匿名化。供应商留存以服务公布政策为准。</p></details><label class="file-choice"><input id="consent" type="checkbox">我确认本次范围及云端处理</label>${improvementConsent("DISTILLATION", enabled)}<button id="start-distillation" class="primary">开始沉淀</button>`,
    );
    bind("#apply-range", async () => {
      const ids = [
        ...modal.querySelectorAll<HTMLInputElement>("[data-file-id]:checked"),
      ].map((e) => e.dataset.fileId!);
      snapshot = await api("prepare", { workIds, includedFileIds: ids });
      await render();
    });
    const id = commandId();
    bind("#start-distillation", async () => {
      if (!check("#consent")) throw new Error("请确认本次材料范围及处理说明");
      const selected = [
        ...modal.querySelectorAll<HTMLInputElement>("[data-file-id]:checked"),
      ]
        .map((e) => e.dataset.fileId!)
        .sort();
      const prepared = snapshot.sources
        .flatMap((s) =>
          s.files.filter((f) => f.content !== undefined).map((f) => f.id),
        )
        .sort();
      if (JSON.stringify(selected) !== JSON.stringify(prepared))
        throw new Error("附件选择已变化，请先更新范围");
      await api("start", {
        preparationId: snapshot.id,
        expectedContentHash: snapshot.contentHash,
        consentVersion: "worket-data-v1",
        improvementConsentVersion: improvementVersion(),
        commandId: id,
      });
      modal.close();
      await refreshActivity();
    });
  }
  await render();
}
export async function openJob(id: string): Promise<void> {
  const job: Job = await api("job", { jobId: id });
  if (!runningJob(job.status)) await api("seen", { jobId: id });
  if (job.status === "AWAITING_REVIEW" && job.draftId) {
    await editDraft(await api("draft", { id: job.draftId }));
    return;
  }
  const snapshot: Snapshot = await api("snapshot", { id: job.snapshotId });
  show(
    "沉淀任务",
    `<h3>${runningJob(job.status) ? `<span class="extraction-indicator running" aria-hidden="true"></span> ${esc(progressLabel(job.progress))}` : esc(jobLabel(job.status))}</h3><p>采集截止 ${esc(snapshot.capturedAt)} · 第 ${job.attempt} 次尝试</p>${job.error ? `<p class="notice">${esc(jobError(job.error))}</p>` : ""}${job.result?.groups.map((g) => `<section><p>${esc(g.reason)}</p><button data-group="${esc(g.sourceKeys.join(","))}">选择这一组</button></section>`).join("") ?? ""}<div class="dialog-actions">${runningJob(job.status) ? '<button id="background-job">后台继续</button>' : ""}<button id="refresh-job">检查进度</button>${["FAILED", "INTERRUPTED"].includes(job.status) ? '<button id="retry-job">重试（不采集样本）</button>' : ""}${!["SAVED", "CANCELLED"].includes(job.status) ? '<button id="cancel-job">取消沉淀</button>' : ""}</div>`,
  );
  bind("#background-job", async () => { modal.close(); await refreshActivity(); });
  bind("#refresh-job", () => openJob(id));
  bind("#cancel-job", async () => {
    await api("cancel", { jobId: id });
    await openJob(id);
  });
  bind("#retry-job", async () => {
    await api("retry", {
      jobId: id,
      expectedContentHash: snapshot.contentHash,
      commandId: commandId(),
    });
    modal.close();
    await refreshActivity();
  });
  modal
    .querySelectorAll<HTMLElement>("[data-group]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          void openPreparation(
            snapshot.sources
              .filter((s) => b.dataset.group!.split(",").includes(s.key))
              .map((s) => s.workId),
          )),
    );
  if (["PREPARED", "SUBMITTED", "RUNNING"].includes(job.status)) {
    const token = modal.innerHTML;
    setTimeout(() => {
      if (modal.open && modal.innerHTML === token) void openJob(id);
    }, 2000);
  }
}
const sections = [
  ["inputs", "每次输入"],
  ["deliverables", "交付"],
  ["constraints", "必须遵守的要求"],
  ["acceptanceCriteria", "完成标准"],
  ["methods", "参考方法"],
  ["materialRoles", "固定资料角色"],
] as const;
async function editDraft(draft: Draft): Promise<void> {
  show("检查候选定义", "");
  modal.setAttribute("aria-label", "检查候选定义");
  modal.removeAttribute("aria-labelledby");
  disposeReview = mountDefinitionReview(modal, draft, api, async definition => {
    changed();
    await openDefinition(definition.id);
  });
}
async function openDefinition(id: string): Promise<void> {
  const d: Definition = await api("definition", { id });
  const versions: Definition[] = await api("versions", {
    key: d.definitionKey,
  });
  show(
    d.content.name,
    `<label class="field">固定版本<select id="definition-version">${versions.map((v) => `<option value="${v.id}" ${v.id === id ? "selected" : ""}>v${v.version} · ${esc(new Date(v.confirmedAt).toLocaleDateString("zh-CN"))}</option>`).join("")}</select></label><p>${esc(d.content.purpose.text)}</p>${sections
      .filter(([key]) => key !== "inputs" && d.content[key].length > 0)
      .map(
        ([key, label]) =>
          `<section class="state-section"><h3>${label}</h3>${d.content[key].map((i) => `<p>${esc(i.text)}</p>`).join("")}</section>`,
      )
      .join(
        "",
      )}<details><summary>来源与固定资料</summary>${d.refs.map((ref) => `<p>${esc(ref.workId)} · ${ref.deleted ? "来源已删除" : esc(ref.eventId)}</p>`).join("")}${d.materials.map((m) => `<p>${esc(m.role)} · ${esc(m.originalPath)} · ${esc(m.hash)}</p>`).join("")}</details><div class="dialog-actions"><button id="revise-definition">修改为新版本</button><button id="use-definition" class="primary">使用</button></div><details><summary>更多</summary><label class="field">删除此定义系列，请输入“永久删除”<input id="definition-delete-confirm"></label><button id="delete-definition">删除定义系列</button></details>`,
  );
  modal
    .querySelector("#definition-version")!
    .addEventListener(
      "change",
      () => void openDefinition(value("#definition-version")),
    );
  bind("#use-definition", () => useDefinition(d));
  bind("#revise-definition", async () => {
    await editDraft(
      await api("revise", { definitionId: id, commandId: commandId() }),
    );
  });
  bind("#delete-definition", async () => {
    await api("deleteDefinition", {
      definitionKey: d.definitionKey,
      confirmation: value("#definition-delete-confirm"),
      commandId: commandId(),
    });
    modal.close();
    changed();
  });
}
async function useDefinition(d: Definition): Promise<void> {
  const examples: any[] = await api("examples", { definitionId: d.id });
  const { enabled } = await api("improvementPreference");
  show(
    `使用：${d.content.name}`,
    `<p class="consent">v${d.version}</p>${d.content.inputs.map((i) => `<label class="field">${esc(i.text)} ${i.required ? "*" : ""}${i.valueType === "BOOLEAN" ? `<select data-input="${i.key}"><option value="">请选择</option><option value="true" ${i.defaultValue === true ? "selected" : ""}>是</option><option value="false" ${i.defaultValue === false ? "selected" : ""}>否</option></select>` : i.valueType === "CHOICE" ? `<select data-input="${i.key}"><option value="">请选择</option>${i.choices!.map((c) => `<option ${i.defaultValue === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>` : `<input data-input="${i.key}" type="${i.valueType === "NUMBER" ? "number" : "text"}" value="${esc(i.defaultValue ?? "")}">`}${i.valueType === "FILE" ? `<button data-input-file="${i.key}">选择本次文件</button>` : ""}</label>`).join("")}<section><h3>固定资料</h3>${d.materials.map((m) => `<p>${esc(m.role)} · ${esc(m.originalPath)}</p>`).join("") || "<p>无</p>"}</section><details><summary>参考案例（可选）</summary>${examples.map((a) => `<label class="file-choice"><input type="checkbox" data-example="${esc(a.id)}">${esc(a.filename)}</label>`).join("") || "<p>无可用旧成果</p>"}</details>${improvementConsent("REUSE", enabled)}<button id="create-defined-work" class="primary">创建本次工作</button>`,
  );
  modal.querySelectorAll<HTMLElement>("[data-input-file]").forEach(
    (b) =>
      (b.onclick = () =>
        void window.workpet.chooseDefinitionFile().then((path) => {
          if (path)
            (
              modal.querySelector(
                `[data-input="${b.dataset.inputFile}"]`,
              ) as HTMLInputElement
            ).value = path;
        })),
  );
  const id = commandId();
  bind("#create-defined-work", async () => {
    const inputs: Record<string, string | number | boolean> = {};
    for (const spec of d.content.inputs) {
      const text = value(`[data-input="${spec.key}"]`);
      if (text !== "")
        inputs[spec.key] =
          spec.valueType === "NUMBER"
            ? Number(text)
            : spec.valueType === "BOOLEAN"
              ? text === "true"
              : text;
    }
    const dashboard = await api("create", {
      definitionId: d.id,
      improvementConsentVersion: improvementVersion(),
      inputs,
      referenceExampleIds: [
        ...modal.querySelectorAll<HTMLInputElement>("[data-example]:checked"),
      ].map((e) => e.dataset.example!),
      commandId: id,
    });
    modal.close();
    changed(dashboard);
  });
}
export async function workDefinitionAction(
  work: WorkDetailView,
  action: string,
): Promise<boolean> {
  if (action === "distill") {
    await openPreparation([work.id]);
    return true;
  }
  if (action === "export") {
    const path = await window.workpet.exportWorkPackage(work.id);
    if (path) window.dispatchEvent(new CustomEvent("worket-feedback", { detail: "已导出工作包" }));
    return true;
  }
  if (action === "copy") {
    await window.workpet.copyWorkPackage(work.id);
    window.dispatchEvent(new CustomEvent("worket-feedback", { detail: "已复制工作包" }));
    return true;
  }
  if (action === "complete" && work.reusableDefinitionId) {
    const d: Definition = await api("definition", {
      id: work.reusableDefinitionId,
    });
    let artifacts: any[] = await api("artifacts", { workId: work.id });
    show(
      "验收本次交付",
      `<p class="consent">${esc(d.content.name)} · v${d.version}</p>${d.content.acceptanceCriteria.map((c) => `<label class="field">${esc(c.text)}<select data-criterion="${c.key}"><option value="">请选择</option><option value="PASS">通过</option><option value="NEEDS_REVISION">需要修改</option></select></label>`).join("")}<h3>本次交付物</h3><div id="acceptance-artifacts"></div><button id="attach-output">关联本次交付物</button><button id="accept-output" class="primary">保存验收结果</button>`,
    );
    const renderArtifacts = () => {
      modal.querySelector("#acceptance-artifacts")!.innerHTML = artifacts
        .map(
          (a) =>
            `<label class="file-choice"><input type="checkbox" data-output="${esc(a.id)}">${esc(a.filename)}</label>`,
        )
        .join("");
    };
    renderArtifacts();
    bind("#attach-output", async () => {
      const path = await window.workpet.chooseDefinitionFile();
      if (path) {
        artifacts = await api("attach", { workId: work.id, path });
        renderArtifacts();
      }
    });
    bind("#accept-output", async () => {
      const criteriaResults = Object.fromEntries(
        [...modal.querySelectorAll<HTMLSelectElement>("[data-criterion]")].map(
          (e) => [e.dataset.criterion, e.value],
        ),
      );
      const artifactIds = [
        ...modal.querySelectorAll<HTMLInputElement>("[data-output]:checked"),
      ].map((e) => e.dataset.output);
      changed(
        await api("accept", {
          workId: work.id,
          criteriaResults,
          artifactIds,
          commandId: commandId(),
        }),
      );
      modal.close();
    });
    return true;
  }
  return false;
}

async function openImprovementData(): Promise<void> {
  const samples: any[] = await api("improvementSamples");
  const { enabled } = await api("improvementPreference");
  const labels: Record<string, string> = { ACTIVE: "采集中", STOPPED: "已停止", DELETE_PENDING: "等待删除确认", DELETED: "已删除" };
  show("改进数据", `<label class="file-choice"><input id="improvement-consent" data-refresh-improvement type="checkbox" ${enabled ? "checked" : ""}>参与改进 Worket</label><p class="consent">记录的对话、沉淀材料和复用反馈供管理员评审，保存 90 天。</p><details class="policy-details"><summary>采集范围与留存</summary><p>默认开启，用于产品诊断、质量评测和功能改进。开始记录时保存该聊天已有及后续的用户消息和 AI 回复（不额外读取附件、工具输出或推理摘要），沉淀时保存所选材料、候选及修改，复用时保存定义、非文件输入及验收反馈，供后台管理员查看，保存 90 天。首次记录前展示上传范围，成功记录后不再重复提示；范围说明更新时重新展示。沉淀与复用仍展示各自提交范围。取消后记住选择，并停止全部样本后续采集；重新开启仅适用于此后主动开始或恢复记录、提交的范围。</p></details><div class="dialog-actions"><button id="stop-all-improvement">停止全部后续采集</button><button id="sync-improvement">同步并刷新</button></div><p class="consent">停止采集后，已有样本仍保留，可单独删除。离线删除将在重新连接后完成。</p>${samples.map(s => `<section class="state-section"><h3>${esc(s.label)}</h3><p>${esc(labels[s.state])} · ${esc(s.pending)} 条待同步 · ${esc(JSON.parse(s.consent).at)}</p>${s.error ? `<p class="notice">${esc(s.error)}</p>` : ""}${s.state === "ACTIVE" ? `<button data-stop-sample="${esc(s.id)}">停止此样本采集</button>` : ""}${!["DELETED", "DELETE_PENDING"].includes(s.state) ? `<details><summary>删除后台样本</summary><label class="field">输入“删除样本”<input data-delete-confirm="${esc(s.id)}"></label><button data-delete-sample="${esc(s.id)}">确认删除样本</button></details>` : ""}</section>`).join("") || '<p>暂无改进样本</p>'}`);
  bind("#stop-all-improvement", async () => { await api("stopImprovement"); await openImprovementData(); });
  bind("#sync-improvement", async () => { await api("syncImprovement"); await openImprovementData(); });
  for (const s of samples) {
    bind(`[data-stop-sample="${s.id}"]`, async () => { await api("stopImprovement", { id: s.id }); await openImprovementData(); });
    bind(`[data-delete-sample="${s.id}"]`, async () => { await api("deleteImprovement", { id: s.id, confirmation: value(`[data-delete-confirm="${s.id}"]`) }); await openImprovementData(); });
  }
}
