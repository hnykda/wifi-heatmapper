import _ from "lodash";
import { Gradient } from "./types";

export type RGBColor = readonly [number, number, number];

const LOOKUP_TABLE_SIZE = 256;

/**
 * Generate a precomputed color lookup table from a gradient definition.
 *
 * @param gradient - An object where keys are stops ∈ [0,1] and values are rgba strings
 * @returns RGBColor[] length 256
 */
export const createLookupTableFromGradient = (
  gradient: Gradient,
): RGBColor[] => {
  const GRADIENT_STOPS = Object.entries(gradient)
    .map(([k, rgba]) => ({
      position: parseFloat(k),
      color: rgbaToRGB(rgba),
    }))
    .sort((a, b) => a.position - b.position);

  return Array.from({ length: LOOKUP_TABLE_SIZE }, (_, index) => {
    const normalized = index / (LOOKUP_TABLE_SIZE - 1);

    const stopIndex = GRADIENT_STOPS.findIndex(
      (stop, index) =>
        index < GRADIENT_STOPS.length - 1 &&
        normalized >= stop.position &&
        normalized <= GRADIENT_STOPS[index + 1].position,
    );

    if (stopIndex === -1) {
      return GRADIENT_STOPS.at(-1)!.color;
    }

    const { position: startT, color: startColor } = GRADIENT_STOPS[stopIndex];
    const { position: endT, color: endColor } = GRADIENT_STOPS[stopIndex + 1];

    const range = endT - startT || 1e-6;
    const relative = (normalized - startT) / range;

    const rgb: RGBColor = [
      Math.round(startColor[0] + (endColor[0] - startColor[0]) * relative),
      Math.round(startColor[1] + (endColor[1] - startColor[1]) * relative),
      Math.round(startColor[2] + (endColor[2] - startColor[2]) * relative),
    ] as const;

    return rgb;
  });
};

export const rgbaToRGB = (rgba: string) => {
  const parts = rgba.match(/\d+/g);
  if (parts) {
    const [r, g, b] = parts.map(Number);
    return [r, g, b] as const;
  }
  return [0, 0, 0] as const;
};

/**
 * Looks up the RGB triplet from the precomputed table for a given normalized value
 */
export const mapValueToColor = (rgbMap: RGBColor[], normalized: number) => {
  const clamped = _.clamp(normalized, 0, 1);
  const index = Math.round(clamped * (LOOKUP_TABLE_SIZE - 1));
  return rgbMap[index];
};
