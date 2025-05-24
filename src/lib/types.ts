export interface IperfTestProperty {
  bitsPerSecond: number;
  retransmits?: number;
  jitterMs: number | null;
  lostPackets: number | null;
  packetsReceived: number | null;
  signalStrength: number;
}

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
  signalStrength: "signalStrength",
} as const;

export type TestTypes = {
  [K in keyof IperfResults | "signalStrength"]: K;
};

export const testTypes: TestTypes = {
  signalStrength: "signalStrength",
  tcpDownload: "tcpDownload",
  tcpUpload: "tcpUpload",
  udpDownload: "udpDownload",
  udpUpload: "udpUpload",
} as const;

export type MeasurementTestType = keyof TestTypes;

export interface ApMapping {
  apName: string;
  macAddress: string;
}
export type RGB = { r: number; g: number; b: number; a: number };
export type Gradient = Record<number, string>; // Maps 0-1 values to colors

export type HeatmapConfig = {
  radius: number;
  maxOpacity: number;
  minOpacity: number;
  blur: number;
  gradient: Record<string, string>;
};

export interface HeatmapSettings {
  surveyPoints: SurveyPoint[];
  floorplanImageName: string; // name of the floorplan-filename
  floorplanImagePath: string; // path to the /media/floorplan-filename
  iperfServerAdrs: string;
  testDuration: number;
  sudoerPassword: string; // passed around, removed before writing to file
  apMapping: ApMapping[];
  nextPointNum: number;
  dimensions: { width: number; height: number };
  radiusDivider: number | null; // null - use calculated value
  maxOpacity: number;
  minOpacity: number;
  blur: number;
  gradient: Gradient;
}

export interface SurveyPoint {
  x: number;
  y: number;
  wifiData: WifiNetwork;
  iperfResults: IperfResults;
  timestamp: string;
  id: string;
  isEnabled: boolean;
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
  band: number; // frequency band - 2GHz or 5GHz
}

export type ScannerSettings = {
  sudoerPassword: string | "";
  wlanInterfaceId: string | "";
};

export type OS = "macos" | "windows" | "linux";

export interface SurveyPointActions {
  add: (newPoint: SurveyPoint) => void;
  update: (point: SurveyPoint, updatedData: Partial<SurveyPoint>) => void;
  delete: (points: SurveyPoint[]) => void;
}
