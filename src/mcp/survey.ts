/**
 * survey.ts - turn a survey file into what an agent needs to read it:
 * one compact record per point and a summary (min/median/max per metric,
 * weak points, access points seen). Pure functions.
 */
import type {
  ApMapping,
  IperfResults,
  IperfTestProperty,
  SurveyPoint,
} from "../lib/types";
import { apNameFor } from "../lib/apName";
import { snrOf, validNoise } from "../lib/utils";

const round = (value: number, digits = 1) => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

export interface PointTest {
  mbps: number;
  jitterMs?: number | null;
  lostPackets?: number | null;
  packetsReceived?: number | null;
  retransmits?: number;
}

export interface PointRecord {
  id: string;
  x: number;
  y: number;
  enabled: boolean;
  measuredAt: string | null;
  ssid: string;
  bssid: string;
  apName: string | null;
  signalPercent: number;
  rssiDbm: number;
  /** dBm, or null where the platform reports no noise (Windows) */
  noiseDbm: number | null;
  /** RSSI minus noise, in dB */
  snrDb: number | null;
  channel: number;
  bandGHz: number;
  channelWidthMHz: number;
  txRateMbps: number;
  phyMode: string;
  security: string;
  /** null when that test did not run (no iperf3 server, or it failed). */
  tcpDownload: PointTest | null;
  tcpUpload: PointTest | null;
  udpDownload: PointTest | null;
  udpUpload: PointTest | null;
}

function describeTest(
  test: IperfTestProperty | undefined,
  kind: "tcp" | "udp",
): PointTest | null {
  if (!test || !test.bitsPerSecond) return null;
  const out: PointTest = { mbps: round(test.bitsPerSecond / 1e6, 2) };
  if (kind === "tcp") {
    if (typeof test.retransmits === "number") {
      out.retransmits = test.retransmits;
    }
  } else {
    out.jitterMs =
      typeof test.jitterMs === "number" ? round(test.jitterMs, 3) : null;
    out.lostPackets = test.lostPackets;
    out.packetsReceived = test.packetsReceived;
  }
  return out;
}

export function describePoint(
  point: SurveyPoint,
  apMapping: ApMapping[] | undefined,
): PointRecord {
  const w = point.wifiData ?? ({} as SurveyPoint["wifiData"]);
  const iperf = point.iperfData ?? ({} as IperfResults);
  return {
    id: point.id,
    x: round(point.x),
    y: round(point.y),
    enabled: point.isEnabled !== false,
    measuredAt:
      typeof point.timestamp === "number" && point.timestamp > 0
        ? new Date(point.timestamp).toISOString()
        : null,
    ssid: w.ssid ?? "",
    bssid: w.bssid ?? "",
    apName: apNameFor(w.bssid, apMapping) ?? null,
    signalPercent: w.signalStrength,
    rssiDbm: w.rssi,
    noiseDbm: validNoise(w.noise),
    snrDb: snrOf(w),
    channel: w.channel,
    bandGHz: w.band,
    channelWidthMHz: w.channelWidth,
    txRateMbps: w.txRate,
    phyMode: w.phyMode ?? "",
    security: w.security ?? "",
    tcpDownload: describeTest(iperf.tcpDownload, "tcp"),
    tcpUpload: describeTest(iperf.tcpUpload, "tcp"),
    udpDownload: describeTest(iperf.udpDownload, "udp"),
    udpUpload: describeTest(iperf.udpUpload, "udp"),
  };
}

export interface Stats {
  count: number;
  min: number;
  median: number;
  max: number;
}

export function stats(values: number[], digits = 1): Stats | null {
  const v = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  const median = v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  return {
    count: v.length,
    min: round(v[0], digits),
    median: round(median, digits),
    max: round(v[v.length - 1], digits),
  };
}

export interface SummaryThresholds {
  /** Signal below this (%) is weak. 50% is about -70 dBm. */
  weakSignalPercent: number;
  /** Signal below this (%) is a dead zone. 25% is about -85 dBm. */
  deadSignalPercent: number;
  /** TCP download below this (Mbps) is slow. */
  slowDownloadMbps: number;
}

export const DEFAULT_THRESHOLDS: SummaryThresholds = {
  weakSignalPercent: 50,
  deadSignalPercent: 25,
  slowDownloadMbps: 25,
};

/** Metrics summarised, with how to read each from a point record. */
const METRICS: {
  key: string;
  unit: string;
  digits: number;
  read: (p: PointRecord) => number | null | undefined;
}[] = [
  { key: "signalPercent", unit: "%", digits: 0, read: (p) => p.signalPercent },
  { key: "rssiDbm", unit: "dBm", digits: 0, read: (p) => p.rssiDbm },
  { key: "noiseDbm", unit: "dBm", digits: 0, read: (p) => p.noiseDbm },
  { key: "snrDb", unit: "dB", digits: 0, read: (p) => p.snrDb },
  {
    key: "tcpDownloadMbps",
    unit: "Mbps",
    digits: 1,
    read: (p) => p.tcpDownload?.mbps,
  },
  {
    key: "tcpUploadMbps",
    unit: "Mbps",
    digits: 1,
    read: (p) => p.tcpUpload?.mbps,
  },
  {
    key: "udpDownloadMbps",
    unit: "Mbps",
    digits: 1,
    read: (p) => p.udpDownload?.mbps,
  },
  {
    key: "udpUploadMbps",
    unit: "Mbps",
    digits: 1,
    read: (p) => p.udpUpload?.mbps,
  },
  {
    key: "tcpDownloadRetransmits",
    unit: "count",
    digits: 0,
    read: (p) => p.tcpDownload?.retransmits,
  },
  {
    key: "udpDownloadJitterMs",
    unit: "ms",
    digits: 2,
    read: (p) => p.udpDownload?.jitterMs,
  },
  {
    key: "udpUploadJitterMs",
    unit: "ms",
    digits: 2,
    read: (p) => p.udpUpload?.jitterMs,
  },
  {
    key: "udpDownloadLostPackets",
    unit: "count",
    digits: 0,
    read: (p) => p.udpDownload?.lostPackets,
  },
  {
    key: "udpUploadLostPackets",
    unit: "count",
    digits: 0,
    read: (p) => p.udpUpload?.lostPackets,
  },
];

export interface AccessPointSeen {
  bssid: string;
  apName: string | null;
  ssid: string;
  bandGHz: number;
  channels: number[];
  points: number;
  medianSignalPercent: number | null;
}

export interface SurveySummary {
  points: number;
  enabledPoints: number;
  disabledPoints: number;
  throughputMeasuredPoints: number;
  thresholds: SummaryThresholds;
  metrics: Record<string, (Stats & { unit: string }) | null>;
  deadZonePointIds: string[];
  weakSignalPointIds: string[];
  slowDownloadPointIds: string[];
  accessPoints: AccessPointSeen[];
  firstMeasuredAt: string | null;
  lastMeasuredAt: string | null;
}

/**
 * summarizeSurvey() - over enabled points only, like the heat maps.
 * A throughput test that did not run is left out (not counted as 0).
 */
export function summarizeSurvey(
  records: PointRecord[],
  thresholds: SummaryThresholds = DEFAULT_THRESHOLDS,
): SurveySummary {
  const enabled = records.filter((p) => p.enabled);

  const metrics: SurveySummary["metrics"] = {};
  for (const m of METRICS) {
    const values = enabled
      .map(m.read)
      .filter((v): v is number => typeof v === "number");
    const s = stats(values, m.digits);
    metrics[m.key] = s ? { ...s, unit: m.unit } : null;
  }

  const byBssid = new Map<string, PointRecord[]>();
  for (const p of enabled) {
    const key = p.bssid || "(unknown)";
    byBssid.set(key, [...(byBssid.get(key) ?? []), p]);
  }
  const accessPoints: AccessPointSeen[] = [...byBssid.entries()]
    .map(([bssid, pts]) => ({
      bssid,
      apName: pts[0].apName,
      ssid: pts[0].ssid,
      bandGHz: pts[0].bandGHz,
      channels: [...new Set(pts.map((p) => p.channel))].sort((a, b) => a - b),
      points: pts.length,
      medianSignalPercent:
        stats(
          pts.map((p) => p.signalPercent),
          0,
        )?.median ?? null,
    }))
    .sort((a, b) => b.points - a.points);

  const times = enabled
    .map((p) => p.measuredAt)
    .filter((t): t is string => !!t)
    .sort();

  return {
    points: records.length,
    enabledPoints: enabled.length,
    disabledPoints: records.length - enabled.length,
    throughputMeasuredPoints: enabled.filter(
      (p) => p.tcpDownload || p.tcpUpload || p.udpDownload || p.udpUpload,
    ).length,
    thresholds,
    metrics,
    deadZonePointIds: enabled
      .filter((p) => p.signalPercent < thresholds.deadSignalPercent)
      .map((p) => p.id),
    weakSignalPointIds: enabled
      .filter(
        (p) =>
          p.signalPercent >= thresholds.deadSignalPercent &&
          p.signalPercent < thresholds.weakSignalPercent,
      )
      .map((p) => p.id),
    slowDownloadPointIds: enabled
      .filter(
        (p) =>
          p.tcpDownload && p.tcpDownload.mbps < thresholds.slowDownloadMbps,
      )
      .map((p) => p.id),
    accessPoints,
    firstMeasuredAt: times[0] ?? null,
    lastMeasuredAt: times[times.length - 1] ?? null,
  };
}
