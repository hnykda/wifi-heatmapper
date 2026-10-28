/**
 * point-label.ts - the optional name a person gives a survey point
 * ("Kitchen", "Desk upstairs"). It is display only: the point keeps its
 * id ("Point_3"), which the API, MCP and file use to refer to it.
 * No Zod here, so the browser can use it.
 */

/** Longest label, in characters, after trimming. */
export const POINT_LABEL_MAX = 60;

/** A label as it is stored: trimmed, at most POINT_LABEL_MAX, or none. */
export function cleanPointLabel(value: string): string | undefined {
  const label = value.trim().slice(0, POINT_LABEL_MAX).trim();
  return label === "" ? undefined : label;
}

/** What to call a point: its label, or its id if it has none. */
export function pointName(point: { id: string; label?: string }): string {
  return point.label?.trim() || point.id;
}
