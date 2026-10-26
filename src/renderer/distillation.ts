import { showPageHeader } from "./window-header.js";
import { contractDispatchState } from './contract-dispatch.js';
import { chooseExecutor } from './executor-picker.js';
import { contractColor, setContractColor, workContract } from './work-contract.js';
import { publishedFeedback, type ContractFeedback } from '../definitions/contract-view.js';
import { effectiveRules, acceptanceChecks, ruleItems, ruleText } from "../contracts/rules.js";
import { errorText, jobError, progressLabel, runningJob, type DistillationActivity } from "../distillation/activity.js";
import { IMPROVEMENT_POLICY } from "../contracts/improvement.js";
import { contentItems } from '../contracts/evolution.js';
import type { EvolutionReview } from '../definitions/evolution.js';
import { mountDefinitionReview } from "./definition-review.js";
import type { Definition, Draft } from "../definitions/repository.js";
import type { Job, Snapshot } from "../distillation/service.js";
import type { DashboardView, WorkDetailView } from "../ui-contract.js";
const api = (action: string, input: unknown = {}) =>
  window.workpet.distillation(action, input);
let activeWorkIds = new Set<string>();

export function syncWorkDistillationActions(workId: string): void {
  const running = activeWorkIds.has(workId);
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    '#work-detail button[data-action="distill"], #work-detail button[data-action="distill-files"]',
  )) {
    button.dataset.idleLabel ??= button.textContent ?? "沉淀";
    button.disabled = running;
    button.textContent = running ? "沉淀中" : button.dataset.idleLabel;
    if (running) button.setAttribute("aria-label", "该工作已有沉淀任务正在运行");
    else button.removeAttribute("aria-label");
  }
}
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
let contractOrigin: 'work' | 'library' = 'work';
function show(title: string, html: string, actions = "", back?: { label: string; action: () => Promise<void> }): void {
  disposeReview?.();
  disposeReview = null;
  modal.classList.remove('contract-view');
  modal.removeAttribute("aria-label");
  modal.setAttribute("aria-labelledby", "definition-title");
  modal.innerHTML = `<div class="dialog-shell"><div class="window-header-slot"></div><div class="dialog-card definition-card"><h2 id="definition-title">${esc(title)}</h2><div id="definition-error" class="notice" hidden role="alert"></div>${html}</div>${actions ? `<footer class="dialog-actions">${actions}</footer>` : ""}</div>`;
  const returnPage = () => preferenceSave.then(() => back ? back.action() : modal.close());
  modal.oncancel = (event) => { event.preventDefault(); modal.querySelector<HTMLButtonElement>("#window-back")?.click(); };
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
  showPageHeader({ dialog: modal, label: back?.label ?? "返回工作面板", back: returnPage, beforeNavigate: () => preferenceSave.then(() => {}) });
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
  const distillButton = document.querySelector<HTMLButtonElement>("#distill-selected")!;
  distillButton.addEventListener("click", async () => {
    distillButton.disabled = true;
    try { await startDistillation(selection()); }
    catch (error) { window.alert(errorText(error)); }
    finally { distillButton.disabled = selection().length === 0; }
  });
  document.querySelector("#service-settings")!.addEventListener("click", () => {
    void openServiceSettings().catch(error => window.alert(errorText(error)));
  });
}
async function refreshActivity(): Promise<void> {
  const activity: DistillationActivity | null = await api("activity");
  const button = document.querySelector<HTMLButtonElement>("#distillation-activity")!;
  activeWorkIds = new Set(activity?.activeWorkIds ?? []);
  const workId = document.querySelector<HTMLElement>("#work-detail")?.dataset.currentWorkId;
  if (workId) syncWorkDistillationActions(workId);
  button.hidden = !activity;
  if (!activity) return;
  button.dataset.job = activity.jobId;
  button.dataset.state = activity.state;
  button.querySelector("[data-activity-label]")!.textContent = activity.label;
  button.querySelector("[data-activity-detail]")!.textContent = activity.detail;
  button.title = `${activity.label}。${activity.detail}`;
  button.setAttribute("aria-label", button.title);
}
async function openServiceSettings(connected = false): Promise<void> {
  const status = await window.workpet.getWorketServiceStatus();
  const account = status.automatic
    ? `<section class="state-section"><h3><span class="category-icon" aria-hidden="true">◎</span> Worket 用户</h3><p>${status.userId ? `用户 ${esc(status.userId.slice(0, 8))}` : "首次使用时自动创建"}</p><button class="settings-link" id="copy-recovery" ${status.hasRecoveryCode ? "" : "disabled"}>复制恢复码</button><details><summary>在此设备恢复已有用户</summary><p class="consent">恢复后，此设备的模型额度和已授权上传归入同一用户。请把恢复码当作密码保管。</p><label class="field">恢复码<input id="recovery-code" type="password" autocomplete="off"></label><button id="restore-account">恢复用户</button></details></section>`
    : "";
  show("Worket 服务", `<p class="service-status ${connected ? "connected" : ""}">${connected ? "已连接" : status.automatic ? "自动连接" : "自定义连接"}</p><p class="consent">${esc(status.url)}</p>${account}<button id="check-service" class="settings-link"><span class="category-icon" aria-hidden="true">↻</span>检查连接</button><button id="improvement-data" class="settings-link"><span class="category-icon" aria-hidden="true">▤</span>改进数据</button><details class="policy-details"><summary>模型处理与留存</summary><p>点击沉淀后，所选工作记录交由 Worket 服务及模型供应商处理；默认仅包含附件信息，附件正文通过“含附件沉淀”单独选择。候选仍需审阅后保存。</p><p>未参与改进时，后台不持久保存正文；结果内存暂存最多 10 分钟，收取或取消后清除；无正文运行元数据默认保留 30 天。正文可能含敏感信息，ID 替换不代表匿名化。供应商留存以服务公布政策为准。</p></details><details><summary>高级连接设置</summary><label class="field">服务地址<input id="service-url" type="url" value="${esc(status.url)}"></label><label class="field">Worket 访问令牌<input id="service-token" type="password" autocomplete="off"></label><button id="save-service">保存并检查连接</button></details>`, "", {
    label: "返回工作面板",
    action: async () => {
      modal.close();
      document.querySelector<HTMLElement>("#app-menu > summary")?.focus();
    },
  });
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
      (j: Job & { title: string }) =>
        `<button class="work-row distillation-job" data-job="${esc(j.id)}"><h3>${esc(j.title)}</h3><span class="job-status" data-status="${esc(j.status)}">${esc(jobLabel(j.status))}</span><time datetime="${esc(j.createdAt)}">${esc(new Date(j.createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }))}</time>${j.error ? `<p>${esc(jobError(j.error))}</p>` : ""}</button>`,
    )
    .join("")}`;
  panel
    .querySelectorAll<HTMLElement>("[data-definition]")
    .forEach(
      (b) => (b.onclick = () => { contractOrigin = 'library'; void openDefinition(b.dataset.definition!); }),
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
const startingDistillations = new Map<string, Promise<void>>();

// One click freezes the selected records and submits them; concurrent clicks share the same job.
export function startDistillation(workIds: string[]): Promise<void> {
  if (!workIds.length) return Promise.reject(new Error("请先选择至少一条工作记录"));
  const key = JSON.stringify([...workIds].sort());
  const pending = startingDistillations.get(key);
  if (pending) return pending;
  const task = (async () => {
    await preferenceSave;
    const snapshot: Snapshot = await api("prepare", { workIds, includedFileIds: [] });
    const jobs: Job[] = await api("jobs");
    for (const job of jobs.filter(job => runningJob(job.status))) {
      const existing: Snapshot = await api("snapshot", { id: job.snapshotId });
      if (existing.contentHash === snapshot.contentHash) {
        await refreshActivity();
        return;
      }
    }
    await startSnapshot(snapshot);
  })().finally(() => startingDistillations.delete(key));
  startingDistillations.set(key, task);
  return task;
}

async function startSnapshot(snapshot: Snapshot, id = commandId()): Promise<void> {
  await preferenceSave;
  const { enabled } = await api("improvementPreference");
  await api("start", {
    preparationId: snapshot.id,
    expectedContentHash: snapshot.contentHash,
    consentVersion: "worket-data-v1",
    ...(enabled ? { improvementConsentVersion: IMPROVEMENT_POLICY.version } : {}),
    commandId: id,
  });
  await refreshActivity();
}

export async function openPreparation(workIds: string[], baseDefinitionId?: string): Promise<void> {
  if (!workIds.length) throw new Error("请先选择至少一条工作记录");
  let snapshot: Snapshot = await api("prepare", {
    workIds,
    includedFileIds: [],
    ...(baseDefinitionId ? { baseDefinitionId } : {}),
  });
  async function render() {
    const { enabled } = await api("improvementPreference");
    show(
      baseDefinitionId ? '确认约定更新范围' : "选择沉淀附件",
      `<p class="consent">截至 ${esc(new Date(snapshot.capturedAt).toLocaleString())}</p>${snapshot.sources.map((s) => `<section class="state-section"><h3>${esc(s.title)}</h3><p>${s.events.length} 条记录 · ${s.status === "OPEN" ? "当前快照" : s.status === "COMPLETED" ? "已完成" : "已归档"}</p>${s.files.map((f) => f.content !== undefined ? `<label class="file-choice"><input type="checkbox" data-file-id="${esc(f.id)}" checked> ${esc(f.name)} — 含正文</label><label>文件用途<select data-file-role="${esc(f.id)}">${[["REFERENCE", "仅供参考"], ["NORMATIVE", "采用为规范"], ["INPUT", "本次输入"]].map(([v, label]) => `<option value="${v}" ${(f.role ?? "REFERENCE") === v ? "selected" : ""}>${label}</option>`).join("")}</select></label>` : f.availability === "MISSING" ? `<label class="file-choice unavailable"><input type="checkbox" data-file-id="${esc(f.id)}" disabled> ${esc(f.name)} — 文件已不可用，仅保留文件信息</label>` : `<label class="file-choice"><input type="checkbox" data-file-id="${esc(f.id)}"> ${esc(f.name)} — ${f.availability === "CHANGED" ? "内容已更新，勾选后重新分析" : "仅文件信息"}</label>`).join("")}</section>`).join("")}<button id="apply-range">更新附件内容范围</button>${baseDefinitionId ? `<p class="consent">当前已确认约定、所选新交互与附件将交由 Worket 服务及模型供应商处理。</p><details class="policy-details"><summary>云端处理与留存</summary><p>未勾选改进授权时，后台不持久保存正文；结果内存暂存最多 10 分钟，收取或取消后清除；无正文运行元数据默认保留 30 天。正文可能含敏感信息，ID 替换不代表匿名化。供应商留存以服务公布政策为准。</p></details><label class="file-choice"><input id="consent" type="checkbox">我确认本次范围及云端处理</label>${improvementConsent("DISTILLATION", enabled)}` : ""}`,
      `<button id="start-distillation" class="primary">${baseDefinitionId ? '比较新交互' : '开始沉淀'}</button>`,
      baseDefinitionId ? { label: "返回契约", action: () => openDefinition(baseDefinitionId) } : undefined,
    );
    bind("#apply-range", async () => {
      const ids = [
        ...modal.querySelectorAll<HTMLInputElement>("[data-file-id]:checked"),
      ].map((e) => e.dataset.fileId!);
      const fileRoles = Object.fromEntries(ids.map(id => [id, modal.querySelector<HTMLSelectElement>(`[data-file-role="${CSS.escape(id)}"]`)?.value ?? "REFERENCE"]));
      snapshot = await api("prepare", { workIds, includedFileIds: ids, fileRoles, ...(baseDefinitionId ? { baseDefinitionId } : {}) });
      await render();
    });
    const id = commandId();
    bind("#start-distillation", async () => {
      if (baseDefinitionId && !check("#consent")) throw new Error("请确认本次材料范围及处理说明");
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
      if (JSON.stringify(selected) !== JSON.stringify(prepared) || snapshot.sources.some(s => s.files.some(f => f.content !== undefined && (modal.querySelector<HTMLSelectElement>(`[data-file-role="${CSS.escape(f.id)}"]`)?.value ?? "REFERENCE") !== (f.role ?? "REFERENCE"))))
        throw new Error("附件选择已变化，请先更新范围");
      await startSnapshot(snapshot, id);
      modal.close();
      await refreshActivity();
    });
  }
  await render();
}
export async function openJob(id: string): Promise<void> {
  contractOrigin = document.querySelector<HTMLElement>('#definitions-panel')?.hidden === false ? 'library' : 'work';
  const job: Job = await api("job", { jobId: id });
  if (!runningJob(job.status)) await api("seen", { jobId: id });
  if (job.status === "AWAITING_REVIEW" && job.draftId) {
    await editDraft(await api("draft", { id: job.draftId }));
    return;
  }
  if (job.status === 'SAVED' && job.draftId) {
    const draft: Draft = await api('draft', { id: job.draftId });
    if (draft.publishedId) { await openDefinition(draft.publishedId); return; }
  }
  const snapshot: Snapshot = await api("snapshot", { id: job.snapshotId });
  show(
    "沉淀任务",
    `<h3>${runningJob(job.status) ? `<span class="extraction-indicator running" aria-hidden="true"></span> ${esc(progressLabel(job.progress))}` : esc(jobLabel(job.status))}</h3><p class="consent">${esc(new Date(snapshot.capturedAt).toLocaleString())} · 第 ${job.attempt} 次尝试</p>${job.error ? `<p class="notice">${esc(jobError(job.error))}</p>` : ""}${job.result?.groups.map((g) => `<section><p>${esc(g.reason)}</p><button data-group="${esc(g.sourceKeys.join(","))}">选择这一组</button></section>`).join("") ?? ""}`,
    `${runningJob(job.status) ? '<button id="background-job">后台继续</button>' : ""}<button id="refresh-job">检查进度</button>${["FAILED", "INTERRUPTED"].includes(job.status) ? '<button id="retry-job">重试（不采集样本）</button>' : ""}${!["SAVED", "CANCELLED"].includes(job.status) ? '<button id="cancel-job">取消沉淀</button>' : ""}`,
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
  for (const button of modal.querySelectorAll<HTMLElement>("[data-group]")) {
    bind(`[data-group="${CSS.escape(button.dataset.group!)}"]`, async () => {
      await startDistillation(snapshot.sources
        .filter(source => button.dataset.group!.split(",").includes(source.key))
        .map(source => source.workId));
      modal.close();
    });
  }
  if (["PREPARED", "SUBMITTED", "RUNNING"].includes(job.status)) {
    const screen = modal.querySelector(".definition-card");
    const poll = () => {
      if (!modal.open || modal.querySelector(".definition-card") !== screen) return;
      if (document.querySelector("#app-menu[open]")) setTimeout(poll, 2000);
      else void openJob(id);
    };
    setTimeout(poll, 2000);
  }
}
async function editDraft(draft: Draft): Promise<void> {
  const previous: Definition | undefined = draft.baseDefinitionId ? await api('definition', { id: draft.baseDefinitionId }) : undefined;
  const label = draft.baseDefinitionId && !draft.jobId ? "编辑新版本" : "检查候选定义";
  show(label, "");
  modal.setAttribute("aria-label", label);
  modal.removeAttribute("aria-labelledby");
  disposeReview = mountDefinitionReview(modal, draft, api, async definition => {
    await refreshActivity().catch(() => {});
    await openDefinition(definition.id, publishedFeedback(previous, definition));
  }, previous ? () => openDefinition(previous.id) : undefined);
}
async function openMaterialRecovery(context: { definitionId?: string; workId?: string }): Promise<void> {
  const materials: { key: string; name: string; scope: string; hash: string; kind: string; available: boolean }[] = await api("materialRecovery", context);
  show("修复固定资料", `<p class="consent">选择与原版本一致的文件或技能目录。恢复会核对完整内容；更新要求或技能请修订约定。</p>${materials.map((material, index) => `<div class="field" data-recovery-key="${esc(material.key)}"><span>${esc(material.name)} · ${esc(material.scope)}</span><span>${material.available ? "可用" : "缺失或损坏"} · ${esc(material.hash.slice(0, 12))}</span>${material.available ? "" : `<button id="recover-material-${index}">${material.kind === "SKILL" ? "选择原版技能目录" : "选择原版文件"}</button>`}</div>`).join("")}`, '', context.definitionId ? { label: '返回契约', action: () => openDefinition(context.definitionId!) } : undefined);
  for (const [index, material] of materials.entries()) if (!material.available) {
    bind(`#recover-material-${index}`, async () => {
      const path = await window.workpet.chooseDefinitionFile(material.kind === "SKILL" ? "SKILL" : undefined);
      if (!path) return;
      await api("recoverMaterial", { ...context, key: material.key, expectedHash: material.hash, path });
      await openMaterialRecovery(context);
    });
  }
}
async function openDefinition(id: string, feedback?: ContractFeedback): Promise<void> {
  const d: Definition = await api("definition", { id });
  const versions: Definition[] = await api("versions", {
    key: d.definitionKey,
  });
  const history: EvolutionReview[] = await api('evolutionHistory', { definitionId: id });
  const continuous = await api('continuousEvolution', { definitionId: id });
  const additionalEvidence = history.flatMap(review => {
    const base = versions.find(version => version.contentHash === review.baseHash);
    return review.evidence.flatMap(entry => entry.refs.map(ref => ({ ref,
      label: `v${base?.version ?? '?'} · ${base ? contentItems(base.content).find(row => row.address === entry.target)?.item.text ?? '历史要求' : '历史要求'}`,
    })));
  });
  const returnLabel = contractOrigin === 'library' ? '返回已沉淀' : '返回工作';
  show(
    feedback ? ({ saved: '工作契约已保存', updated: '工作契约已更新', evidence: '依据已记录' })[feedback] : '工作契约',
    `${feedback ? '<p class="contract-receipt" role="status">已保存到「已沉淀」</p>' : ''}${workContract(d, feedback)}
    <details class="contract-management"><summary>版本与管理</summary><div class="contract-tools">
    <label class="inline-field">查看版本<select id="definition-version">${versions.map(v => `<option value="${v.id}" ${v.id === id ? 'selected' : ''}>v${v.version} · ${esc(new Date(v.confirmedAt).toLocaleDateString('zh-CN'))}${versions[0]?.id === v.id ? ' · 最新' : ''}</option>`).join('')}</select></label>
    <label class="contract-color">分类颜色<input id="contract-color" type="color" value="${contractColor(d.definitionKey)}"></label>
    <div class="contract-secondary-actions"><button id="evolve-definition" ${versions[0]?.id === id ? '' : 'disabled'}>从后续工作更新</button></div>
    ${versions[0]?.id !== id ? '<p class="consent">正在查看历史版本。切换到最新版本后可修改。</p>' : ''}
    <details><summary>来源与固定资料</summary>${d.refs.map(ref => `<p>${esc(ref.workId)} · ${ref.deleted ? '来源已删除' : esc(ref.eventId)}</p>`).join('')}${d.materials.map(m => `<p>${esc(m.role)} · ${esc(m.originalPath)} · ${esc(m.hash)}</p>`).join('')}</details>
    ${d.materials.length ? '<button id="repair-definition-materials">检查与恢复固定资料</button>' : ''}
    <div id="contract-advanced"></div><button id="delete-definition" class="danger-link">删除契约…</button>
    </div></details>`,
    `<button id="revise-definition" ${versions[0]?.id === id ? '' : 'disabled title="请切换到最新版本后修改"'}>生成新版本</button><button id="use-definition" class="primary">发起新工作</button>`,
    { label: returnLabel, action: async () => { modal.close(); if (contractOrigin === 'library') changed(); } },
  );
  modal.classList.add('contract-view');
  modal.querySelector('#definition-title')?.remove();
  modal.removeAttribute('aria-labelledby');
  modal.setAttribute('aria-label', d.content.name);
  const sheet = modal.querySelector<HTMLElement>('.contract-sheet')!;
  setContractColor(sheet, d.definitionKey, contractColor(d.definitionKey));
  bind('.wc-tab', async () => {
    const label = d.category ?? '其他工作';
    show('编辑工作分类', `<label class="field">分类名称<input id="definition-category" maxlength="12" value="${esc(label)}" autocomplete="off"></label><p class="consent">用于识别同一类工作；修改分类不会产生新契约版本。</p>`,
      '<button id="cancel-category">取消</button><button id="save-category" class="primary">保存分类</button>',
      { label: '返回契约', action: () => openDefinition(id) });
    bind('#cancel-category', () => openDefinition(id));
    bind('#save-category', async () => {
      const category = value('#definition-category').trim();
      await api('setDefinitionCategory', { definitionKey: d.definitionKey, category });
      await openDefinition(id);
    });
  });
  modal.querySelector<HTMLInputElement>('#contract-color')!.addEventListener('input', event => {
    setContractColor(sheet, d.definitionKey, (event.target as HTMLInputElement).value);
  });
  modal
    .querySelector("#definition-version")!
    .addEventListener(
      "change",
      () => void openDefinition(value("#definition-version")),
    );
  bind("#use-definition", () => useDefinition(d));
  bind("#repair-definition-materials", () => openMaterialRecovery({ definitionId: id }));
  if (additionalEvidence.length) {
    const details = document.createElement('details'); details.id = 'evolution-evidence';
    details.innerHTML = `<summary>此系列的补充依据 · ${additionalEvidence.length}</summary>${additionalEvidence.map((entry, index) => `<p>${esc(entry.label)} ${entry.ref.deleted ? '来源已删除' : `<button data-evolution-evidence="${index}">查看后续原文</button>`}</p>`).join('')}`;
    modal.querySelector('#contract-advanced')!.append(details);
    additionalEvidence.forEach((entry, index) => {
      if (!entry.ref.deleted) bind(`[data-evolution-evidence="${index}"]`, async () => {
        const text = await api('evidence', entry.ref);
        const pre = document.createElement('pre'); pre.textContent = text;
        modal.querySelector(`[data-evolution-evidence="${index}"]`)?.replaceWith(pre);
      });
    });
  }
  const continuousPanel = document.createElement('details');
  continuousPanel.id = 'continuous-evolution';
  const continuousState = !continuous.enabled ? '未开启' : continuous.destinationChanged ? '服务已变更，需重新开启' : continuous.error ? '上次比较未完成' : continuous.pendingStatus === 'AWAITING_REVIEW' || continuous.pendingStatus === 'NEEDS_SELECTION' ? '等待审阅' : ['PREPARED', 'SUBMITTED', 'RUNNING'].includes(continuous.pendingStatus) ? '正在比较' : continuous.remaining === 0 ? '已达今日上限' : '等待新交互';
  continuousPanel.innerHTML = `<summary>持续比较 · ${esc(continuousState)}</summary><p class="consent">开启后，此约定现有及未来实例中新记录的用户消息、Agent 回复和本次输入会连同最新已确认约定发送到当前 Worket 服务。新交互稳定 2 分钟后比较，每份约定每 24 小时最多 3 次；需保持 Worket 打开。附件正文仍需手动选择，结果经你确认后生效。停止后不再发起新比较，已发送的比较仍可查看。</p>${continuous.error ? `<p class="notice">${esc(jobError(continuous.error))}</p>` : ''}${continuous.enabled ? `<button id="stop-continuous">停止持续比较</button>` : ''}${!continuous.enabled || continuous.destinationChanged ? `<label class="file-choice"><input type="checkbox" id="continuous-consent">允许持续发送以上范围</label><button id="enable-continuous">开启持续比较</button>` : ''}${continuous.pendingJobId && continuous.pendingStatus !== 'SAVED' ? `<button id="open-continuous-job">查看最近比较</button>` : ''}`;
  modal.querySelector('#contract-advanced')!.append(continuousPanel);
  bind('#enable-continuous', async () => {
    if (!modal.querySelector<HTMLInputElement>('#continuous-consent')?.checked) throw new Error('请先确认持续比较的发送范围');
    await api('setContinuousEvolution', { definitionId: id, enabled: true, consentVersion: continuous.consentVersion });
    await openDefinition(id); modal.querySelector<HTMLDetailsElement>('.contract-management')!.open = true; modal.querySelector<HTMLDetailsElement>('#continuous-evolution')!.open = true;
  });
  bind('#stop-continuous', async () => {
    await api('setContinuousEvolution', { definitionId: id, enabled: false });
    await openDefinition(id); modal.querySelector<HTMLDetailsElement>('.contract-management')!.open = true; modal.querySelector<HTMLDetailsElement>('#continuous-evolution')!.open = true;
  });
  bind('#open-continuous-job', () => openJob(continuous.pendingJobId));
  bind('#evolve-definition', async () => {
    const sources: { workId: string; title: string; count: number; status: string }[] = await api('evolutionSources', { definitionId: id });
    const available = sources.filter(source => source.count > 0);
    show('选择后续工作', available.length
      ? available.map(source => `<label class="file-choice"><input type="checkbox" data-evolution-work="${esc(source.workId)}">${esc(source.title)} · ${source.count} 条新记录</label>`).join('')
      : '<p>使用此约定开展工作并记录新的交互后，可在这里比较更新。</p>',
      available.length ? '<button id="prepare-evolution" class="primary">确认范围</button>' : '', { label: '返回契约', action: () => openDefinition(id) });
    if (available.length) bind('#prepare-evolution', () => openPreparation([...modal.querySelectorAll<HTMLInputElement>('[data-evolution-work]:checked')].map(el => el.dataset.evolutionWork!), id));
  });
  bind("#revise-definition", async () => {
    await editDraft(
      await api("revise", { definitionId: id, commandId: commandId() }),
    );
  });
  bind('#delete-definition', () => deleteDefinition(d));
}
async function deleteDefinition(d: Definition): Promise<void> {
  show('删除契约', `<p>将永久删除「${esc(d.content.name)}」的全部版本、修订草稿及审阅记录。</p><p class="consent">已有工作引用的契约无法删除。原始工作记录会保留。</p><label class="field">输入“永久删除”以继续<input id="definition-delete-confirm" autocomplete="off"></label>`,
    '<button id="cancel-delete">保留契约</button><button id="confirm-delete" class="danger" disabled>永久删除</button>',
    { label: '返回契约', action: () => openDefinition(d.id) });
  const confirmation = modal.querySelector<HTMLInputElement>('#definition-delete-confirm')!;
  confirmation.addEventListener('input', () => {
    modal.querySelector<HTMLButtonElement>('#confirm-delete')!.disabled = confirmation.value !== '永久删除';
  });
  bind('#cancel-delete', () => openDefinition(d.id));
  const id = commandId();
  bind('#confirm-delete', async () => {
    await api('deleteDefinition', { definitionKey: d.definitionKey, confirmation: confirmation.value, commandId: id });
    modal.close(); changed();
    window.dispatchEvent(new CustomEvent('worket-feedback', { detail: '契约已删除' }));
  });
}
async function useDefinition(d: Definition): Promise<void> {
  const activeRules = ruleItems(effectiveRules(d.content).content);
  const examples: any[] = await api("examples", { definitionId: d.id });
  const { enabled } = await api("improvementPreference");
  show(
    `发起新工作`,
    `<p class="consent">${esc(d.content.name)} · v${d.version}</p>${d.content.inputs.length ? '' : '<p>此契约不需要额外输入，可以直接创建工作。</p>'}${d.content.inputs.map((i) => `<label class="field">${esc(i.text)} ${i.required ? "*" : ""}${i.valueType === "BOOLEAN" ? `<select data-input="${esc(i.key)}"><option value="">请选择</option><option value="true" ${i.defaultValue === true ? "selected" : ""}>是</option><option value="false" ${i.defaultValue === false ? "selected" : ""}>否</option></select>` : i.valueType === "CHOICE" ? `<select data-input="${esc(i.key)}"><option value="">请选择</option>${i.choices!.map((c) => `<option ${i.defaultValue === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>` : `<input data-input="${esc(i.key)}" type="${i.valueType === "NUMBER" ? "number" : "text"}" value="${esc(i.defaultValue ?? "")}">`}${i.valueType === "FILE" ? `<button data-input-file="${esc(i.key)}">选择本次文件</button>` : ""}</label>`).join("")}${d.materials.length ? `<section class="state-section"><h3><span class="category-icon" aria-hidden="true">▤</span> 固定资料</h3>${d.materials.map((m) => `<p>${esc((m.bundle ? "技能 · " : "") + (d.content.materialRoles.find(role => role.key === m.role)?.text ?? "固定资料"))} · <span title="${esc(m.originalPath)}">${esc(m.originalPath.split(/[\\/]/u).at(-1))}</span></p>`).join("")}</section>` : ""}${examples.length ? `<details><summary>参考案例（可选）</summary>${examples.map((a) => `<label class="file-choice"><input type="checkbox" data-example="${esc(a.id)}">${esc(a.filename)}</label>`).join("")}</details>` : ""}<details><summary>仅本次的特殊要求</summary>${activeRules.map(({ address, item }) => `<label class="field">${esc(ruleText(item))}<textarea data-rule-override="${esc(address)}" aria-label="仅本次替代：${esc(item.text)}"></textarea></label>`).join("")}</details>${improvementConsent("REUSE", enabled)}`,
    '<button id="create-defined-work" class="primary">创建并选择执行者</button>',
    { label: '返回契约', action: () => openDefinition(d.id) },
  );
  modal.querySelectorAll<HTMLElement>("[data-input-file]").forEach(
    (b) =>
      (b.onclick = () =>
        void window.workpet.chooseDefinitionFile().then((path) => {
          if (path)
            (
              modal.querySelector(
                `[data-input="${CSS.escape(b.dataset.inputFile!)}"]`,
              ) as HTMLInputElement
            ).value = path;
        })),
  );
  const id = commandId();
  bind("#create-defined-work", async () => {
    const inputs: Record<string, string | number | boolean> = {};
    for (const spec of d.content.inputs) {
      const field = modal.querySelector<HTMLInputElement>(`[data-input="${CSS.escape(spec.key)}"]`)!;
      const text = field.value;
      if (spec.required && !text.trim()) { field.focus(); throw new Error(`请填写「${spec.text}」`); }
      if (text && spec.valueType === 'NUMBER' && !Number.isFinite(Number(text))) { field.focus(); throw new Error(`「${spec.text}」需要填写数字`); }
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
      ruleOverrides: [...modal.querySelectorAll<HTMLTextAreaElement>("[data-rule-override]")].filter(el => el.value.trim()).map(el => ({ target: el.dataset.ruleOverride!, text: el.value.trim() })),
      improvementConsentVersion: improvementVersion(),
      inputs,
      referenceExampleIds: [
        ...modal.querySelectorAll<HTMLInputElement>("[data-example]:checked"),
      ].map((e) => e.dataset.example!),
      commandId: id,
    });
    changed(dashboard);
    await createdWork(d, dashboard);
    modal.querySelector<HTMLButtonElement>('#dispatch-created-work')?.click();
  });
}
async function createdWork(d: Definition, dashboard: DashboardView): Promise<void> {
  const work = dashboard.selectedWork!;
  const state = contractDispatchState(work);
  const failed = state === 'failed';
  const received = state === 'received';
  const waiting = state === 'waiting' || received;
  show(received ? '执行者已接手' : waiting ? '等待执行者接手' : failed ? '派发未成功，工作已保留' : '新工作已创建',
    `<div class="contract-work-result"><h3>${esc(work.title)}</h3><p class="consent">使用 ${esc(d.content.name)} · v${d.version}</p><p role="status">${received ? '工作包已被读取。可以在工作详情中跟进。' : waiting ? '已发起交接，请在目标执行者中确认。收到读取回执后会显示已接手。' : failed ? '可以重新选择执行者，无需再次创建工作。' : '选择执行者接手，也可以稍后在工作详情中派发。'}</p></div>`,
    `<button id="view-created-work" ${received ? 'class="primary"' : ''}>查看工作</button>${received ? '' : !waiting && work.status === 'OPEN' ? '<button id="dispatch-created-work" class="primary">选择执行者</button>' : '<button id="refresh-created-work" class="primary">检查接手状态</button>'}`,
    { label: '返回工作', action: async () => { modal.close(); changed(await window.workpet.getDashboard(work.id)); } });
  bind('#view-created-work', async () => { modal.close(); changed(await window.workpet.getDashboard(work.id)); });
  bind('#refresh-created-work', async () => { const fresh = await window.workpet.getDashboard(work.id); changed(fresh); await createdWork(d, fresh); });
  if (state === 'waiting') {
    const screen = modal.querySelector('.contract-work-result');
    const poll = async () => {
      if (!modal.open || modal.querySelector('.contract-work-result') !== screen) return;
      try {
        const fresh = await window.workpet.getDashboard(work.id);
        if (!modal.open || modal.querySelector('.contract-work-result') !== screen) return;
        if (fresh.selectedWork && contractDispatchState(fresh.selectedWork) !== state) {
          changed(fresh); await createdWork(d, fresh); return;
        }
      } catch { /* The visible refresh action remains available. */ }
      setTimeout(() => void poll(), 2000);
    };
    setTimeout(() => void poll(), 2000);
  }
  bind('#dispatch-created-work', async () => {
    const executorId = await chooseExecutor();
    if (!executorId) return;
    try {
      const next: DashboardView = await api('dispatch', { workId: work.id, executorId, commandId: commandId() });
      changed(next); await createdWork(d, next);
    } catch (error) {
      const fresh = await window.workpet.getDashboard(work.id);
      changed(fresh); await createdWork(d, fresh);
      throw error;
    }
  });
}
export async function workDefinitionAction(
  work: WorkDetailView,
  action: string,
): Promise<boolean> {
  if (action === "repair-materials") {
    await openMaterialRecovery({ workId: work.id });
    return true;
  }
  if (action === "instance-files") {
    const binding = await api("instanceFiles", { workId: work.id });
    const files: Record<string, string> = {};
    show("本次文件", `<p class="consent">重新选择只更新本次工作。保存后，Agent 需要重新读取工作包。</p>${binding.specs.map((spec: any) => `<div class="field"><span>${esc(spec.text)}</span><span data-file-label="${esc(spec.key)}">${esc(String(binding.inputs[spec.key] ?? "未选择").split(/[\\/]/).pop())} · ${binding.inputMaterials?.some((m: any) => m.role === spec.key) ? "已固定" : "需重新选择"}</span><button data-select-instance-file="${esc(spec.key)}">选择文件</button></div>`).join("")}${binding.referenceExamples.length ? `<h3>本次参考</h3>${binding.referenceExamples.map((reference: any) => `<label class="file-choice"><input type="checkbox" data-remove-reference="${esc(reference.id)}">移除 ${esc(reference.filename)} · ${reference.material ? "已固定" : "待确认固定"}</label>`).join("")}` : ""}`, '<button id="save-instance-files" class="primary">保存本次文件</button>');
    for (const button of modal.querySelectorAll<HTMLButtonElement>("[data-select-instance-file]")) {
      button.addEventListener("click", async () => {
        const path = await window.workpet.chooseDefinitionFile();
        if (!path) return;
        const key = button.dataset.selectInstanceFile!;
        files[key] = path;
        const label = [...modal.querySelectorAll<HTMLElement>("[data-file-label]")].find(element => element.dataset.fileLabel === key)!;
        label.textContent = `${path.split(/[\\/]/).pop()} · 待保存`;
      });
    }
    bind("#save-instance-files", async () => {
      const dashboard = await api("updateInstanceFiles", { workId: work.id, files,
        removeReferenceIds: [...modal.querySelectorAll<HTMLInputElement>("[data-remove-reference]:checked")].map(element => element.dataset.removeReference!),
        expectedHash: binding.expectedHash, commandId: commandId(),
      });
      modal.close(); changed(dashboard);
    });
    return true;
  }
  if (action === "distill") {
    await startDistillation([work.id]);
    return true;
  }
  if (action === "distill-files") {
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
      `<p class="consent">${esc(d.content.name)} · v${d.version}</p>${acceptanceChecks(d.content, (await api("package", { workId: work.id })).json.ruleOverrides ?? []).map((c) => `<label class="field">${esc(c.text)}<select data-criterion="${c.key}"><option value="">请选择</option><option value="PASS">通过</option><option value="NEEDS_REVISION">需要修改</option></select></label>`).join("")}<h3><span class="category-icon" aria-hidden="true">↗</span> 本次交付物</h3><div id="acceptance-artifacts"></div><button id="attach-output">关联本次交付物</button>`,
      '<button id="accept-output" class="primary">保存验收结果</button>',
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
  show("改进数据", `<label class="file-choice"><input id="improvement-consent" data-refresh-improvement type="checkbox" ${enabled ? "checked" : ""}>参与改进 Worket</label><p class="consent">记录的对话、沉淀材料和复用反馈供管理员评审，保存 90 天。</p><details class="policy-details"><summary>采集范围与留存</summary><p>默认开启，用于产品诊断、质量评测和功能改进。开始记录时保存该聊天已有及后续的用户消息和 AI 回复（不额外读取附件、工具输出或推理摘要），沉淀时保存所选材料、候选及修改，复用时保存定义、非文件输入及验收反馈，供后台管理员查看，保存 90 天。首次记录前展示上传范围，成功记录后不再重复提示；范围说明更新时重新展示。点击沉淀直接处理所选记录；附件正文通过“更多 → 含附件沉淀”单独选择，参与改进沿用此设置。复用仍展示其提交范围。取消后记住选择，并停止全部样本后续采集；重新开启仅适用于此后主动开始或恢复记录、提交的范围。</p></details><div class="dialog-actions"><button id="stop-all-improvement">停止全部后续采集</button><button id="sync-improvement">同步并刷新</button></div><p class="consent">停止采集后，已有样本仍保留，可单独删除。离线删除将在重新连接后完成。</p>${samples.map(s => `<section class="state-section"><h3>${esc(s.label)}</h3><p>${esc(labels[s.state])} · ${esc(s.pending)} 条待同步 · ${esc(JSON.parse(s.consent).at)}</p>${s.error ? `<p class="notice">${esc(s.error)}</p>` : ""}${s.state === "ACTIVE" ? `<button data-stop-sample="${esc(s.id)}">停止此样本采集</button>` : ""}${!["DELETED", "DELETE_PENDING"].includes(s.state) ? `<details><summary>删除后台样本</summary><label class="field">输入“删除样本”<input data-delete-confirm="${esc(s.id)}"></label><button data-delete-sample="${esc(s.id)}">确认删除样本</button></details>` : ""}</section>`).join("") || '<p>暂无改进样本</p>'}`, "", {
    label: "返回 Worket 服务",
    action: async () => {
      await openServiceSettings();
      modal.querySelector<HTMLButtonElement>("#improvement-data")?.focus();
    },
  });
  bind("#stop-all-improvement", async () => { await api("stopImprovement"); await openImprovementData(); });
  bind("#sync-improvement", async () => { await api("syncImprovement"); await openImprovementData(); });
  for (const s of samples) {
    bind(`[data-stop-sample="${s.id}"]`, async () => { await api("stopImprovement", { id: s.id }); await openImprovementData(); });
    bind(`[data-delete-sample="${s.id}"]`, async () => { await api("deleteImprovement", { id: s.id, confirmation: value(`[data-delete-confirm="${s.id}"]`) }); await openImprovementData(); });
  }
}
