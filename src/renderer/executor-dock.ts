/** Proximity magnification and edge scrolling without changing button hit areas. */
export function setupExecutorDock(list: HTMLElement): () => void {
  const buttons = [...list.querySelectorAll<HTMLButtonElement>(".executor-option")];
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
    const bounds = list.getBoundingClientRect();
    const elapsed = Math.min(previousTime ? time - previousTime : 16, 32);
    previousTime = time;
    let scrolling = false;
    if (pointerX !== null) {
      const edge = 36;
      const left = Math.max(0, 1 - (pointerX - bounds.left) / edge);
      const right = Math.max(0, 1 - (bounds.right - pointerX) / edge);
      const before = list.scrollLeft;
      list.scrollLeft += (right * right - left * left) * 180 * elapsed / 1000;
      scrolling = Math.abs(list.scrollLeft - before) > .01;
    }
    const focusBounds = focused?.getBoundingClientRect();
    const x = pointerX ?? (focusBounds ? focusBounds.left + focusBounds.width / 2 : null);
    for (const button of buttons) {
      const rect = button.getBoundingClientRect();
      const distance = x === null ? 90 : Math.abs(rect.left + rect.width / 2 - x);
      const influence = button.disabled ? 0 : Math.cos(Math.min(distance / 90, 1) * Math.PI / 2) ** 2;
      button.style.setProperty("--dock-scale", String(1 + .4 * influence));
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
  const focus = (event: FocusEvent) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(".executor-option");
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
  list.addEventListener("pointermove", move);
  list.addEventListener("pointerleave", leave);
  list.addEventListener("focusin", focus);
  list.addEventListener("focusout", blur);
  list.addEventListener("scroll", schedule);
  return () => {
    cancelAnimationFrame(frame);
    list.removeEventListener("pointermove", move);
    list.removeEventListener("pointerleave", leave);
    list.removeEventListener("focusin", focus);
    list.removeEventListener("focusout", blur);
    list.removeEventListener("scroll", schedule);
    reset();
  };
}
