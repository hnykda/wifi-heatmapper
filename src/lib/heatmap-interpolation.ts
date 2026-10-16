import type { HeatmapRange } from "./types";

type Point = { x: number; y: number; value: number };

/** Double-precision IDW fallback. Clamp only the interpolated value. */
export function createHeatmapInterpolator(
  points: Point[],
  range: HeatmapRange,
) {
  const span = range.max - range.min;
  const deviations = points.map(({ value }) => value - range.min);
  if (
    !Number.isFinite(span) ||
    span <= 0 ||
    deviations.some((value) => !Number.isFinite(value))
  ) {
    throw new RangeError(
      "Heatmap values and range must have finite differences",
    );
  }
  const normalize = (value: number) => Math.max(0, Math.min(1, value / span));
  // Reuse scratch storage: the fallback evaluates every pixel synchronously.
  const weights = new Float64Array(points.length);
  return (x: number, y: number, radius: number): number | null => {
    let nearest = Infinity;
    for (let i = 0; i < points.length; i++) {
      const distance = Math.hypot(x - points[i].x, y - points[i].y);
      if (distance < 0.001) return normalize(deviations[i]);
      weights[i] = distance;
      if (distance <= radius) nearest = Math.min(nearest, distance);
    }
    if (!Number.isFinite(nearest)) return null;

    let total = 0;
    for (let i = 0; i < weights.length; i++) {
      // A common scale leaves IDW unchanged and bounds each weight by 1.
      weights[i] = weights[i] <= radius ? (nearest / weights[i]) ** 3 : 0;
      total += weights[i];
    }
    let mean = 0;
    for (let i = 0; i < weights.length; i++) {
      mean += deviations[i] * (weights[i] / total);
    }
    return normalize(mean);
  };
}

/** Keep GPU data bounded and fall back before float32 loses colour resolution. */
export function prepareHeatmapGPUData(points: Point[], range: HeatmapRange) {
  const span = range.max - range.min;
  const scale = points.reduce(
    (scale, { value }) => Math.max(scale, Math.abs(value - range.min)),
    span,
  );
  const normalizedSpan = span / scale;
  // Leave a precision margin for accumulation, especially with outliers.
  if (!Number.isFinite(scale) || normalizedSpan < points.length * 2 ** -12)
    return null;
  const data = Float32Array.from(
    points.flatMap(({ x, y, value }) => [x, y, (value - range.min) / scale]),
  );
  for (let i = 0; i < points.length; i++) {
    const value = (points[i].value - range.min) / scale;
    if (!Number.isFinite(value) || (value !== 0 && Math.abs(value) < 2 ** -40))
      return null;
    if (Math.abs(data[i * 3 + 2] - value) > normalizedSpan / 4096) return null;
  }
  return { data, span: Math.fround(normalizedSpan) };
}
