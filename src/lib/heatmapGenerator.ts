import { SurveyPoint, IperfTest } from "./database";

export type MetricType =
  | "signalStrength"
  | "tcpDownload"
  | "tcpUpload"
  | "udpDownload"
  | "udpUpload";

export interface HeatmapData {
  min: number;
  max: number;
  data: Array<{ x: number; y: number; value: number }>;
}

export function generateHeatmapData(
  surveyPoints: SurveyPoint[],
  metric: MetricType = "signalStrength"
): HeatmapData {
  // Prepare data for heatmap
  const data = surveyPoints.map((point) => ({
    x: point.x,
    y: point.y,
    value: getMetricValue(point, metric),
  }));

  return {
    min: getMinValue(metric),
    max: getMaxValue(metric),
    data: data,
  };
}

function getMetricValue(point: SurveyPoint, metric: MetricType): number {
  switch (metric) {
    case "signalStrength":
      return Math.max(...point.wifiData.map((network) => network.rssi));
    case "tcpDownload":
      return getIperfValue(point.iperfResults.tcpDownload);
    case "tcpUpload":
      return getIperfValue(point.iperfResults.tcpUpload);
    case "udpDownload":
      return getIperfValue(point.iperfResults.udpDownload);
    case "udpUpload":
      return getIperfValue(point.iperfResults.udpUpload);
  }
}

function getIperfValue(test: IperfTest): number {
  return test.bitsPerSecond / 1000000; // Convert to Mbps
}

function getMaxValue(metric: MetricType): number {
  switch (metric) {
    case "signalStrength":
      return -30; // Strongest typical RSSI
    case "tcpDownload":
    case "tcpUpload":
    case "udpDownload":
    case "udpUpload":
      return 1000; // 1000 Mbps
  }
}

function getMinValue(metric: MetricType): number {
  switch (metric) {
    case "signalStrength":
      return -90; // Weakest typical RSSI
    case "tcpDownload":
    case "tcpUpload":
    case "udpDownload":
    case "udpUpload":
      return 0; // 0 Mbps
  }
}