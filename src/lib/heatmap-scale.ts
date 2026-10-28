import {
  HeatmapKey,
  HeatmapProperty,
  HeatmapRange,
  HeatmapRanges,
  HeatmapScale,
  IperfResults,
  IperfTestProperty,
  MeasurementTestType,
} from "./types";

const mapProperties: Record<keyof IperfResults, (keyof IperfTestProperty)[]> = {
  tcpDownload: ["bitsPerSecond", "retransmits"],
  tcpUpload: ["bitsPerSecond"],
  udpDownload: ["bitsPerSecond", "jitterMs", "lostPackets", "packetsReceived"],
  udpUpload: ["bitsPerSecond", "jitterMs", "lostPackets", "packetsReceived"],
};

export function heatmapKey(
  metric: MeasurementTestType,
  property: HeatmapProperty,
): HeatmapKey {
  if (metric === "signalStrength" || metric === "snr") return metric;
  return `${metric}-${property as keyof IperfTestProperty}`;
}

/** Automatic SNR range in dB: 0 (unusable) to 50 (excellent). */
export const SNR_RANGE: HeatmapRange = { min: 0, max: 50 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rawFactor(property: HeatmapProperty): number {
  return property === "bitsPerSecond" ? 1e6 : 1;
}

export function isValidHeatmapRange(
  range: unknown,
  property: HeatmapProperty,
): range is HeatmapRange {
  if (!isRecord(range)) return false;
  const { min, max } = range;
  if (
    typeof min !== "number" ||
    typeof max !== "number" ||
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    min < 0 ||
    max <= min ||
    (property === "signalStrength" && max > 100)
  ) {
    return false;
  }
  const factor = rawFactor(property);
  const rawMin = min * factor;
  const rawMax = max * factor;
  // Adjacent display values can round to the same float after conversion.
  return Number.isFinite(rawMin) && Number.isFinite(rawMax) && rawMax > rawMin;
}

/** Return raw measurement units for both the renderer and legend. */
export function resolveHeatmapRange(
  property: HeatmapProperty,
  values: number[],
  scale?: HeatmapScale,
): HeatmapRange {
  if (scale?.enabled === true && isValidHeatmapRange(scale, property)) {
    const factor = rawFactor(property);
    return { min: scale.min * factor, max: scale.max * factor };
  }
  if (property === "signalStrength") return { min: 0, max: 100 };
  if (property === "snr") return { ...SNR_RANGE };
  const max = values.reduce(
    (max, value) => (Number.isFinite(value) ? Math.max(max, value) : max),
    0,
  );
  return { min: 0, max: max > 0 ? max : 1 };
}

/** Convert an automatic raw range to the units used by scale controls. */
export function toDisplayRange(
  property: HeatmapProperty,
  rawRange: HeatmapRange,
): HeatmapRange {
  const factor = rawFactor(property);
  return { min: rawRange.min / factor, max: rawRange.max / factor };
}

/** Accept only supported map keys and valid saved scales. */
export function normalizeHeatmapRanges(input: unknown): HeatmapRanges {
  if (!isRecord(input)) return {};
  const ranges: HeatmapRanges = {};
  const readScale = (
    value: unknown,
    property: HeatmapProperty,
  ): HeatmapScale | undefined => {
    if (!isRecord(value) || !isValidHeatmapRange(value, property)) {
      return undefined;
    }
    if (typeof value.enabled === "boolean") {
      return { min: value.min, max: value.max, enabled: value.enabled };
    }

    return undefined;
  };

  const signal = readScale(input.signalStrength, "signalStrength");
  if (signal) ranges.signalStrength = signal;
  const snr = readScale(input.snr, "snr");
  if (snr) ranges.snr = snr;
  for (const metric of Object.keys(mapProperties) as (keyof IperfResults)[]) {
    for (const property of mapProperties[metric]) {
      const key = heatmapKey(metric, property);
      const scale = readScale(input[key], property);
      if (scale) ranges[key] = scale;
    }
  }
  return ranges;
}
