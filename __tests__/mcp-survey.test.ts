import { describe, expect, it } from "vitest";
import {
  DEFAULT_THRESHOLDS,
  describePoint,
  stats,
  summarizeSurvey,
} from "@/mcp/survey";
import { getDefaultIperfResults, getDefaultWifiResults } from "@/lib/utils";
import type { IperfResults, SurveyPoint } from "@/lib/types";

function point(
  id: string,
  signal: number,
  bssid: string,
  opts: { tcpDownMbps?: number; enabled?: boolean; channel?: number } = {},
): SurveyPoint {
  const iperfData = JSON.parse(
    JSON.stringify(getDefaultIperfResults()), // its four tests share one object
  ) as IperfResults;
  if (opts.tcpDownMbps) {
    iperfData.tcpDownload.bitsPerSecond = opts.tcpDownMbps * 1e6;
    iperfData.tcpDownload.retransmits = 2;
    iperfData.udpDownload.bitsPerSecond = opts.tcpDownMbps * 0.9e6;
    iperfData.udpDownload.jitterMs = 0.12345;
    iperfData.udpDownload.lostPackets = 4;
    iperfData.udpDownload.packetsReceived = 1000;
  }
  return {
    id,
    x: 10.04,
    y: 20,
    isEnabled: opts.enabled ?? true,
    timestamp: Date.UTC(2026, 9, 1, 12, 0, 0),
    wifiData: {
      ...getDefaultWifiResults(),
      ssid: "Home",
      bssid,
      signalStrength: signal,
      rssi: -100 + (signal / 100) * 60,
      channel: opts.channel ?? 36,
      band: 5,
    },
    iperfData,
  };
}

const mapping = [
  { apName: "Living room", macAddress: "aabbccddee01" },
  { apName: "Office (all bands)", macAddress: "112233445*" },
];

describe("describePoint", () => {
  it("converts units, names the AP and marks tests that did not run", () => {
    const r = describePoint(
      point("Point_1", 70, "AA:BB:CC:DD:EE:01", { tcpDownMbps: 312.345 }),
      mapping,
    );
    expect(r).toMatchObject({
      id: "Point_1",
      x: 10,
      y: 20,
      enabled: true,
      measuredAt: "2026-10-01T12:00:00.000Z",
      apName: "Living room",
      signalPercent: 70,
      tcpDownload: { mbps: 312.35, retransmits: 2 },
      udpDownload: {
        mbps: 281.11,
        jitterMs: 0.123,
        lostPackets: 4,
        packetsReceived: 1000,
      },
      tcpUpload: null,
      udpUpload: null,
    });
  });

  it("uses BSSID prefixes from the AP mapping (apNameFor)", () => {
    expect(describePoint(point("p", 50, "112233445566"), mapping).apName).toBe(
      "Office (all bands)",
    );
    expect(describePoint(point("p", 50, "ffffffffffff"), mapping).apName).toBe(
      null,
    );
  });
});

describe("stats", () => {
  it("gives min/median/max of finite values", () => {
    expect(stats([3, 1, 2])).toEqual({ count: 3, min: 1, median: 2, max: 3 });
    expect(stats([4, 1, 3, 2])?.median).toBe(2.5);
    expect(stats([NaN, 5])).toEqual({ count: 1, min: 5, median: 5, max: 5 });
    expect(stats([])).toBeNull();
  });
});

describe("summarizeSurvey", () => {
  const records = [
    point("A", 90, "aabbccddee01", { tcpDownMbps: 400 }),
    point("B", 60, "aabbccddee01", { tcpDownMbps: 20 }),
    point("C", 40, "112233445566", { channel: 1 }),
    point("D", 10, "112233445566", { tcpDownMbps: 2, channel: 6 }),
    point("E", 5, "aabbccddee01", { tcpDownMbps: 1, enabled: false }),
  ].map((p) => describePoint(p, mapping));

  const summary = summarizeSurvey(records);

  it("counts points and leaves disabled ones out", () => {
    expect(summary).toMatchObject({
      points: 5,
      enabledPoints: 4,
      disabledPoints: 1,
      throughputMeasuredPoints: 3,
      thresholds: DEFAULT_THRESHOLDS,
    });
    expect(summary.metrics.signalPercent).toEqual({
      count: 4,
      min: 10,
      median: 50,
      max: 90,
      unit: "%",
    });
    // C has no throughput: left out, not counted as 0
    expect(summary.metrics.tcpDownloadMbps).toMatchObject({
      count: 3,
      min: 2,
      median: 20,
      max: 400,
    });
    expect(summary.metrics.tcpUploadMbps).toBeNull();
  });

  it("lists dead-zone, weak and slow points", () => {
    expect(summary.deadZonePointIds).toEqual(["D"]);
    expect(summary.weakSignalPointIds).toEqual(["C"]);
    expect(summary.slowDownloadPointIds).toEqual(["B", "D"]);
    const custom = summarizeSurvey(records, {
      weakSignalPercent: 70,
      deadSignalPercent: 50,
      slowDownloadMbps: 10,
    });
    expect(custom.deadZonePointIds).toEqual(["C", "D"]);
    expect(custom.weakSignalPointIds).toEqual(["B"]);
    expect(custom.slowDownloadPointIds).toEqual(["D"]);
  });

  it("groups access points by BSSID with point counts", () => {
    expect(summary.accessPoints).toEqual([
      {
        bssid: "aabbccddee01",
        apName: "Living room",
        ssid: "Home",
        bandGHz: 5,
        channels: [36],
        points: 2,
        medianSignalPercent: 75,
      },
      {
        bssid: "112233445566",
        apName: "Office (all bands)",
        ssid: "Home",
        bandGHz: 5,
        channels: [1, 6],
        points: 2,
        medianSignalPercent: 25,
      },
    ]);
  });
});
