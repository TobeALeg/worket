/** Move visual copies so the real strip keeps its layout, scrolling and focus. */
export function animateExecutorRelease(strip: HTMLElement, trigger: HTMLElement, returning = false): { finished: Promise<void>; cancel: () => void } {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !strip.isConnected || !trigger.isConnected) {
    return { finished: Promise.resolve(), cancel: () => {} };
  }
  const origin = trigger.getBoundingClientRect();
  const bounds = strip.getBoundingClientRect();
  const icons = [...strip.querySelectorAll<HTMLElement>(".executor-option-icon")].filter(icon => {
    const rect = icon.getBoundingClientRect();
    return rect.right > bounds.left && rect.left < bounds.right;
  });
  const layer = document.createElement("div");
  layer.className = "executor-inline executor-release-layer";
  layer.setAttribute("aria-hidden", "true");
  document.body.append(layer);
  const animations: Animation[] = [];
  const restore: (() => void)[] = [];
  for (const [index, icon] of icons.entries()) {
    const rect = icon.getBoundingClientRect();
    const dx = origin.left + origin.width / 2 - (rect.left + rect.width / 2);
    const dy = origin.top + origin.height / 2 - (rect.top + rect.height / 2);
    const clone = icon.cloneNode(true) as HTMLElement;
    Object.assign(clone.style, { position: "fixed", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    const opacity = getComputedStyle(icon.closest("button")!).opacity;
    layer.append(clone);
    const previous = icon.style.opacity;
    icon.style.opacity = "0";
    restore.push(() => { icon.style.opacity = previous; });
    const frames: Keyframe[] = returning ? [
      { transform: "translate(0, 0) scale(1)", opacity },
      { transform: `translate(${dx}px, ${dy}px) scale(.18)`, opacity: 0 },
    ] : [
      { transform: `translate(${dx}px, ${dy}px) scale(.2) rotate(-12deg)`, opacity: 0 },
      { opacity, offset: .16 },
      { transform: `translate(${dx * .06}px, -4px) scale(1.1) rotate(3deg)`, opacity, offset: .74 },
      { transform: "translate(0, 0) scale(1) rotate(0deg)", opacity },
    ];
    animations.push(clone.animate(frames, {
      duration: returning ? 190 : 440,
      delay: returning ? (icons.length - index - 1) * 7 : index * 19,
      easing: returning ? "cubic-bezier(.4, 0, .8, .4)" : "cubic-bezier(.25, .4, .25, 1)",
      fill: "both",
    }));
  }
  let cleaned = false;
  const cancel = () => {
    if (cleaned) return;
    cleaned = true;
    animations.forEach(animation => animation.cancel());
    restore.forEach(reset => reset());
    layer.remove();
  };
  const finished = Promise.allSettled(animations.map(animation => animation.finished)).then(cancel);
  return { finished, cancel };
}
