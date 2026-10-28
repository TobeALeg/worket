import { createPetMotion } from "./pet-motion.js";
import { createPetVisual, type PetVisualState } from "./pet-visual.js";
import { PET_BODY_SIZE, PET_BODY_CENTER, type PetPlacement } from "../desktop/pet-layout.js";
import type { CurrentConversationView, PetView } from "../ui-contract.js";

const root = required<HTMLElement>("#pet-root");
const pet = required<HTMLElement>("#pet");
const petBody = required<HTMLButtonElement>("#pet-body");
const bubble = required<HTMLElement>("#context-bubble");
const applicationMark = required<HTMLElement>("#application-mark");
const applicationIcon = required<HTMLImageElement>("#application-icon");
const applicationSymbol = required<HTMLElement>("#application-symbol");
const contextLabel = required<HTMLElement>("#context-label");
const contextTitle = required<HTMLElement>("#context-title");
const waitingDots = required<HTMLElement>("#waiting-dots");
const paperAction = required<HTMLButtonElement>("#paper-action");
const paperLabel = required<HTMLElement>("#paper-label");
let currentConversation: CurrentConversationView | null = null;
let busy = false;
let distillationActivity: PetView["distillation"] = null;
let visualState: PetVisualState = "sleeping";
let updateState: NonNullable<PetView["updateState"]> = "none";
const renderVisual = createPetVisual(required<HTMLElement>("#pet-visual"));
let currentBody: { x: number; y: number } | null = null;
root.style.setProperty("--pet-width", `${PET_BODY_SIZE.width}px`);
root.style.setProperty("--pet-height", `${PET_BODY_SIZE.height}px`);

const APPLICATION_ICONS: Record<string, string> = {
  codex: "./executor-logos/codex-mark.png",
  workbuddy: "./executor-logos/workbuddy.svg",
};

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

const renderMotion = createPetMotion(root, pet);
function renderPlacement(placement: PetPlacement): void {
  renderMotion(placement);
  root.style.setProperty("--dock-x", `${placement.dock?.x ?? 0}px`);
  root.style.setProperty("--dock-y", `${placement.dock?.y ?? 0}px`);
  root.dataset.edge = placement.edge ?? "free";
  root.classList.toggle("docked", Boolean(placement.edge));
  renderVisual(visualState, Boolean(placement.edge), updateState);
  const body = placement.body ?? {
    x: PET_BODY_CENTER.x - PET_BODY_SIZE.width / 2,
    y: PET_BODY_CENTER.y - PET_BODY_SIZE.height / 2,
  };
  root.style.setProperty("--pet-x", `${body.x}px`);
  root.style.setProperty("--pet-y", `${body.y}px`);
  currentBody = body;
  positionBubble(body);
  root.style.setProperty("--bubble-bottom", `${innerHeight - body.y + 18}px`);
  root.style.setProperty("--bubble-top", `${body.y + PET_BODY_SIZE.height + 18}px`);
  root.classList.toggle("bubble-below", body.y < 130);
}
window.workpet.onPetPlacement?.(renderPlacement);

function positionBubble(body: { x: number; y: number }): void {
  const width = bubble.hidden ? 204 : bubble.getBoundingClientRect().width;
  const maxWidth = Math.max(1, innerWidth - 24);
  const boundedWidth = Math.min(width || 86, maxWidth);
  const maxX = Math.max(12, innerWidth - boundedWidth - 12);
  const minX = Math.min(12, maxX);
  const bubbleX = Math.max(
    minX,
    Math.min(body.x + PET_BODY_SIZE.width - boundedWidth, maxX),
  );
  root.style.setProperty("--bubble-x", `${bubbleX}px`);
  root.style.setProperty("--bubble-max-width", `${maxWidth}px`);
}

function setApplicationMark(adapter: string, fallback: string): void {
  const icon = APPLICATION_ICONS[adapter];
  applicationMark.className = `application-mark ${adapter}`;
  applicationIcon.hidden = !icon;
  applicationSymbol.hidden = Boolean(icon);
  if (icon) {
    if (applicationIcon.getAttribute("src") !== icon) applicationIcon.src = icon;
    applicationSymbol.textContent = "";
    return;
  }
  applicationIcon.removeAttribute("src");
  applicationSymbol.textContent = fallback;
}

window.addEventListener("resize", () => {
  if (currentBody) positionBubble(currentBody);
});

function render(state: PetView): void {
  visualState = state.distillation ? `distilling-${state.distillation.state}` : state.petState;
  updateState = state.updateState ?? "none";
  renderPlacement(state.placement ?? { edge: state.edge ?? null });
  pet.className = `pet ${visualState}`;
  distillationActivity = state.distillation;
  currentConversation = state.currentConversation;
  if (distillationActivity) {
    const activity = distillationActivity;
    root.classList.add("has-context");
    root.classList.remove("recording-context");
    root.classList.add("distillation-context");
    bubble.hidden = false;
    bubble.classList.remove("is-waiting");
    applicationMark.className = "application-mark activity-mark";
    applicationIcon.hidden = true;
    applicationIcon.removeAttribute("src");
    applicationSymbol.hidden = false;
    applicationSymbol.textContent = activity.state === "running" ? "···" : activity.state === "ready" ? "✓" : "!";
    contextLabel.textContent = activity.label;
    contextLabel.hidden = false;
    contextTitle.textContent = activity.detail;
    contextTitle.hidden = false;
    waitingDots.hidden = true;
    paperAction.disabled = false;
    paperLabel.textContent = activity.state === "ready" ? "审阅" : activity.state === "failed" ? "处理" : "进度";
    paperAction.dataset.action = "distillation";
    paperAction.setAttribute("aria-label", activity.label);
    petBody.title = activity.label;
    petBody.setAttribute("aria-label", activity.label);
    if (currentBody) positionBubble(currentBody);
    return;
  }
  root.classList.remove("distillation-context");
  petBody.setAttribute("aria-label", "打开 Worket");
  const hasConversation = Boolean(currentConversation);
  root.classList.toggle("has-context", hasConversation);
  root.classList.toggle(
    "recording-context",
    Boolean(currentConversation?.isRecording),
  );
  bubble.hidden = !currentConversation;
  paperAction.disabled = !currentConversation || busy;
  if (!currentConversation) {
    bubble.classList.remove("is-waiting");
    petBody.title = "打开 Worket";
    paperLabel.textContent = "查看";
    paperAction.removeAttribute("data-action");
    paperAction.setAttribute("aria-label", "当前没有可查看的对话");
    return;
  }
  setApplicationMark(
    currentConversation.adapter,
    currentConversation.mark ?? currentConversation.applicationName.slice(0, 1),
  );
  const needsSelection = currentConversation.needsSelection === true;
  bubble.classList.toggle("is-waiting", needsSelection);
  contextLabel.hidden = true;
  contextLabel.textContent = "";
  contextTitle.hidden = needsSelection;
  contextTitle.textContent = currentConversation.title;
  waitingDots.hidden = !needsSelection;
  if (currentBody) positionBubble(currentBody);
  paperLabel.textContent = needsSelection ? "选择" : "查看";
  paperAction.dataset.action = "open";
  paperAction.setAttribute(
    "aria-label",
    `查看当前活动：${currentConversation.title}`,
  );
  petBody.title = `打开 Worket · ${currentConversation.title}`;
}

async function refresh(): Promise<void> {
  if (busy) return;
  render(await window.workpet.getPetView());
}

let gesture: {
  pointerId: number;
  x: number;
  y: number;
  moved: boolean;
} | null = null;
let suppressClick = false;
let moveFrame = 0;
let pendingMove: { x: number; y: number } | null = null;
function flushMove(): void {
  if (moveFrame) cancelAnimationFrame(moveFrame);
  moveFrame = 0;
  if (!pendingMove) return;
  window.workpet.dragPet("move", pendingMove);
  pendingMove = null;
}
petBody.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || gesture) return;
  suppressClick = false;
  gesture = {
    pointerId: event.pointerId,
    x: event.screenX,
    y: event.screenY,
    moved: false,
  };
  petBody.setPointerCapture(event.pointerId);
  window.workpet.dragPet("start", { x: event.screenX, y: event.screenY });
});
document.addEventListener("pointermove", (event) => {
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  if (Math.hypot(event.screenX - gesture.x, event.screenY - gesture.y) >= 5)
    gesture.moved = true;
  if (gesture.moved) {
    root.classList.add("dragging");
    pendingMove = { x: event.screenX, y: event.screenY };
    if (!moveFrame) moveFrame = requestAnimationFrame(flushMove);
  }
});
function finishDrag(): void {
  if (!gesture) return;
  flushMove();
  suppressClick = gesture.moved;
  gesture = null;
  root.classList.remove("dragging");
  window.workpet.dragPet("end");
}
document.addEventListener("pointerup", finishDrag);
document.addEventListener("pointercancel", finishDrag);
petBody.addEventListener("lostpointercapture", finishDrag);
window.addEventListener("blur", finishDrag);
petBody.addEventListener("click", (event) => {
  if (suppressClick && event.detail !== 0) {
    suppressClick = false;
    return;
  }
  if (distillationActivity) void window.workpet.openDistillationFromPet();
  else void window.workpet.togglePanelFromPet();
});

paperAction.addEventListener("click", async () => {
  if (distillationActivity) { await window.workpet.openDistillationFromPet(); await refresh(); return; }
  if (!currentConversation || busy) return;
  busy = true;
  paperAction.disabled = true;
  try {
    await window.workpet.openCurrentContextFromPet();
  } finally {
    busy = false;
    await refresh();
  }
});

document.addEventListener("mousemove", (event) => {
  if (gesture) return;
  const target = event.target instanceof Element ? event.target : null;
  window.workpet.setPetMousePassthrough(!target?.closest("#pet"));
});
document.addEventListener("mouseleave", () => {
  if (!gesture) window.workpet.setPetMousePassthrough(true);
});

setInterval(() => void refresh().catch(() => undefined), 2_000);
void refresh();
