/** Markers associate a user-visible delivery with a work; they are not credentials. */
export function deliveryMarkers(content: string): { workId: string; deliveryId: string } | null {
  const match = content.match(/^\[WORKPET:([a-zA-Z0-9-]+)\]\s+\[DELIVERY:([a-zA-Z0-9-]+)\]/u);
  return match ? { workId: match[1]!, deliveryId: match[2]! } : null;
}
