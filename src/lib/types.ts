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

export interface Database {
  surveyPoints: SurveyPoint[];
  floorplanImagePath: string;
  iperfServerAdrs: string;
  testDuration: number;
  apMapping: ApMapping[];
  // platform: string; // Not the platform - it will be determined each time we start
  // dbPath: string; // Not the dbPath - since that's needed to find the data
  // NOT THE sudoersPassword - NEVER save in the database
  // and ultimately advanced settings and TCP/UDP speed test settings
}

export interface SurveyPoint {
  x: number;
  y: number;
  wifiData: WifiNetwork;
  iperfResults: IperfResults;
  timestamp: string;
  id: string;
  isDisabled: boolean;
}

/**
 * @rssi is the dBm value
 * @signalStrength is the percentage of signal strength
 */
export interface WifiNetwork {
  ssid: string;
  bssid: string;
  rssi: number;
  signalStrength: number;
  channel: number;
  security: string;
  txRate: number;
  phyMode: string;
  channelWidth: number;
  frequency: number;
}

export type ScannerSettings = {
  sudoerPassword: string | "";
  wlanInterfaceId: string | "";
};

export type OS = "macos" | "windows" | "linux";
