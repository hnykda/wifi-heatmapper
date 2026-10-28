import { describe, expect, it } from "vitest";
import {
  computeHeatmapGrid,
  heatmapPoints,
  idwValueAt,
  influenceRadius,
  isGridHeatmapKey,
  parseHeatmapKey,
  toDisplayUnits,
} from "@/lib/heatmap-grid";
import { calculateRadiusByBoundingBox } from "@/lib/radiusCalculations";
import { getDefaultIperfResults, getDefaultWifiResults } from "@/lib/utils";
import type { IperfResults, SurveyPoint } from "@/lib/types";

function point(
  id: string,
  x: number,
  y: number,
  signal: number,
  tcpDownMbps = 0,
  isEnabled = true,
): SurveyPoint {
  const iperfData = JSON.parse(
    JSON.stringify(getDefaultIperfResults()), // its four tests share one object
  ) as IperfResults;
  iperfData.tcpDownload.bitsPerSecond = tcpDownMbps * 1e6;
  iperfData.tcpDownload.retransmits = 3;
  return {
    id,
    x,
    y,
    isEnabled,
    timestamp: 0,
    wifiData: { ...getDefaultWifiResults(), signalStrength: signal },
    iperfData,
  };
}

describe("idwValueAt (mirrors the fragment shader)", () => {
  const pts = [
    { x: 0, y: 0, value: 100 },
    { x: 30, y: 0, value: 10 },
  ];

  it("takes a point's own value on top of it", () => {
    expect(idwValueAt(pts, 0, 0, 50)).toBe(100);
    expect(idwValueAt(pts, 30, 0, 50)).toBe(10);
  });

  it("averages points at equal distance", () => {
    expect(idwValueAt(pts, 15, 0, 50)).toBeCloseTo(55, 10);
  });

  it("weights by 1/d^3", () => {
    // d = 10 and 20: weights 1/1000 and 1/8000
    const w1 = 1 / 1000;
    const w2 = 1 / 8000;
    expect(idwValueAt(pts, 10, 0, 50)).toBeCloseTo(
      (w1 * 100 + w2 * 10) / (w1 + w2),
      10,
    );
  });

  it("ignores points beyond the radius, null when none is within it", () => {
    expect(idwValueAt(pts, 10, 0, 15)).toBe(100); // only the first counts
    expect(idwValueAt(pts, 15, 100, 50)).toBeNull();
    expect(idwValueAt([], 0, 0, 50)).toBeNull();
  });

  it("includes a point exactly at the radius, like the shader", () => {
    expect(idwValueAt([{ x: 0, y: 0, value: 7 }], 20, 0, 20)).toBe(7);
  });
});

describe("computeHeatmapGrid", () => {
  it("puts `cells` along the longer side and samples cell centres", () => {
    const grid = computeHeatmapGrid({
      points: [{ x: 50, y: 25, value: 1 }],
      width: 200,
      height: 100,
      radius: 1000,
      cells: 4,
    });
    expect(grid.columns).toBe(4);
    expect(grid.rows).toBe(2);
    expect(grid.cellWidth).toBe(50);
    expect(grid.cellHeight).toBe(50);
    expect(grid.x).toEqual([25, 75, 125, 175]);
    expect(grid.y).toEqual([25, 75]);
    expect(grid.values.every((row) => row.every((v) => v === 1))).toBe(true);
  });

  it("handles portrait plans", () => {
    const grid = computeHeatmapGrid({
      points: [],
      width: 100,
      height: 300,
      radius: 10,
      cells: 6,
    });
    expect([grid.columns, grid.rows]).toEqual([2, 6]);
    expect(grid.values.flat().every((v) => v === null)).toBe(true);
  });

  it("is null outside every point's radius and rounds values", () => {
    const grid = computeHeatmapGrid({
      points: [
        { x: 5, y: 5, value: 10 },
        { x: 15, y: 5, value: 20 },
      ],
      width: 40,
      height: 10,
      radius: 6,
      cells: 4,
      round: Math.round,
    });
    expect(grid.values).toEqual([[10, 20, null, null]]);
  });
});

describe("heatmapPoints and influenceRadius (mirror Heatmaps.tsx)", () => {
  const points = [
    point("a", 0, 0, 80, 300),
    point("b", 100, 0, 40, 0), // throughput not measured
    point("c", 0, 100, 60, 120),
    point("d", 100, 100, 10, 50, false), // disabled
  ];

  it("uses enabled points; throughput only where the test ran", () => {
    expect(heatmapPoints(points, "signalStrength").map((p) => p.value)).toEqual(
      [80, 40, 60],
    );
    expect(
      heatmapPoints(points, "tcpDownload-bitsPerSecond").map((p) => p.value),
    ).toEqual([300e6, 120e6]);
    expect(
      heatmapPoints(points, "tcpDownload-retransmits").map((p) => p.value),
    ).toEqual([3, 3]);
  });

  it("uses the saved radius or the automatic one over enabled points", () => {
    expect(
      influenceRadius({ radiusDivider: 42, surveyPoints: points }),
    ).toEqual({ radius: 42, automatic: false });
    const enabled = points.filter((p) => p.isEnabled);
    expect(
      influenceRadius({ radiusDivider: null, surveyPoints: points }),
    ).toEqual({
      radius: Math.round(calculateRadiusByBoundingBox(enabled)),
      automatic: true,
    });
  });

  it("knows the map keys and units", () => {
    expect(isGridHeatmapKey("udpUpload-jitterMs")).toBe(true);
    expect(isGridHeatmapKey("tcpUpload-jitterMs")).toBe(false);
    expect(parseHeatmapKey("udpDownload-lostPackets")).toEqual({
      metric: "udpDownload",
      property: "lostPackets",
    });
    expect(toDisplayUnits("bitsPerSecond", 12_500_000)).toBe(12.5);
    expect(toDisplayUnits("jitterMs", 1.5)).toBe(1.5);
  });
});
