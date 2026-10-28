/**
 * heatmap-grid.ts - a coarse numeric version of a heat map.
 *
 * The heat maps are drawn in the browser with WebGL
 * (src/app/webGL/shaders/heatmapFragmentShader.ts), so the server cannot
 * produce the image. This module computes the same interpolation on a grid
 * of cells, for readers that want numbers instead of pixels (the MCP server).
 *
 * It mirrors the shader and Heatmaps.tsx:
 * - only enabled points; for throughput maps only points where that test ran
 *   (not null; a measured 0 counts) and the value is a finite number;
 * - inverse-distance weighting with power 3;
 * - a point contributes only within the influence radius (in floor-plan
 *   pixels): settings.radiusDivider, or the automatic radius from
 *   calculateRadiusByBoundingBox() over the enabled points, rounded;
 * - a sample that sits on a point takes that point's value;
 * - nothing (null) where no point is within the radius.
 *
 * Unlike the shader, values are not clamped to the colour scale: they are
 * interpolated measurements, in display units (%, Mbps, ms, counts).
 *
 * Pure functions, no I/O. Used by the MCP server; safe on client or server.
 */
import { calculateRadiusByBoundingBox } from "./radiusCalculations";
import {
  HeatmapKey,
  IperfResults,
  IperfTestProperty,
  HeatmapProperty,
  MeasurementTestType,
  SurveyPoint,
} from "./types";
import { snrOf } from "./utils";

/** The shader's weight falloff exponent (heatmapLayerRenderer.ts, u_power). */
export const IDW_POWER = 3;

/** Every map the Heat maps tab can draw, by its HeatmapKey. */
export const HEATMAP_KEYS = [
  "signalStrength",
  "snr",
  "tcpDownload-bitsPerSecond",
  "tcpDownload-retransmits",
  "tcpUpload-bitsPerSecond",
  "udpDownload-bitsPerSecond",
  "udpDownload-jitterMs",
  "udpDownload-lostPackets",
  "udpDownload-packetsReceived",
  "udpUpload-bitsPerSecond",
  "udpUpload-jitterMs",
  "udpUpload-lostPackets",
  "udpUpload-packetsReceived",
] as const satisfies readonly HeatmapKey[];

export type GridHeatmapKey = (typeof HEATMAP_KEYS)[number];

export function isGridHeatmapKey(key: string): key is GridHeatmapKey {
  return (HEATMAP_KEYS as readonly string[]).includes(key);
}

export function parseHeatmapKey(key: GridHeatmapKey): {
  metric: MeasurementTestType;
  property: HeatmapProperty;
} {
  if (key === "signalStrength") {
    return { metric: "signalStrength", property: "signalStrength" };
  }
  if (key === "snr") return { metric: "snr", property: "snr" };
  const [metric, property] = key.split("-") as [
    keyof IperfResults,
    keyof IperfTestProperty,
  ];
  return { metric, property };
}

/** Units of the values a grid (and the colour scale controls) use. */
export function displayUnit(property: HeatmapProperty): string {
  switch (property) {
    case "signalStrength":
      return "%";
    case "snr":
      return "dB";
    case "bitsPerSecond":
      return "Mbps";
    case "jitterMs":
      return "ms";
    default:
      return "count";
  }
}

/** Raw measurement (bits/s for throughput) to display units. */
export function toDisplayUnits(property: HeatmapProperty, raw: number): number {
  return property === "bitsPerSecond" ? raw / 1e6 : raw;
}

/**
 * The value a point contributes to a map, in raw units, or null when it
 * has none. Same rules as getMetricValue() in Heatmaps.tsx.
 */
export function heatmapValue(
  point: SurveyPoint,
  metric: MeasurementTestType,
  property: HeatmapProperty,
): number | null {
  if (metric === "signalStrength") {
    const v = point.wifiData?.signalStrength;
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  }
  if (metric === "snr") return snrOf(point.wifiData);
  const test = point.iperfData?.[metric];
  if (!test) return null; // test not run (a measured 0 is a value)
  const v = test[property as keyof IperfTestProperty];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export interface GridPoint {
  x: number;
  y: number;
  value: number;
}

/** The enabled points that have a value for this map, in raw units. */
export function heatmapPoints(
  points: SurveyPoint[],
  key: GridHeatmapKey,
): GridPoint[] {
  const { metric, property } = parseHeatmapKey(key);
  const out: GridPoint[] = [];
  for (const p of points) {
    if (!p.isEnabled) continue;
    const value = heatmapValue(p, metric, property);
    if (value !== null) out.push({ x: p.x, y: p.y, value });
  }
  return out;
}

/**
 * The radius the Heat maps tab uses: the saved one, or the automatic one
 * computed from all enabled points (not only those with this metric).
 */
export function influenceRadius(settings: {
  radiusDivider: number | null;
  surveyPoints: SurveyPoint[];
}): { radius: number; automatic: boolean } {
  if (
    typeof settings.radiusDivider === "number" &&
    Number.isFinite(settings.radiusDivider)
  ) {
    return { radius: settings.radiusDivider, automatic: false };
  }
  const enabled = settings.surveyPoints.filter((p) => p.isEnabled);
  return {
    radius: Math.round(calculateRadiusByBoundingBox(enabled)),
    automatic: true,
  };
}

/**
 * Inverse-distance-weighted value at (x, y), as the fragment shader computes
 * it for the pixel there. null when no point is within `radius`.
 */
export function idwValueAt(
  points: GridPoint[],
  x: number,
  y: number,
  radius: number,
  power: number = IDW_POWER,
): number | null {
  const radiusSq = radius * radius;
  let weightedSum = 0;
  let weightTotal = 0;
  for (const p of points) {
    const dx = x - p.x;
    const dy = y - p.y;
    const distSq = dx * dx + dy * dy;
    if (distSq < 1e-6) return p.value; // on a point: its own value
    if (distSq > radiusSq) continue;
    const weight = 1 / Math.pow(distSq, power * 0.5);
    weightedSum += weight * p.value;
    weightTotal += weight;
  }
  return weightTotal === 0 ? null : weightedSum / weightTotal;
}

export interface HeatmapGrid {
  columns: number;
  rows: number;
  /** Size of one cell in floor-plan pixels. */
  cellWidth: number;
  cellHeight: number;
  /** Centre of each column / row in floor-plan pixels (where it is sampled). */
  x: number[];
  y: number[];
  /** values[row][column], null where no point is within the radius. */
  values: (number | null)[][];
}

/**
 * computeHeatmapGrid() - sample the IDW surface at the centre of each cell.
 *
 * `cells` is the number of cells along the longer side of the floor plan;
 * the shorter side gets proportionally fewer, so cells are about square.
 * Point values are used as given (convert units first if needed).
 */
export function computeHeatmapGrid(options: {
  points: GridPoint[];
  width: number;
  height: number;
  radius: number;
  cells: number;
  power?: number;
  round?: (value: number) => number;
}): HeatmapGrid {
  const { points, width, height, radius } = options;
  const power = options.power ?? IDW_POWER;
  const round = options.round ?? ((v: number) => v);
  const cells = Math.max(1, Math.floor(options.cells));
  const longer = Math.max(width, height);
  const columns =
    width >= height ? cells : Math.max(1, Math.round((cells * width) / longer));
  const rows =
    height >= width
      ? cells
      : Math.max(1, Math.round((cells * height) / longer));
  const cellWidth = width / columns;
  const cellHeight = height / rows;
  const x = Array.from({ length: columns }, (_, i) => (i + 0.5) * cellWidth);
  const y = Array.from({ length: rows }, (_, j) => (j + 0.5) * cellHeight);
  const values = y.map((cy) =>
    x.map((cx) => {
      const v = idwValueAt(points, cx, cy, radius, power);
      return v === null ? null : round(v);
    }),
  );
  return { columns, rows, cellWidth, cellHeight, x, y, values };
}
