/** A single gentle scroll invitation, frozen as soon as the user takes control. */
export function hintHorizontalMotion(list: HTMLElement, ready: Promise<void> = Promise.resolve()): () => void {
  const children = [...list.children] as HTMLElement[];
  const events = ["pointerenter", "pointerdown", "wheel", "keydown", "focusin"] as const;
  let stopped = false;
  let frame = 0;
  const stop = () => {
    stopped = true;
    cancelAnimationFrame(frame);
    events.forEach(event => list.removeEventListener(event, stop));
  };
  events.forEach(event => list.addEventListener(event, stop, { passive: true }));
  void ready.then(() => {
    if (stopped || !list.isConnected || list.matches(":hover") || matchMedia("(prefers-reduced-motion: reduce)").matches) { stop(); return; }
    const origin = list.scrollLeft;
    const available = list.scrollWidth - list.clientWidth - origin;
    const scrolls = available > 1;
    const distance = scrolls ? Math.min(24, available) : 5;
    let start: number | undefined;
    const tick = (time: number) => {
      if (!list.isConnected) { stop(); return; }
      start ??= time + 180;
      const progress = Math.max(0, Math.min(1, (time - start) / 1500));
      // Zero velocity at both ends and at the turnaround; no bounce or loop.
      const offset = distance * (1 - Math.cos(progress * Math.PI * 2)) / 2;
      if (scrolls) list.scrollLeft = origin + offset;
      else children.forEach(child => { child.style.translate = `${-offset}px 0`; });
      if (progress < 1) frame = requestAnimationFrame(tick);
      else stop();
    };
    frame = requestAnimationFrame(tick);
  });
  return () => {
    stop();
    children.forEach(child => child.style.removeProperty("translate"));
  };
}
