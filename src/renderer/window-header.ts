type PageHeader = {
  dialog: HTMLDialogElement;
  label: string;
  back: () => void | Promise<void>;
  beforeNavigate?: () => void | Promise<void>;
  menu?: string;
  returnFocus?: HTMLElement | null;
};

const home = document.querySelector<HTMLElement>("#window-header-home")!;
const header = home.querySelector<HTMLElement>(".brand-row")!;
const backButton = header.querySelector<HTMLButtonElement>("#window-back")!;
const menu = header.querySelector<HTMLElement>("#window-menu-extra")!;
const pages: PageHeader[] = [];
const observedDialogs = new WeakSet<HTMLDialogElement>();
let navigationPending = false;
let preparedNavigation = false;
let activePage: PageHeader | undefined;

function currentPage(): PageHeader | undefined {
  return pages.findLast((page) => page.dialog.open);
}

function restoreHeader(): void {
  const page = currentPage();
  const slot = page?.dialog.querySelector<HTMLElement>(".window-header-slot") ?? home;
  if (header.parentElement !== slot) slot.append(header);
  backButton.hidden = !page;
  backButton.setAttribute("aria-label", page?.label ?? "返回");
  backButton.title = page?.label ?? "返回";
  if (activePage !== page) {
    menu.innerHTML = page?.menu ?? "";
    header.querySelector(".feedback-entry")?.classList.toggle("active", page?.dialog.id === "feedback-dialog");
    header.querySelector<HTMLDetailsElement>("#app-menu")!.open = false;
    activePage = page;
  }
}

function showNavigationError(error: unknown): void {
  const message = currentPage()?.dialog.querySelector<HTMLElement>('[role="alert"]');
  if (message) {
    message.textContent = error instanceof Error ? error.message : String(error);
    message.hidden = false;
  }
}

backButton.addEventListener("click", () => {
  const page = currentPage();
  if (!page || navigationPending) return;
  navigationPending = true;
  backButton.disabled = true;
  Promise.resolve().then(page.back).catch(showNavigationError).finally(() => {
    navigationPending = false;
    backButton.disabled = false;
    restoreHeader();
    if (!page.dialog.open) {
      const focus = currentPage() ? backButton : page.returnFocus ?? header.querySelector<HTMLElement>("#app-menu summary");
      focus?.focus();
    }
  });
});

// A menu destination must preserve an edited draft before replacing its page.
header.addEventListener("click", (event) => {
  const target = (event.target as Element).closest<HTMLButtonElement>("#service-settings, #archive-records");
  const page = currentPage();
  if (!target || preparedNavigation || !page?.beforeNavigate) return;
  event.stopPropagation();
  event.preventDefault();
  if (navigationPending) return;
  navigationPending = true;
  Promise.resolve().then(page.beforeNavigate).then(() => {
    preparedNavigation = true;
    try { target.click(); } finally { preparedNavigation = false; }
  }).catch(showNavigationError).finally(() => { navigationPending = false; });
}, true);

/** Reuse the actual global controls in the foremost page, including nested pages. */
export function showPageHeader(page: PageHeader): void {
  const existing = pages.findIndex((entry) => entry.dialog === page.dialog);
  if (existing >= 0) pages[existing] = page;
  else pages.push(page);
  if (!observedDialogs.has(page.dialog)) {
    observedDialogs.add(page.dialog);
    page.dialog.addEventListener("close", () => {
      if (!page.dialog.open) {
        const index = pages.findIndex((entry) => entry.dialog === page.dialog);
        if (index >= 0) pages.splice(index, 1);
      }
      restoreHeader();
    });
  }
  restoreHeader();
}
