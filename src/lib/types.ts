export interface IperfTestProperty {
  bitsPerSecond: number;
  retransmits?: number;
  jitterMs?: number;
  lostPackets?: number;
  packetsReceived?: number;
}
// could be stricter as per type

export interface IperfResults {
  tcpDownload: IperfTestProperty;
  tcpUpload: IperfTestProperty;
  udpDownload: IperfTestProperty;
  udpUpload: IperfTestProperty;
}
type IperfTestProperties = {
  [K in keyof IperfTestProperty]: K;
};

export const testProperties: IperfTestProperties = {
  bitsPerSecond: "bitsPerSecond",
  jitterMs: "jitterMs",
  lostPackets: "lostPackets",
  retransmits: "retransmits",
  packetsReceived: "packetsReceived",
} as const;

export type TestTypes = {
  [K in keyof IperfResults | "signalStrength"]: K;
};

export const testTypes: TestTypes = {
  tcpDownload: "tcpDownload",
  tcpUpload: "tcpUpload",
  udpDownload: "udpDownload",
  udpUpload: "udpUpload",
  signalStrength: "signalStrength",
} as const;

export type MeasurementTestType = keyof TestTypes;

export interface ApMapping {
  apName: string;
  macAddress: string;
}

export interface SurveyPoint {
  x: number;
  y: number;
  wifiData: WifiNetwork;
  iperfResults: IperfResults;
  timestamp: string;
  id: string;
  isHidden: boolean;
}

export interface WifiNetwork {
  ssid: string;
  bssid: string;
  rssi: number;
  channel: number;
  security: string;
  txRate: number;
  phyMode: string;
  channelWidth: number;
  frequency: number;
}

export interface Database {
  surveyPoints: SurveyPoint[];
  floorplanImage: string;
  iperfServer: string;
  testDuration: number;
  apMapping: ApMapping[];
}
