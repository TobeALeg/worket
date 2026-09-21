type Bounds = { x: number; y: number; width: number; height: number };
export function resizePanelRight(bounds: Bounds, area: Bounds, delta: number): Bounds {
  const maximum = Math.max(360, Math.min(1000, area.x + area.width - bounds.x));
  return { ...bounds, width: Math.round(Math.max(360, Math.min(maximum, bounds.width + delta))) };
}
