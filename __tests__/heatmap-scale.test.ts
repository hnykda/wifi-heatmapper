import { describe, expect, it } from "vitest";
import {
  isValidHeatmapRange,
  resolveHeatmapRange,
} from "../src/lib/heatmap-scale";

describe("heat map scales", () => {
  it("keeps old surveys automatic, with signal fixed at 0–100", () => {
    expect(resolveHeatmapRange("bitsPerSecond", [10e6, 80e6])).toEqual({
      min: 0,
      max: 80e6,
    });
    expect(resolveHeatmapRange("signalStrength", [20, 60])).toEqual({
      min: 0,
      max: 100,
    });
  });

  it("uses identical fixed bounds across surveys, in raw measurement units", () => {
    const ranges = {
      bitsPerSecond: { min: 10, max: 500 },
      jitterMs: { min: 2, max: 20 },
    };
    for (const values of [
      [1e6, 5e6],
      [200e6, 900e6],
    ]) {
      expect(resolveHeatmapRange("bitsPerSecond", values, ranges)).toEqual({
        min: 10e6,
        max: 500e6,
      });
    }
    expect(resolveHeatmapRange("jitterMs", [0, 40], ranges)).toEqual({
      min: 2,
      max: 20,
    });
    expect(
      resolveHeatmapRange("signalStrength", [10, 90], {
        signalStrength: { min: 20, max: 80 },
      }),
    ).toEqual({ min: 20, max: 80 });
  });

  it("handles empty, zero and non-finite data without a zero-width scale", () => {
    for (const values of [[], [0, 0], [NaN, Infinity, -Infinity]]) {
      expect(resolveHeatmapRange("jitterMs", values)).toEqual({
        min: 0,
        max: 1e-9,
      });
    }
  });

  it.each([
    { min: 10, max: 10 },
    { min: 10, max: 5 },
    { min: -1, max: 5 },
    { min: NaN, max: 5 },
    { min: 0, max: Infinity },
  ])("rejects invalid bounds %j and falls back to automatic", (range) => {
    expect(isValidHeatmapRange(range, "jitterMs")).toBe(false);
    expect(resolveHeatmapRange("jitterMs", [15], { jitterMs: range })).toEqual({
      min: 0,
      max: 15,
    });
  });

  it("rejects signal above 100% and overflowing Mbps bounds", () => {
    expect(isValidHeatmapRange({ min: 0, max: 101 }, "signalStrength")).toBe(
      false,
    );
    expect(
      isValidHeatmapRange({ min: 0, max: Number.MAX_VALUE }, "bitsPerSecond"),
    ).toBe(false);
  });
});
