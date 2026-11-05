import type { HeatmapProperty, MeasurementTestType } from "./types";
import { metricFormatter, percentageToRssi } from "./utils";

/** The text a point's label shows, in the units of the map's legend. */
export function pointValueText(
  value: number,
  metric: MeasurementTestType,
  property: HeatmapProperty,
  asPercentage: boolean,
): string {
  const shown =
    metric === "signalStrength" && !asPercentage
      ? percentageToRssi(value)
      : value;
  return metricFormatter(shown, metric, property, asPercentage);
}

/**
 * Font size for the reading labels, from the map's caption font. `scale` is
 * a percentage: 75 makes the label a little smaller than the caption.
 */
export function labelFontSize(fontPx: number, scale: number): number {
  return Math.max(6, Math.round((fontPx * scale) / 100));
}
