/** Gentle proximity feedback, edge browsing and mouse-wheel scrolling. */
export function setupExecutorDock(list: HTMLElement, selector = ".executor-option"): () => void {
  const buttons = [...list.querySelectorAll<HTMLButtonElement>(selector)];
  let pointerX: number | null = null;
  let focused: HTMLButtonElement | null = null;
  let frame = 0;
  let previousTime = 0;
  const reset = () => buttons.forEach(button => {
    button.style.removeProperty("--dock-scale");
    button.style.removeProperty("--dock-lift");
  });
  const update = (time: number) => {
    frame = 0;
    const elapsed = Math.min(previousTime ? time - previousTime : 16, 32);
    previousTime = time;
    const bounds = list.getBoundingClientRect();
    let scrolling = false;
    if (pointerX !== null && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const edge = 32;
      const left = Math.max(0, Math.min(1, 1 - (pointerX - bounds.left) / edge));
      const right = Math.max(0, Math.min(1, 1 - (bounds.right - pointerX) / edge));
      const before = list.scrollLeft;
      list.scrollLeft += (right * right - left * left) * 110 * elapsed / 1000;
      scrolling = Math.abs(list.scrollLeft - before) > .01;
    }
    const focusBounds = focused?.getBoundingClientRect();
    const x = pointerX ?? (focusBounds ? focusBounds.left + focusBounds.width / 2 : null);
    for (const button of buttons) {
      const rect = button.getBoundingClientRect();
      const distance = x === null ? 90 : Math.abs(rect.left + rect.width / 2 - x);
      const influence = button.disabled ? 0 : Math.cos(Math.min(distance / 90, 1) * Math.PI / 2) ** 2;
      button.style.setProperty("--dock-scale", String(1 + .18 * influence));
      button.style.setProperty("--dock-lift", `${-.5 * influence}px`);
    }
    if (scrolling) schedule();
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  const move = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    pointerX = event.clientX;
    focused = null;
    schedule();
  };
  const leave = () => { pointerX = null; previousTime = 0; schedule(); };
  const wheel = (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey || list.scrollWidth <= list.clientWidth) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? list.clientWidth : 1;
    const before = list.scrollLeft;
    pointerX = null;
    list.scrollLeft += delta * unit;
    if (list.scrollLeft !== before) event.preventDefault();
    schedule();
  };
  const focus = (event: FocusEvent) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(selector);
    if (!button?.matches(":focus-visible")) return;
    focused = button;
    pointerX = null;
    const rect = button.getBoundingClientRect();
    const bounds = list.getBoundingClientRect();
    if (rect.left < bounds.left) list.scrollLeft -= bounds.left - rect.left;
    if (rect.right > bounds.right) list.scrollLeft += rect.right - bounds.right;
    schedule();
  };
  const blur = (event: FocusEvent) => {
    if (!list.contains(event.relatedTarget as Node | null)) { focused = null; schedule(); }
  };
  list.addEventListener("wheel", wheel, { passive: false });
  list.addEventListener("pointerdown", leave);
  list.addEventListener("pointermove", move);
  list.addEventListener("pointerleave", leave);
  list.addEventListener("focusin", focus);
  list.addEventListener("focusout", blur);
  list.addEventListener("scroll", schedule);
  return () => {
    cancelAnimationFrame(frame);
    list.removeEventListener("wheel", wheel);
    list.removeEventListener("pointerdown", leave);
    list.removeEventListener("pointermove", move);
    list.removeEventListener("pointerleave", leave);
    list.removeEventListener("focusin", focus);
    list.removeEventListener("focusout", blur);
    list.removeEventListener("scroll", schedule);
    reset();
  };
}
