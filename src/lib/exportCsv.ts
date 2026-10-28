import { apNameFor } from "./apName";
import { ApMapping, IperfTestProperty, SurveyPoint } from "./types";
import { snrOf, validNoise } from "./utils";

/** Mbps of a test, or "" (an empty cell) when it did not run. */
const toMbps = (test: IperfTestProperty | null) =>
  test ? Math.round((test.bitsPerSecond / 1_000_000) * 100) / 100 : "";

/** Channel, band, width and TX rate are never really 0: 0 means unknown. */
const known = (n: number) => (n ? n : "");

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Survey points as CSV text, one row per point. A value that was not
 * measured (a speed test that did not run, no noise reading) is an empty
 * cell; a measured 0 Mbps is 0.
 */
export function surveyPointsToCsv(
  points: SurveyPoint[],
  apMapping: ApMapping[],
): string {
  const header = [
    "id",
    "enabled",
    "x",
    "y",
    "signal_percent",
    "rssi_dbm",
    "noise_dbm",
    "snr_db",
    "ssid",
    "bssid",
    "access_point",
    "channel",
    "band_ghz",
    "channel_width_mhz",
    "tx_rate_mbps",
    "phy_mode",
    "security",
    "tcp_download_mbps",
    "tcp_upload_mbps",
    "udp_download_mbps",
    "udp_upload_mbps",
    "udp_download_jitter_ms",
    "udp_download_lost_packets",
    "measured_at",
  ];
  const rows = points.map((p) => {
    const w = p.wifiData;
    const i = p.iperfData;
    const ap = apNameFor(w.bssid, apMapping) ?? "";
    return [
      p.id,
      p.isEnabled ? "yes" : "no",
      p.x,
      p.y,
      w.signalStrength,
      w.rssi,
      validNoise(w.noise) ?? "",
      snrOf(w) ?? "",
      w.ssid,
      w.bssid,
      ap,
      known(w.channel),
      known(w.band),
      known(w.channelWidth),
      known(w.txRate),
      w.phyMode,
      w.security,
      toMbps(i.tcpDownload),
      toMbps(i.tcpUpload),
      toMbps(i.udpDownload),
      toMbps(i.udpUpload),
      i.udpDownload?.jitterMs ?? "",
      i.udpDownload?.lostPackets ?? "",
      new Date(p.timestamp).toISOString(),
    ]
      .map(csvCell)
      .join(",");
  });
  return [header.join(","), ...rows].join("\n") + "\n";
}

export function downloadText(
  text: string,
  fileName: string,
  mime = "text/csv",
) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
