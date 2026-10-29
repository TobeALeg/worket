/** Markers associate a user-visible delivery with a work; they are not credentials. */
export function deliveryFooter(workId: string, deliveryId?: string, inline = false): string {
  return [`Worket 关联信息${inline ? '（全文已附上）' : ''}`, `[WORKPET:${workId}]`,
    ...(deliveryId ? [`[DELIVERY:${deliveryId}]`] : [])].join('\n');
}

export function deliveryMarkers(content: string): { workId: string; deliveryId: string } | null {
  // Prefer the final envelope: quoted older deliveries in the body are not this delivery.
  const match = content.match(/(?:^|\n)(?:---\r?\n)?Worket 关联信息(?:（全文已附上）)?\r?\n\[WORKPET:([a-zA-Z0-9-]+)\]\r?\n\[DELIVERY:([a-zA-Z0-9-]+)\]\s*$/u)
    ?? content.match(/^\[WORKPET:([a-zA-Z0-9-]+)\]\s+\[DELIVERY:([a-zA-Z0-9-]+)\]/u);
  return match ? { workId: match[1]!, deliveryId: match[2]! } : null;
}

export function isInlineDelivery(content: string): boolean {
  return /(?:^|\n)(?:---\r?\n)?Worket 关联信息（全文已附上）\r?\n\[WORKPET:[a-zA-Z0-9-]+\]\r?\n\[DELIVERY:[a-zA-Z0-9-]+\]\s*$/u.test(content);
}
