/** Keep the row mounted until both the mark and the withdrawal have finished. */
export const reviewMotion = { mark: 320, withdraw: 400, closeDelay: 120 } as const;
const easing = "cubic-bezier(.22,.68,.2,1)";

export function fillReviewConfirmation(row: HTMLElement): void {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  row.querySelector<HTMLElement>(".dr-confirm .dr-fill")?.animate(
    [{ clipPath: "inset(100% 0 0)" }, { clipPath: "inset(0)" }],
    { duration: reviewMotion.mark, easing },
  );
}

export function withdrawReviewRow(row: HTMLElement): { finished: Promise<boolean>; cancel: () => void } {
  const animations: Animation[] = [];
  let cancelled = false;
  const finished = (async () => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
    const strike = row.querySelector<HTMLElement>(".dr-strike")!;
    const inner = row.querySelector<HTMLElement>(".dr-item-inner")!;
    try {
      const mark = strike.animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }], { duration: reviewMotion.mark, easing, fill: "forwards" });
      animations.push(mark);
      await mark.finished;
      if (cancelled) return false;
      row.style.overflow = "hidden";
      const withdraw = inner.animate([
        { opacity: 1, transform: "translateX(0) scale(1) skewX(0)", filter: "blur(0)" },
        { opacity: 0, transform: "translateX(34px) scale(.96,.93) skewX(-2deg)", filter: "blur(1.5px)" },
      ], { duration: reviewMotion.withdraw, easing, fill: "forwards" });
      const collapse = row.animate([{ height: `${row.getBoundingClientRect().height}px` }, { height: "0px" }], { duration: reviewMotion.withdraw - reviewMotion.closeDelay, delay: reviewMotion.closeDelay, easing, fill: "forwards" });
      animations.push(withdraw, collapse);
      await Promise.all([withdraw.finished, collapse.finished]);
      return !cancelled;
    } catch { return false; }
  })();
  return { finished, cancel() { cancelled = true; animations.forEach(animation => animation.cancel()); row.style.removeProperty("overflow"); } };
}
