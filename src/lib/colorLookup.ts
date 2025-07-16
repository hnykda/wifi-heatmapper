import _ from "lodash";

export type RGBColor = readonly [number, number, number];

const GRADIENT_STOPS: { position: number; color: RGBColor }[] = [
  { position: 0.0, color: [255, 0, 0] }, // red
  { position: 0.3, color: [255, 255, 0] }, // yellow
  { position: 0.4, color: [0, 0, 255] }, // blue
  { position: 0.6, color: [0, 255, 255] }, // cyan
  { position: 0.9, color: [0, 255, 0] }, // green
  { position: 1.0, color: [0, 255, 0] }, // green (repeated)
];

const LOOKUP_TABLE_SIZE = 256;

/**
 * Precompute a lookup table mapping normalized values [0,1] to RGB triplets
 */
export const createColorLookupTable = (): RGBColor[] => {
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
    ];

    return rgb;
  });
};

const lookupTable = Object.freeze(createColorLookupTable());

/**
 * Looks up the RGB triplet from the precomputed table for a given normalized value
 */
export const mapValueToColor = (normalized: number) => {
  const clamped = _.clamp(normalized, 0, 1);
  const index = Math.round(clamped * (LOOKUP_TABLE_SIZE - 1));
  return lookupTable[index];
};
