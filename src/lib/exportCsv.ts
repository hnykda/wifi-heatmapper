import { ApMapping, SurveyPoint } from "./types";

const toMbps = (bps: number) => Math.round((bps / 1_000_000) * 100) / 100;

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Survey points as CSV text, one row per point. */
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
    const ap = apMapping.find((a) => a.macAddress === w.bssid)?.apName ?? "";
    return [
      p.id,
      p.isEnabled ? "yes" : "no",
      p.x,
      p.y,
      w.signalStrength,
      w.rssi,
      w.ssid,
      w.bssid,
      ap,
      w.channel,
      w.band,
      w.channelWidth,
      w.txRate,
      w.phyMode,
      w.security,
      toMbps(i.tcpDownload.bitsPerSecond),
      toMbps(i.tcpUpload.bitsPerSecond),
      toMbps(i.udpDownload.bitsPerSecond),
      toMbps(i.udpUpload.bitsPerSecond),
      i.udpDownload.jitterMs ?? "",
      i.udpDownload.lostPackets ?? "",
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
