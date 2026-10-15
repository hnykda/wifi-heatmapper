import { HeatmapRange, HeatmapRanges, IperfTestProperty } from "./types";

export const defaultHeatmapRanges: Record<
  keyof IperfTestProperty,
  HeatmapRange
> = {
  signalStrength: { min: 0, max: 100 },
  bitsPerSecond: { min: 0, max: 1000 },
  jitterMs: { min: 0, max: 50 },
  lostPackets: { min: 0, max: 100 },
  retransmits: { min: 0, max: 100 },
  packetsReceived: { min: 0, max: 1000 },
};

export function isValidHeatmapRange(
  range: HeatmapRange | undefined,
  property: keyof IperfTestProperty,
): range is HeatmapRange {
  return (
    !!range &&
    Number.isFinite(range.min) &&
    Number.isFinite(range.max) &&
    range.min >= 0 &&
    range.max > range.min &&
    (property !== "signalStrength" || range.max <= 100) &&
    Number.isFinite(range.max * (property === "bitsPerSecond" ? 1e6 : 1))
  );
}

/** Return raw measurement units for both the renderer and legend. */
export function resolveHeatmapRange(
  property: keyof IperfTestProperty,
  values: number[],
  ranges?: HeatmapRanges,
): HeatmapRange {
  const fixed = ranges?.[property];
  if (isValidHeatmapRange(fixed, property)) {
    const factor = property === "bitsPerSecond" ? 1e6 : 1;
    return { min: fixed.min * factor, max: fixed.max * factor };
  }
  if (property === "signalStrength") return { min: 0, max: 100 };
  return {
    min: 0,
    max: values.reduce(
      (max, value) => (Number.isFinite(value) ? Math.max(max, value) : max),
      1e-9,
    ),
  };
}
