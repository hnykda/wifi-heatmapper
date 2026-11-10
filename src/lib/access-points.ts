/**
 * access-points.ts - access point markers on the floor plan (issues #154,
 * #156): where a router or mesh node is, with a name, an optional note and
 * an icon. They are for reference only and never feed a heat map. No Zod
 * here, so the browser can use it (the schemas are in schema.ts).
 *
 * A marker's name is an access point name: the BSSIDs it broadcasts are
 * the rows of the survey's access point names (apMapping) under that name.
 * So linking a BSSID to a marker names every point measured on it, in the
 * details, the points table, the CSV and MCP, and renaming the marker
 * renames them. Names without a marker, and prefixes ("9E-05-D6-96-E8-*"),
 * are still edited in Settings.
 */
import { apNameFor } from "./apName";
import type { AccessPoint, ApMapping, SurveyPoint } from "./types";
import { normalizeMacAddress } from "./utils";

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

/* ---------- the BSSIDs a marker broadcasts ---------- */

/** One BSSID measured in the survey, as the marker's popup lists it. */
export interface MeasuredBssid {
  /** normalized: 12 lowercase hex digits */
  bssid: string;
  /** the network name of its latest point ("" if not known) */
  ssid: string;
  /** bands it was measured on, in GHz, ascending */
  bands: number[];
  /** points measured on it */
  points: number;
  /** from the marker to its nearest point, in image pixels */
  distance: number;
  /** the name it has now (from a marker or Settings), if any */
  name?: string;
  /** named only by a prefix row ("…-*"), which only Settings can change */
  byPrefix: boolean;
}

/** The exact (not prefix) access point name row for a BSSID, if any. */
function exactRow(
  apMapping: readonly ApMapping[],
  bssid: string,
): ApMapping | undefined {
  return apMapping.find(
    (row) => normalizeMacAddress(row.macAddress.trim()) === bssid,
  );
}

/**
 * Every BSSID measured in the survey, for the marker `ap`: the ones named
 * after it first, then the rest, nearest first. The nearest are most
 * likely the ones it broadcasts.
 */
export function measuredBssids(
  ap: AccessPoint,
  points: readonly SurveyPoint[],
  apMapping: readonly ApMapping[],
): MeasuredBssid[] {
  const byBssid = new Map<
    string,
    MeasuredBssid & { bandSet: Set<number>; latest: number }
  >();
  for (const point of points) {
    const raw = point.wifiData.bssid;
    if (!raw) continue;
    const bssid = normalizeMacAddress(raw);
    const distance = Math.hypot(point.x - ap.x, point.y - ap.y);
    let entry = byBssid.get(bssid);
    if (!entry) {
      const name = apNameFor(bssid, apMapping as ApMapping[]);
      entry = {
        bssid,
        ssid: "",
        bands: [],
        points: 0,
        distance,
        name,
        byPrefix: name !== undefined && !exactRow(apMapping, bssid),
        bandSet: new Set(),
        latest: -Infinity,
      };
      byBssid.set(bssid, entry);
    }
    entry.points++;
    entry.distance = Math.min(entry.distance, distance);
    if (point.wifiData.band) entry.bandSet.add(point.wifiData.band);
    if (point.timestamp >= entry.latest && point.wifiData.ssid) {
      entry.latest = point.timestamp;
      entry.ssid = point.wifiData.ssid;
    }
  }
  const own = accessPointName(ap);
  return [...byBssid.values()]
    .map(({ bandSet, latest: _latest, ...entry }) => ({
      ...entry,
      bands: [...bandSet].sort((a, b) => a - b),
    }))
    .sort(
      (a, b) =>
        Number(b.name === own) - Number(a.name === own) ||
        a.distance - b.distance ||
        a.bssid.localeCompare(b.bssid),
    );
}

/**
 * The access point names with `bssid` named `name` (linked = true) or not
 * (false). Linking replaces the BSSID's own row if it has one, so it moves
 * from another access point; unlinking removes that row. Prefix rows are
 * left alone.
 */
export function linkBssid(
  apMapping: readonly ApMapping[],
  name: string,
  bssid: string,
  linked: boolean,
): ApMapping[] {
  const target = normalizeMacAddress(bssid);
  const rest = apMapping.filter(
    (row) => normalizeMacAddress(row.macAddress.trim()) !== target,
  );
  return linked ? [...rest, { apName: name, macAddress: target }] : rest;
}

/**
 * The access point names after a marker is renamed from `from` to `to`:
 * its exact BSSID rows follow it. Prefix rows, and rows another marker
 * with the old name still uses, stay as they are.
 */
export function renameInApMapping(
  apMapping: readonly ApMapping[],
  from: string,
  to: string,
  othersWithOldName: boolean,
): ApMapping[] {
  if (from === to || othersWithOldName) return [...apMapping];
  return apMapping.map((row) =>
    row.apName === from && !row.macAddress.trim().endsWith("*")
      ? { ...row, apName: to }
      : row,
  );
}

/** Was `point` measured on a BSSID named `name`? */
export function servedBy(
  name: string,
  point: SurveyPoint,
  apMapping: readonly ApMapping[],
): boolean {
  return apNameFor(point.wifiData.bssid, apMapping as ApMapping[]) === name;
}

/* ---------- icons ---------- */

/**
 * The icons a marker can have, from Lucide (ISC licence, as in
 * lucide-react) on its 24 x 24 grid, so canvas markers match the icons
 * the app shows in buttons. Shapes are written as paths.
 */
export const ACCESS_POINT_ICONS = {
  router: {
    label: "Router",
    paths: [
      "M4 14h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2z",
      "M6.01 18H6",
      "M10.01 18H10",
      "M15 10v4",
      "M17.84 7.17a4 4 0 0 0-5.66 0",
      "M20.66 4.34a8 8 0 0 0-11.31 0",
    ],
  },
  wifi: {
    label: "Mesh node or extender",
    paths: [
      "M12 20h.01",
      "M2 8.82a15 15 0 0 1 20 0",
      "M5 12.859a10 10 0 0 1 14 0",
      "M8.5 16.429a5 5 0 0 1 7 0",
    ],
  },
  tower: {
    label: "Outdoor access point",
    paths: [
      "M4.9 16.1C1 12.2 1 5.8 4.9 1.9",
      "M7.8 4.7a6.14 6.14 0 0 0-.8 7.5",
      "M10 9a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
      "M16.2 4.8c2 2 2.26 5.11.8 7.47",
      "M19.1 1.9a9.96 9.96 0 0 1 0 14.1",
      "M9.5 18h5",
      "m8 22 4-11 4 11",
    ],
  },
} as const;

export type AccessPointIcon = keyof typeof ACCESS_POINT_ICONS;
export const ACCESS_POINT_ICON_NAMES = Object.keys(
  ACCESS_POINT_ICONS,
) as AccessPointIcon[];

/* ---------- drawing ---------- */

const iconPaths = new Map<AccessPointIcon, Path2D[]>();

/**
 * Draw one access point marker centred on (x, y): a rounded square badge
 * with its icon, `size` across, and its name below when `label` is given.
 * Squares, so they never read as a measurement's round dot.
 */
export function drawAccessPointMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  {
    icon = "router",
    label,
    font,
    selected = false,
  }: {
    icon?: AccessPointIcon;
    label?: string;
    font?: number;
    selected?: boolean;
  } = {},
) {
  let paths = iconPaths.get(icon);
  if (!paths) {
    paths = ACCESS_POINT_ICONS[icon].paths.map((d) => new Path2D(d));
    iconPaths.set(icon, paths);
  }
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
  const box = size * 0.68;
  const k = box / 24;
  ctx.save();
  ctx.translate(x - box / 2, y - box / 2);
  ctx.scale(k, k);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const path of paths) ctx.stroke(path);
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
