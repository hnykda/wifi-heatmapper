import { describe, expect, it } from "vitest";
import {
  apNameFor,
  formatApPattern,
  isValidApPattern,
} from "../src/lib/apName";
import { ApMapping } from "../src/lib/types";

const bssid = "9e05d696e830";

describe("apNameFor", () => {
  it("matches an exact BSSID", () => {
    expect(
      apNameFor(bssid, [{ apName: "Living room", macAddress: bssid }]),
    ).toBe("Living room");
  });

  it("matches a prefix ending in *", () => {
    const mapping = [{ apName: "Kitchen", macAddress: "9e05d696e8*" }];
    expect(apNameFor("9e05d696e830", mapping)).toBe("Kitchen");
    expect(apNameFor("9e05d696e8ff", mapping)).toBe("Kitchen");
    expect(apNameFor("9e05d696e930", mapping)).toBeUndefined();
  });

  it("ignores separators and case on both sides", () => {
    expect(
      apNameFor("9E-05-D6-96-E8-30", [
        { apName: "Exact", macAddress: "9e:05:d6:96:e8:30" },
      ]),
    ).toBe("Exact");
    expect(
      apNameFor("9e:05:d6:96:e8:30", [
        { apName: "Prefix", macAddress: "9E-05-D6-96-E8-*" },
      ]),
    ).toBe("Prefix");
  });

  it("prefers an exact match over a prefix", () => {
    const mapping: ApMapping[] = [
      { apName: "Prefix", macAddress: "9e05d696e8*" },
      { apName: "Exact", macAddress: bssid },
    ];
    expect(apNameFor(bssid, mapping)).toBe("Exact");
  });

  it("prefers the longest matching prefix", () => {
    const mapping: ApMapping[] = [
      { apName: "Short", macAddress: "9e05*" },
      { apName: "Long", macAddress: "9e05d696e8*" },
      { apName: "Middle", macAddress: "9e05d6*" },
    ];
    expect(apNameFor(bssid, mapping)).toBe("Long");
  });

  it("returns undefined when nothing matches", () => {
    expect(
      apNameFor(bssid, [{ apName: "Other", macAddress: "112233445566" }]),
    ).toBeUndefined();
  });

  it("returns undefined for an empty mapping or BSSID", () => {
    expect(apNameFor(bssid, [])).toBeUndefined();
    expect(apNameFor("", [{ apName: "A", macAddress: "9e*" }])).toBeUndefined();
  });

  it("does not treat * in the middle as a wildcard", () => {
    expect(
      apNameFor(bssid, [{ apName: "Middle", macAddress: "9e*5d696e830" }]),
    ).toBeUndefined();
  });
});

describe("isValidApPattern", () => {
  it("accepts full MAC addresses and prefixes ending in *", () => {
    expect(isValidApPattern("9E:05:D6:96:E8:30")).toBe(true);
    expect(isValidApPattern("9E:05:D6:96:E8:*")).toBe(true);
    expect(isValidApPattern("9e05d*")).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isValidApPattern("*")).toBe(false);
    expect(isValidApPattern("9e:*:30")).toBe(false);
    expect(isValidApPattern("9e05d696e830*")).toBe(false);
    expect(isValidApPattern("not a mac")).toBe(false);
  });
});

describe("formatApPattern", () => {
  it("formats full addresses and prefixes", () => {
    expect(formatApPattern("9e05d696e830")).toBe("9E-05-D6-96-E8-30");
    expect(formatApPattern("9e:05:d6:96:e8:*")).toBe("9E-05-D6-96-E8-*");
    expect(formatApPattern("9e05d*")).toBe("9E-05-D-*");
  });
});
