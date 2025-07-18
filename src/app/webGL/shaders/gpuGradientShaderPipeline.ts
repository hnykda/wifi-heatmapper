import { Gradient } from "@/lib/types";
import _ from "lodash";

export type RGBColor = readonly [number, number, number];

const LOOKUP_TABLE_SIZE = 256;

/**
 * Parses rgba() strings to RGBColor tuple.
 */
export const rgbaToRGB = (rgba: string) => {
  const parts = rgba.match(/\d+/g);
  if (parts) {
    const [r, g, b] = parts.map(Number);
    return [r, g, b] as const;
  }
  return [0, 0, 0] as const;
};

/**
 * Converts a Gradient to a precomputed RGB map of length 256.
 */
export function createLookupTableFromGradient(gradient: Gradient): RGBColor[] {
  const stops = Object.entries(gradient)
    .map(([pos, rgba]) => ({
      position: parseFloat(pos),
      color: rgbaToRGB(rgba),
    }))
    .sort((a, b) => a.position - b.position);

  let stopIndex = 0;
  return _.times(LOOKUP_TABLE_SIZE, (index) => {
    const position = index / (LOOKUP_TABLE_SIZE - 1);

    while (
      stopIndex < stops.length - 2 &&
      position > stops[stopIndex + 1].position
    ) {
      stopIndex++;
    }

    const start = stops[stopIndex];
    const end = stops[stopIndex + 1] ?? start;

    const range = end.position - start.position || 1e-6;
    const alpha = (position - start.position) / range;

    return [
      Math.round(start.color[0] + (end.color[0] - start.color[0]) * alpha),
      Math.round(start.color[1] + (end.color[1] - start.color[1]) * alpha),
      Math.round(start.color[2] + (end.color[2] - start.color[2]) * alpha),
    ] as const;
  });
}
