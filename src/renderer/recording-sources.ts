import { RECORDING_UPLOAD_NOTICE, type ConversationView, type DashboardView, type ExecutorView } from "../ui-contract.js";

type Page = { threads: ConversationView[]; nextCursor: string | null; notice?: string };
const logos: Record<string, string> = { codex: "codex.png", workbuddy: "workbuddy.png", antigravity: "antigravity.png", zcode: "zcode.png" };

export function setupRecordingSources(onRecorded: (dashboard: DashboardView) => void): {
  refresh: (force?: boolean) => Promise<void>;
  open: (executorId?: string) => Promise<void>;
} {
  const providers = document.querySelector<HTMLElement>("#source-providers")!;
  const sources = document.querySelector<HTMLElement>("#recent-sources")!;
  const error = document.querySelector<HTMLElement>("#source-error")!;
  const search = document.querySelector<HTMLInputElement>("#source-search")!;
  const more = document.querySelector<HTMLButtonElement>("#source-more")!;
  const retry = document.querySelector<HTMLButtonElement>("#source-retry")!;
  let executors: ExecutorView[] = [];
  let pages = new Map<string, Page>();
  let selected = "all", noticeRequired = true, recording = false, loading = false;
  let lastRefresh = 0, revision = 0, searchRevision = 0;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let codexSearch: Page | null = null;

  function showError(value: unknown): void {
    error.hidden = !value;
    error.textContent = value instanceof Error ? value.message : value ? String(value) : "";
  }

  function sourceRow(source: ConversationView): HTMLElement {
    const row = document.createElement("div");
    row.className = "source-row";
    row.dataset.threadId = source.id;
    const text = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = source.title || "未命名聊天";
    const meta = document.createElement("p");
    meta.className = "source-meta";
    meta.textContent = `${source.projectLabel ?? (source.cwd.split("/").filter(Boolean).at(-1) || "无项目")} · ${new Date(source.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
    text.append(title, meta);
    const button = document.createElement("button");
    button.className = "secondary";
    button.textContent = source.workId ? "打开记录" : "开始记录";
    button.disabled = recording;
    button.addEventListener("click", async () => {
      if (recording) return;
      recording = true;
      button.disabled = true;
      button.textContent = source.workId ? "正在打开…" : "正在导入…";
      showError(null);
      try {
        const dashboard = source.workId
          ? await window.workpet.getDashboard(source.workId)
          : await window.workpet.createWorkFromConversation({ executorId: source.executorId, threadId: source.id });
        onRecorded(dashboard);
      } catch (cause) { showError(cause); }
      finally { recording = false; await refresh(true); }
    });
    row.append(text, button);
    return row;
  }

  function renderProviders(): void {
    providers.replaceChildren();
    for (const item of executors) {
      const button = document.createElement("button");
      button.className = "source-provider";
      button.dataset.provider = item.id;
      button.type = "button";
      button.title = selected === item.id ? `取消 ${item.name} 筛选` : `只看 ${item.name} 聊天`;
      button.setAttribute("aria-label", button.title);
      button.setAttribute("aria-pressed", String(selected === item.id));
      const icon = document.createElement("span");
      icon.className = "source-icon";
      if (logos[item.id]) {
        const logo = document.createElement("img");
        logo.src = `./executor-logos/${logos[item.id]}`;
        logo.alt = "";
        icon.append(logo);
      } else {
        const mark = document.createElement("span");
        mark.textContent = item.mark;
        icon.append(mark);
      }
      button.append(icon);
      button.addEventListener("click", () => {
        selected = selected === item.id ? "all" : item.id;
        search.value = "";
        codexSearch = null;
        searchRevision++;
        clearTimeout(searchTimer);
        render();
      });
      providers.append(button);
    }
  }

  function render(): void {
    renderProviders();
    const query = search.value.trim().toLocaleLowerCase();
    const remoteSearch = selected === "codex" && Boolean(query);
    search.setAttribute("aria-label", selected === "codex" ? "搜索全部 Codex 聊天标题" : "搜索已加载聊天");
    search.placeholder = selected === "codex" ? "聊天标题（区分大小写）" : "聊天标题或项目";
    sources.replaceChildren();
    if (noticeRequired) {
      const disclosure = document.createElement("p");
      disclosure.className = "notice";
      disclosure.textContent = RECORDING_UPLOAD_NOTICE;
      sources.append(disclosure);
    }
    const visible = executors.filter(item => selected === "all" || item.id === selected);
    visible.sort((a, b) => (Date.parse(pages.get(b.id)?.threads[0]?.updatedAt ?? "") || 0) - (Date.parse(pages.get(a.id)?.threads[0]?.updatedAt ?? "") || 0));
    let count = 0;
    for (const item of visible) {
      const page = remoteSearch && item.id === "codex" ? codexSearch : pages.get(item.id);
      if (selected === "all") {
        const heading = document.createElement("h2");
        heading.className = "source-group-title";
        heading.textContent = item.name;
        sources.append(heading);
      }
      const matches = (page?.threads ?? []).filter(thread => remoteSearch || `${thread.title ?? ""} ${thread.projectLabel ?? thread.cwd}`.toLocaleLowerCase().includes(query));
      matches.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      for (const thread of matches) sources.append(sourceRow(thread));
      count += matches.length;
      if (page?.notice) {
        const notice = document.createElement("p");
        notice.className = "notice";
        notice.textContent = page.notice;
        sources.append(notice);
      }
    }
    if (!count && !loading) {
      const empty = document.createElement("p");
      empty.className = "source-empty";
      empty.textContent = query ? "没有匹配的聊天" : "暂无可用聊天";
      sources.append(empty);
    }
    more.hidden = !visible.some(item => (remoteSearch && item.id === "codex" ? codexSearch : pages.get(item.id))?.nextCursor);
    more.disabled = loading;
  }

  async function refresh(force = false): Promise<void> {
    if (recording || loading || (!force && Date.now() - lastRefresh < 30_000)) return;
    const current = ++revision;
    loading = true;
    retry.disabled = true;
    showError(null);
    try {
      const [available, notice] = await Promise.all([
        window.workpet.listExecutors(),
        window.workpet.distillation("recordingNotice"),
      ]);
      const eligible = available.filter(item => !item.capabilities || item.capabilities.source === "HISTORY");
      const results = await Promise.allSettled(eligible.map(item => window.workpet.listConversationHistory(item.id)));
      if (current !== revision) return;
      executors = eligible;
      noticeRequired = notice.required;
      pages = new Map(results.map((result, index) => {
        const id = eligible[index]!.id;
        if (result.status === "rejected") return [id, pages.get(id) ?? { threads: [], nextCursor: null }];
        const previous = pages.get(id);
        if (!force && previous && previous.threads.length > result.value.threads.length)
          return [id, { ...result.value, threads: [...new Map([...result.value.threads, ...previous.threads].map(thread => [thread.id, thread])).values()], nextCursor: previous.nextCursor }];
        return [id, result.value];
      }));
      showError(results.flatMap((result, index) => result.status === "rejected" ? [`${eligible[index]!.name}：${String(result.reason)}`] : []).join("\n"));
      lastRefresh = Date.now();
    } catch (cause) { showError(cause); }
    finally {
      if (current === revision) {
        loading = false;
        retry.disabled = false;
        render();
      }
    }
  }

  async function searchCodex(): Promise<void> {
    const current = ++searchRevision;
    const query = search.value.trim();
    codexSearch = null;
    if (!query) { render(); return; }
    sources.textContent = "正在搜索聊天…";
    try {
      const page = await window.workpet.listConversationHistory("codex", undefined, query);
      if (current !== searchRevision || selected !== "codex") return;
      codexSearch = page;
      showError(null);
      render();
    } catch (cause) {
      if (current === searchRevision) { showError(cause); render(); }
    }
  }

  async function loadMore(): Promise<void> {
    if (loading) return;
    const query = search.value.trim();
    const remoteSearch = selected === "codex" && Boolean(query);
    const candidates = executors.filter(item => (selected === "all" || selected === item.id) && (remoteSearch && item.id === "codex" ? codexSearch : pages.get(item.id))?.nextCursor);
    if (!candidates.length) return;
    loading = true;
    more.disabled = true;
    try {
      const results = await Promise.allSettled(candidates.map(item => {
        const page = remoteSearch && item.id === "codex" ? codexSearch : pages.get(item.id);
        return window.workpet.listConversationHistory(item.id, page!.nextCursor!, remoteSearch ? query : undefined);
      }));
      const errors: string[] = [];
      results.forEach((result, index) => {
        const item = candidates[index]!;
        if (result.status === "rejected") { errors.push(`${item.name}：${String(result.reason)}`); return; }
        const previous = remoteSearch && item.id === "codex" ? codexSearch! : pages.get(item.id)!;
        const next = { ...result.value, threads: [...new Map([...previous.threads, ...result.value.threads].map(thread => [thread.id, thread])).values()] };
        if (remoteSearch && item.id === "codex") codexSearch = next;
        else pages.set(item.id, next);
      });
      showError(errors.join("\n"));
    } finally { loading = false; render(); }
  }

  async function open(executorId?: string): Promise<void> {
    selected = executorId ?? "all";
    search.value = "";
    codexSearch = null;
    render();
    await refresh(true);
  }
  retry.addEventListener("click", () => void refresh(true));
  more.addEventListener("click", () => void loadMore());
  search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchRevision++;
    if (selected !== "codex") { render(); return; }
    searchTimer = setTimeout(() => void searchCodex(), 200);
  });
  return { refresh, open };
}
