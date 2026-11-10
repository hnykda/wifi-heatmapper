/**
 * access-points.ts - access point markers on the floor plan (issue #154):
 * where a router or mesh node is, with a name and an optional note. They
 * are for reference only and never feed a heat map. No Zod here, so the
 * browser can use it (the schemas are in schema.ts).
 */
import type { AccessPoint } from "./types";

/** Longest name, in characters, after trimming. */
export const ACCESS_POINT_NAME_MAX = 60;
/** Longest note, in characters, after trimming. */
export const ACCESS_POINT_NOTE_MAX = 500;
/** Most markers one survey can have. */
export const ACCESS_POINTS_MAX = 100;

/** A note as it is stored: trimmed, at most ACCESS_POINT_NOTE_MAX, or none. */
export function cleanAccessPointNote(value: string): string | undefined {
  const note = value.trim().slice(0, ACCESS_POINT_NOTE_MAX).trim();
  return note === "" ? undefined : note;
}

/** What to call a marker: its name, or "Access point" if it has none. */
export function accessPointName(ap: Pick<AccessPoint, "name">): string {
  return ap.name.trim() || "Access point";
}

/**
 * A new marker at (x, y): the first free "AP_N" id, named "Access point"
 * with a number when there are others already.
 */
export function newAccessPoint(
  existing: readonly AccessPoint[],
  x: number,
  y: number,
): AccessPoint {
  const used = new Set(existing.map((ap) => ap.id));
  let n = 1;
  while (used.has(`AP_${n}`)) n++;
  return {
    id: `AP_${n}`,
    x: Math.round(x),
    y: Math.round(y),
    name: existing.length === 0 ? "Access point" : `Access point ${n}`,
  };
}

/* ---------- drawing ---------- */

/**
 * Lucide's "router" icon (ISC licence, as in lucide-react), on its 24 x 24
 * grid, so canvas markers match the icon the app shows in buttons.
 */
const ROUTER_ICON = {
  rect: { x: 2, y: 14, width: 20, height: 8, r: 2 },
  paths: [
    "M6.01 18H6",
    "M10.01 18H10",
    "M15 10v4",
    "M17.84 7.17a4 4 0 0 0-5.66 0",
    "M20.66 4.34a8 8 0 0 0-11.31 0",
  ],
};

let routerPaths: Path2D[] | null = null;

/**
 * Draw one access point marker centred on (x, y): a rounded square badge
 * with a router icon, `size` across, and its name below when `label` is
 * given. Squares, so they never read as a measurement's round dot.
 */
export function drawAccessPointMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  {
    label,
    font,
    selected = false,
  }: { label?: string; font?: number; selected?: boolean } = {},
) {
  routerPaths ??= ROUTER_ICON.paths.map((d) => new Path2D(d));
  const half = size / 2;
  ctx.save();

  if (selected) {
    ctx.beginPath();
    ctx.roundRect(
      x - half * 1.45,
      y - half * 1.45,
      size * 1.45,
      size * 1.45,
      size * 0.38,
    );
    ctx.lineWidth = size * 0.12;
    ctx.strokeStyle = "hsl(252 56% 57%)";
    ctx.stroke();
  }

  // badge
  ctx.beginPath();
  ctx.roundRect(x - half, y - half, size, size, size * 0.24);
  ctx.fillStyle = "#14181f";
  ctx.fill();
  ctx.lineWidth = size * 0.08;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();

  // icon, on the 24-unit grid, in white
  const icon = size * 0.72;
  const k = icon / 24;
  ctx.save();
  ctx.translate(x - icon / 2, y - icon / 2 - k * 1); // the icon sits low
  ctx.scale(k, k);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const { rect } = ROUTER_ICON;
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, rect.r);
  ctx.stroke();
  for (const path of routerPaths) ctx.stroke(path);
  ctx.restore();

  // name
  if (label && font) {
    const pad = font * 0.3;
    ctx.font = `600 ${font}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const w = ctx.measureText(label).width + pad * 2;
    const h = font * 1.25 + pad * 2;
    const top = y + half + size * 0.25;
    ctx.fillStyle = "rgba(20, 24, 31, 0.85)";
    ctx.beginPath();
    ctx.roundRect(x - w / 2, top, w, h, pad);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, x, top + pad);
  }

  ctx.restore();
}
