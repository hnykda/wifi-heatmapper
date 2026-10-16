import { describe, expect, it } from "vitest";
import {
  createHeatmapInterpolator,
  prepareHeatmapGPUData,
} from "../src/lib/heatmap-interpolation";

const points = (a: number, b: number) => [
  { x: 0, y: 0, value: a },
  { x: 4, y: 0, value: b },
];

describe("CPU raw IDW interpolation", () => {
  it("preserves negative and positive outlier influence before clamping", () => {
    const interpolate = createHeatmapInterpolator(points(-100, 200), {
      min: 20,
      max: 100,
    });
    expect(interpolate(2, 0, 100)).toBeCloseTo(0.375);
    expect(interpolate(0, 0, 100)).toBe(0);
    expect(interpolate(4, 0, 100)).toBe(1);
    expect(interpolate(2, 0, 1)).toBeNull();
  });

  it("uses d^-3 weights, radius exclusion, and the existing exact-hit rule", () => {
    const interpolate = createHeatmapInterpolator(points(0, 100), {
      min: 0,
      max: 100,
    });
    expect(interpolate(1, 0, 100)).toBeCloseTo(1 / 28);
    expect(interpolate(1, 0, 2)).toBe(0);
    expect(interpolate(4.0001, 0, 0)).toBe(1);
  });

  it("retains narrow spans at large offsets", () => {
    const interpolate = createHeatmapInterpolator(points(1e9, 1e9 + 2), {
      min: 1e9,
      max: 1e9 + 2,
    });
    expect(interpolate(2, 0, 100)).toBe(0.5);
  });

  it("keeps a narrow packet range despite a distant outlier", () => {
    const data = [...points(0, 1), { x: 100, y: 100, value: 1e6 }];
    const range = { min: 0, max: 1 };
    expect(prepareHeatmapGPUData(data, range)).toBeNull();
    const interpolate = createHeatmapInterpolator(data, range);
    expect(interpolate(2, 0, 5)).toBe(0.5);
    expect(interpolate(2, 0, 1000)).toBe(1);
  });

  it("rejects unrepresentable differences rather than producing invalid colours", () => {
    expect(() =>
      createHeatmapInterpolator(points(-Number.MAX_VALUE, Number.MAX_VALUE), {
        min: -Number.MAX_VALUE,
        max: Number.MAX_VALUE,
      }),
    ).toThrow(RangeError);
  });
});
