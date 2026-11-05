import { describe, expect, it } from "vitest";
import { getColorAt } from "../../src/lib/utils-gradient";
import { rssiToPercentage } from "../../src/lib/utils";
import {
  defaultGradient,
  isPreviousDefaultGradient,
} from "../../src/lib/survey-defaults";

const RED = { r: 255, g: 0, b: 0, a: 0.6 };
const YELLOW = { r: 255, g: 255, b: 0, a: 0.6 };
const GREEN = { r: 0, g: 255, b: 0, a: 0.6 };

const colourAt = (percent: number) =>
  getColorAt(percent / 100, defaultGradient());
const colourAtDbm = (dbm: number) => colourAt(rssiToPercentage(dbm));

describe("default signal colours", () => {
  it("are red, yellow and green, with nothing else in the bands", () => {
    for (const p of [-10, 0, 20, 37]) expect(colourAt(p)).toStrictEqual(RED);
    for (const p of [40, 45, 50, 52]) expect(colourAt(p)).toStrictEqual(YELLOW);
    for (const p of [55, 75, 100, 110]) {
      expect(colourAt(p)).toStrictEqual(GREEN);
    }
  });

  it("turn green at -67 dBm and red below -76 dBm", () => {
    expect(colourAtDbm(-67)).toStrictEqual(GREEN);
    expect(colourAtDbm(-68)).not.toStrictEqual(GREEN);
    expect(colourAtDbm(-76)).toStrictEqual(YELLOW);
    expect(colourAtDbm(-78)).toStrictEqual(RED);
  });

  it("blend only over the short step below each threshold", () => {
    const orange = colourAt(38.5);
    expect(orange.r).toBe(255);
    expect(orange.g).toBeGreaterThan(0);
    expect(orange.g).toBeLessThan(255);
    const yellowGreen = colourAt(53.5);
    expect(yellowGreen.g).toBe(255);
    expect(yellowGreen.r).toBeGreaterThan(0);
    expect(yellowGreen.r).toBeLessThan(255);
  });

  it("never use blue", () => {
    for (let p = 0; p <= 100; p++) expect(colourAt(p).b).toBe(0);
  });
});

describe("isPreviousDefaultGradient", () => {
  const before = {
    "0": "rgba(255, 0, 0, 0.6)",
    "1": "rgba(0, 255, 0, 0.6)",
    "0.45": "rgba(255, 255, 0, 0.6)",
    "0.5": "rgba(0, 0, 255, 0.6)",
    "0.6": "rgba(0, 255, 255, 0.6)",
    "0.75": "rgba(0, 255, 0, 0.6)",
    "0.9": "rgba(0, 255, 0, 0.6)",
  };

  it("recognises the 0.9 default as saved in a survey file", () => {
    expect(isPreviousDefaultGradient(before)).toBe(true);
    expect(
      isPreviousDefaultGradient({ ...before, "0.5": "rgba(0,0,255,0.6)" }),
    ).toBe(true);
  });

  it("does not match a changed gradient or the current default", () => {
    expect(
      isPreviousDefaultGradient({ ...before, "0.5": "rgba(0, 0, 200, 0.6)" }),
    ).toBe(false);
    const { "0.9": _dropped, ...fewer } = before;
    expect(isPreviousDefaultGradient(fewer)).toBe(false);
    expect(isPreviousDefaultGradient(defaultGradient())).toBe(false);
  });
});
