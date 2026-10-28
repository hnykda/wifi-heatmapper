import { describe, expect, it } from "vitest";
import {
  heatmapKey,
  isValidHeatmapRange,
  normalizeHeatmapRanges,
  resolveHeatmapRange,
  toDisplayRange,
} from "../src/lib/heatmap-scale";
import { HeatmapRanges, IperfTestProperty } from "../src/lib/types";

describe("heat map scales", () => {
  it("builds per-map keys, with one standalone signal map", () => {
    expect(heatmapKey("tcpDownload", "bitsPerSecond")).toBe(
      "tcpDownload-bitsPerSecond",
    );
    expect(heatmapKey("udpUpload", "jitterMs")).toBe("udpUpload-jitterMs");
    expect(heatmapKey("signalStrength", "signalStrength")).toBe(
      "signalStrength",
    );
  });

  it("keeps absent scales automatic, with signal fixed at 0–100", () => {
    expect(resolveHeatmapRange("bitsPerSecond", [10e6, 80e6])).toEqual({
      min: 0,
      max: 80e6,
    });
    expect(resolveHeatmapRange("signalStrength", [20, 60])).toEqual({
      min: 0,
      max: 100,
    });
  });

  it("keeps each map independent and resolves fixed bounds in raw units", () => {
    const ranges: HeatmapRanges = {
      "tcpDownload-bitsPerSecond": { enabled: true, min: 10, max: 500 },
      "tcpUpload-bitsPerSecond": { enabled: true, min: 20, max: 200 },
    };
    for (const values of [
      [1e6, 5e6],
      [200e6, 900e6],
    ]) {
      expect(
        resolveHeatmapRange(
          "bitsPerSecond",
          values,
          ranges[heatmapKey("tcpDownload", "bitsPerSecond")],
        ),
      ).toEqual({ min: 10e6, max: 500e6 });
      expect(
        resolveHeatmapRange(
          "bitsPerSecond",
          values,
          ranges[heatmapKey("tcpUpload", "bitsPerSecond")],
        ),
      ).toEqual({ min: 20e6, max: 200e6 });
      expect(
        resolveHeatmapRange(
          "bitsPerSecond",
          values,
          ranges[heatmapKey("udpDownload", "bitsPerSecond")],
        ),
      ).toEqual({ min: 0, max: Math.max(...values) });
    }
    ranges["tcpDownload-bitsPerSecond"]!.max = 600;
    expect(ranges["tcpUpload-bitsPerSecond"]!.max).toBe(200);
  });

  it.each<keyof IperfTestProperty>([
    "signalStrength",
    "jitterMs",
    "lostPackets",
    "retransmits",
    "packetsReceived",
  ])("keeps %s bounds in their original units", (property) => {
    const range = { min: 2, max: 20 };
    expect(
      resolveHeatmapRange(property, [0, 40], { ...range, enabled: true }),
    ).toEqual(range);
    expect(toDisplayRange(property, range)).toEqual(range);
  });

  it("converts automatic throughput bounds to Mbps for first-enable freezing", () => {
    const raw = resolveHeatmapRange("bitsPerSecond", [25e6, 500e6]);
    const display = toDisplayRange("bitsPerSecond", raw);
    expect(display).toEqual({ min: 0, max: 500 });
    expect(
      resolveHeatmapRange("bitsPerSecond", [900e6], {
        ...display,
        enabled: true,
      }),
    ).toEqual(raw);
    expect(raw).toEqual({ min: 0, max: 500e6 });
  });

  it.each<keyof IperfTestProperty>([
    "bitsPerSecond",
    "jitterMs",
    "lostPackets",
    "retransmits",
    "packetsReceived",
  ])(
    "uses a positive one-unit fallback for %s without usable data",
    (property) => {
      for (const values of [[], [0, 0], [-5, -1], [NaN, Infinity, -Infinity]]) {
        expect(resolveHeatmapRange(property, values)).toEqual({
          min: 0,
          max: 1,
        });
      }
      expect(resolveHeatmapRange(property, [NaN, -2, 0.25, Infinity])).toEqual({
        min: 0,
        max: 0.25,
      });
    },
  );

  it("always uses 0–100 for automatic signal, including no data", () => {
    for (const values of [[], [0], [NaN], [150]]) {
      expect(resolveHeatmapRange("signalStrength", values)).toEqual({
        min: 0,
        max: 100,
      });
    }
  });

  it("ignores disabled fixed bounds without changing the saved scale", () => {
    const scale = { enabled: false, min: 10, max: 500 };
    expect(resolveHeatmapRange("bitsPerSecond", [80e6], scale)).toEqual({
      min: 0,
      max: 80e6,
    });
    expect(scale).toEqual({ enabled: false, min: 10, max: 500 });
    expect(
      resolveHeatmapRange("bitsPerSecond", [], { ...scale, enabled: true }),
    ).toEqual({ min: 10e6, max: 500e6 });
  });

  it.each([
    undefined,
    null,
    "0–20",
    12,
    [],
    [0, 20],
    {},
    { min: "0", max: 20 },
    { min: 0, max: "20" },
    { min: 0 },
    { min: 10, max: 10 },
    { min: 10, max: 5 },
    { min: -1, max: 5 },
    { min: NaN, max: 5 },
    { min: 0, max: Infinity },
    { min: -Infinity, max: 10 },
  ])("rejects malformed or invalid bounds %j", (range) => {
    expect(isValidHeatmapRange(range, "jitterMs")).toBe(false);
    expect(normalizeHeatmapRanges({ "udpDownload-jitterMs": range })).toEqual(
      {},
    );
  });

  it("falls back to automatic for invalid enabled bounds", () => {
    expect(
      resolveHeatmapRange("jitterMs", [15], { enabled: true, min: 10, max: 5 }),
    ).toEqual({ min: 0, max: 15 });
  });

  it("rejects signal above 100%, overflowing and collapsed converted bounds", () => {
    expect(isValidHeatmapRange({ min: 0, max: 101 }, "signalStrength")).toBe(
      false,
    );
    expect(
      isValidHeatmapRange({ min: 0, max: Number.MAX_VALUE }, "bitsPerSecond"),
    ).toBe(false);
    const collapsed = { min: 1.0493999999999999, max: 1.0494 };
    expect(collapsed.max).toBeGreaterThan(collapsed.min);
    expect(collapsed.min * 1e6).toBe(collapsed.max * 1e6);
    expect(isValidHeatmapRange(collapsed, "bitsPerSecond")).toBe(false);
    expect(
      resolveHeatmapRange("bitsPerSecond", [20e6], {
        ...collapsed,
        enabled: true,
      }),
    ).toEqual({ min: 0, max: 20e6 });
    expect(
      normalizeHeatmapRanges({
        "tcpDownload-bitsPerSecond": { ...collapsed, enabled: true },
      }),
    ).toEqual({});
  });
});

describe("normalizeHeatmapRanges", () => {
  it.each([undefined, null, "ranges", 1, true, [], [{ min: 0, max: 1 }]])(
    "ignores malformed containers %j",
    (input) => {
      expect(normalizeHeatmapRanges(input)).toEqual({});
    },
  );

  it("retains enabled and disabled per-map values across serialization", () => {
    const input = {
      "tcpDownload-bitsPerSecond": { enabled: false, min: 10, max: 500 },
      "udpUpload-jitterMs": { enabled: true, min: 2, max: 20 },
      signalStrength: { enabled: false, min: 20, max: 80 },
    };
    const ranges = normalizeHeatmapRanges(input);
    expect(ranges["tcpDownload-bitsPerSecond"]).toEqual(
      input["tcpDownload-bitsPerSecond"],
    );
    expect(ranges["udpUpload-jitterMs"]).toEqual(input["udpUpload-jitterMs"]);
    expect(ranges.signalStrength).toEqual(input.signalStrength);
    expect(normalizeHeatmapRanges(JSON.parse(JSON.stringify(ranges)))).toEqual(
      ranges,
    );
    expect(ranges["tcpDownload-bitsPerSecond"]).not.toBe(
      input["tcpDownload-bitsPerSecond"],
    );
  });

  it("drops bogus combinations, missing/non-boolean flags and invalid new ranges", () => {
    const valid = { enabled: true, min: 0, max: 20 };
    expect(
      normalizeHeatmapRanges({
        "tcpDownload-jitterMs": valid,
        "tcpUpload-retransmits": valid,
        "udpDownload-retransmits": valid,
        "udpUpload-signalStrength": valid,
        "bogus-bitsPerSecond": valid,
        "signalStrength-bitsPerSecond": valid,
        unknown: valid,
        "tcpDownload-bitsPerSecond": { min: 0, max: 20 },
        "tcpUpload-bitsPerSecond": { ...valid, enabled: "false" },
        "udpDownload-jitterMs": null,
        "udpUpload-jitterMs": "0–20",
        "udpDownload-lostPackets": { ...valid, enabled: false, max: -1 },
        signalStrength: { ...valid, enabled: null },
        bitsPerSecond: { min: 0, max: 20 },
        jitterMs: { ...valid, enabled: "true" },
      }),
    ).toEqual({});
  });
});

describe("signal-to-noise ratio scale", () => {
  it("is a standalone map with a 0–50 dB automatic range", () => {
    expect(heatmapKey("snr", "snr")).toBe("snr");
    expect(resolveHeatmapRange("snr", [12, 61])).toEqual({ min: 0, max: 50 });
    expect(resolveHeatmapRange("snr", [])).toEqual({ min: 0, max: 50 });
    expect(toDisplayRange("snr", { min: 0, max: 50 })).toEqual({
      min: 0,
      max: 50,
    });
  });

  it("uses a fixed scale when enabled, in dB with no 100 cap", () => {
    expect(
      resolveHeatmapRange("snr", [30], { enabled: true, min: 10, max: 120 }),
    ).toEqual({ min: 10, max: 120 });
    expect(
      resolveHeatmapRange("snr", [30], { enabled: false, min: 10, max: 40 }),
    ).toEqual({ min: 0, max: 50 });
    expect(isValidHeatmapRange({ min: 40, max: 10 }, "snr")).toBe(false);
  });

  it("keeps a saved SNR scale across serialization", () => {
    const ranges = normalizeHeatmapRanges({
      snr: { enabled: true, min: 5, max: 45 },
    });
    expect(ranges.snr).toEqual({ enabled: true, min: 5, max: 45 });
    expect(normalizeHeatmapRanges({ snr: { min: 5, max: 45 } })).toEqual({});
  });
});
