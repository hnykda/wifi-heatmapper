/**
 * Utility functions for computing gradients and handling colors
 */

import { Gradient } from "./types";
export type RGBA = { r: number; g: number; b: number; a: number };

/**
 * Converts a (string) "rgba(r,g,b,a)" to {r, g, b, a} object.
 * e.g., the gradient has items like this:
 * { ... 0: "rgba(255, 0, 0, 0.6)", // 0%, -100 dBm ... }
 */
export function rgbaStringToObject(rgba: string): RGBA {
  const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d.]+)?\)/);

  if (!match) return { r: 0, g: 0, b: 0, a: 1.0 }; // Invalid input - black

  return {
    r: parseInt(match[1], 10),
    g: parseInt(match[2], 10),
    b: parseInt(match[3], 10),
    a: match[4] !== undefined ? parseFloat(match[4]) : 1, // Default alpha to 1 if missing
  };
}

/**
 * objectToRGBAString() - convert an object back to a string
 * @param color { r, g, b, a}
 * @returns string "rgba(r,g,b,a)"
 */
export function objectToRGBAString(color: RGBA): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a.toFixed(2)})`;
}

/**
 * Interpolates between two RGBA colors.
 */
export function interpolateColor(
  color1: RGBA,
  color2: RGBA,
  factor: number,
): RGBA {
  return {
    r: Math.round(color1.r + (color2.r - color1.r) * factor),
    g: Math.round(color1.g + (color2.g - color1.g) * factor),
    b: Math.round(color1.b + (color2.b - color1.b) * factor),
    a: color1.a + (color2.a - color1.a) * factor,
  };
}

/**
 * Returns the interpolated RGBA color for a given value (0-1) from a gradient.
 */
export function getColorAt(value: number, gradient: Gradient): RGBA {
  // sort the keys to be in increasing order
  // console.log(`gradient before sort: ${JSON.stringify(gradient)}`);
  // Make a sorted array of entries, largest to smallest
  const sortedArray = Object.entries(gradient)
    .map(([k, v]) => [Number(k), v] as [number, string])
    .sort((a, b) => b[0] - a[0]);

  // Constrain theValue to be 0..1
  const theValue = Math.min(1.0, Math.max(0.0, value));

  const arrayLength = sortedArray.length;

  // set the return value to the last element
  let returnVal = rgbaStringToObject(sortedArray[arrayLength - 1][1]);

  // loop through the array to see if it's in the middle
  for (let i = 0; i < arrayLength - 1; i++) {
    const upperVal = sortedArray[i][0];
    const lowerVal = sortedArray[i + 1][0];
    // console.log(`i/upper/lower: ${i} ${upperVal} ${lowerVal}`);
    if (theValue >= lowerVal && theValue <= upperVal) {
      const factor = (upperVal - theValue) / (upperVal - lowerVal);
      const color1 = rgbaStringToObject(sortedArray[i][1]);
      const color2 = rgbaStringToObject(sortedArray[i + 1][1]);

      returnVal = interpolateColor(color1, color2, factor);
      break;
    }
  }

  return returnVal;
}

export const rgbaToHex = (rgba: string) => {
  const parts = rgba.match(/[\d.]+/g);
  if (!parts || parts.length < 3) return "#000000";

  const r = parseInt(parts[0]);
  const g = parseInt(parts[1]);
  const b = parseInt(parts[2]);

  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
};

export const hexToRgba = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
