/** URL the browser uses to load a floor plan image (served by /api/media/[name]). */
export function mediaUrlFor(name: string): string {
  return `/api/media/${encodeURIComponent(name)}`;
}
