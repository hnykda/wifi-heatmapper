/**
 * A speed test that did not run is null; one that ran and got nothing
 * through is a real 0 Mbps. Every reader keeps the two apart.
 */
import { describe, expect, it } from "vitest";
import { surveyPointsToCsv } from "@/lib/exportCsv";
import { heatmapPoints } from "@/lib/heatmap-grid";
import { hasSpeedData } from "@/lib/measurement-mode";
import { describePoint, summarizeSurvey } from "@/mcp/survey";
import { plainResult } from "@/mcp/measure";
import {
  extractIperfResults,
  getDefaultIperfResults,
  getDefaultWifiResults,
  iperfTestResult,
} from "@/lib/utils";
import type { SurveyPoint } from "@/lib/types";

const point = (
  id: string,
  iperfData: Partial<SurveyPoint["iperfData"]>,
): SurveyPoint => ({
  id,
  x: 10,
  y: 20,
  isEnabled: true,
  timestamp: Date.UTC(2026, 9, 1),
  wifiData: {
    ...getDefaultWifiResults(),
    ssid: "Home",
    signalStrength: 30,
    rssi: -80,
  },
  iperfData: { ...getDefaultIperfResults(), ...iperfData },
});

const notMeasured = point("Point_1", {});
const deadSpot = point("Point_2", {
  tcpDownload: iperfTestResult(0),
  tcpUpload: iperfTestResult(0),
});
const partial = point("Point_3", { tcpDownload: iperfTestResult(123.456e6) });

describe("not measured vs. measured 0 Mbps", () => {
  it("hasSpeedData", () => {
    expect(hasSpeedData(notMeasured)).toBe(false);
    expect(hasSpeedData(deadSpot)).toBe(true);
    expect(hasSpeedData(partial)).toBe(true);
  });

  it("heat maps: a 0 is mapped, a null is left out", () => {
    const values = heatmapPoints(
      [notMeasured, deadSpot, partial],
      "tcpDownload-bitsPerSecond",
    ).map((p) => p.value);
    expect(values).toEqual([0, 123.456e6]);
  });

  it("CSV: empty cells for null, 0 for a measured 0", () => {
    const [header, ...rows] = surveyPointsToCsv(
      [notMeasured, deadSpot, partial],
      [],
    )
      .trim()
      .split("\n")
      .map((line) => line.split(","));
    const col = (name: string) => header.indexOf(name);
    const speeds = rows.map((r) =>
      [
        "tcp_download_mbps",
        "tcp_upload_mbps",
        "udp_download_mbps",
        "udp_upload_mbps",
      ].map((c) => r[col(c)]),
    );
    expect(speeds).toEqual([
      ["", "", "", ""],
      ["0", "0", "", ""],
      ["123.46", "", "", ""],
    ]);
    // unreported Wi-Fi values (0 in the file) are empty too
    expect(rows[0][col("channel")]).toBe("");
    expect(rows[0][col("tx_rate_mbps")]).toBe("");
  });

  it("MCP: null for not measured, mbps 0 for a dead spot", () => {
    const records = [notMeasured, deadSpot, partial].map((p) =>
      describePoint(p, []),
    );
    expect(records[0].tcpDownload).toBeNull();
    expect(records[1].tcpDownload).toEqual({ mbps: 0, retransmits: 0 });
    expect(records[2].tcpUpload).toBeNull();
    expect(records[0].channel).toBeNull();

    const summary = summarizeSurvey(records);
    expect(summary.throughputMeasuredPoints).toBe(2);
    expect(summary.metrics.tcpDownloadMbps).toMatchObject({ count: 2, min: 0 });
    // a dead spot is slow; a point without a test is not
    expect(summary.slowDownloadPointIds).toEqual(["Point_2"]);

    expect(plainResult(records[1])).toContain("download 0 Mbps, upload 0 Mbps");
    expect(plainResult(records[2])).toContain("upload not measured");
    expect(plainResult(records[0])).not.toContain("download");
  });

  it("iperf3: 0 bit/s is a result, 0 lost packets is a value", () => {
    const result = extractIperfResults(
      {
        end: {
          sum: {
            bits_per_second: 0,
            jitter_ms: 0,
            lost_packets: 0,
            packets: 0,
          },
        },
      },
      true,
    );
    expect(result).toMatchObject({
      bitsPerSecond: 0,
      jitterMs: 0,
      lostPackets: 0,
      packetsReceived: 0,
    });
  });
});
