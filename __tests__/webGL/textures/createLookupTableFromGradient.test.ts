import {
  rgbaToRGB,
  createLookupTableFromGradient,
} from "../../../src/app/webGL/shaders/createLookupTableFromGradient";

import { Gradient } from "@/lib/types";
import { describe, it, expect } from "vitest";

describe("rgbaToRGB", () => {
  it("parses standard rgba string", () => {
    expect(rgbaToRGB("rgba(255, 128, 64, 0.5)")).toEqual([255, 128, 64, 0.5]);
  });

  it("parses rgb string", () => {
    expect(rgbaToRGB("rgb(10, 20, 30)")).toEqual([10, 20, 30, NaN]); // alpha missing
  });

  it("handles invalid input gracefully", () => {
    expect(rgbaToRGB("not-a-color")).toEqual([0, 0, 0, 0]);
  });
});

describe("createLookupTableFromGradient", () => {
  const basicGradient: Gradient = {
    0.0: "rgba(0, 0, 0, 1)",
    1.0: "rgba(255, 255, 255, 1)",
  };

  it("returns array of 256 colors", () => {
    const lut = createLookupTableFromGradient(basicGradient);
    expect(lut).toHaveLength(256);
  });

  it("interpolates correctly at ends", () => {
    const lut = createLookupTableFromGradient(basicGradient);
    expect(lut[0]).toEqual([0, 0, 0, 1]);
    expect(lut[255]).toEqual([255, 255, 255, 1]);
  });

  it("interpolates midpoints correctly", () => {
    const lut = createLookupTableFromGradient(basicGradient);
    expect(lut[128][0]).toBeGreaterThan(120); // R ~127+
    expect(lut[128][0]).toBeLessThan(135);
  });

  it("clamps when no matching stop", () => {
    const edgeGradient: Gradient = {
      0.5: "rgba(100, 100, 100, 1)",
    };
    const lut = createLookupTableFromGradient(edgeGradient);
    expect(lut[0]).toEqual([100, 100, 100, 1]);
    expect(lut[255]).toEqual([100, 100, 100, 1]);
  });
});
