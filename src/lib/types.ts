import type { z } from "zod";
import type {
  apMappingSchema,
  iperfCommandsSchema,
  iperfResultsSchema,
  iperfTestPropertySchema,
  SurveyDocument,
  surveyFileMetaSchema,
  surveyPointSchema,
  WifiResults,
} from "./schema";

// The survey file's types are derived from the Zod schemas in schema.ts.
export type {
  NewSurveyPoint,
  SettingsPatch,
  SurveyDocument,
  SurveyPointPatch,
  WifiResults,
} from "./schema";
export type IperfTestProperty = z.output<typeof iperfTestPropertySchema>;
/** IperfResults - results from an iperf3 test */
export type IperfResults = z.output<typeof iperfResultsSchema>;
export type ApMapping = z.output<typeof apMappingSchema>;
export type IperfCommands = z.output<typeof iperfCommandsSchema>;
/** SurveyPoint - all the information we have about a particular point */
export type SurveyPoint = z.output<typeof surveyPointSchema>;
/**
 * SurveyFileMeta - provenance recorded in each data/surveys/*.json file
 * so bug reports and old files can be understood later.
 */
export type SurveyFileMeta = z.output<typeof surveyFileMetaSchema>;

// Used for localization map
export type LocalizerMap = Record<string, any>;

type IperfTestProperties = {
  [K in keyof IperfTestProperty]: K;
};

export const testProperties: IperfTestProperties = {
  bitsPerSecond: "bitsPerSecond",
  jitterMs: "jitterMs",
  lostPackets: "lostPackets",
  retransmits: "retransmits",
  packetsReceived: "packetsReceived",
  // signalstrength is included so generateAllHeatmaps() has all the properties in one object
  signalStrength: "signalStrength",
} as const;

export type TestTypes = {
  [K in keyof IperfResults | "signalStrength" | "snr"]: K;
};

export const testTypes: TestTypes = {
  signalStrength: "signalStrength",
  snr: "snr", // signal-to-noise ratio (RSSI - noise, dB)
  tcpDownload: "tcpDownload",
  tcpUpload: "tcpUpload",
  udpDownload: "udpDownload",
  udpUpload: "udpUpload",
} as const;

export type MeasurementTestType = keyof TestTypes;

export type Gradient = Record<number, string>; // Maps 0-1 values to colors

export interface HeatmapRange {
  min: number;
  max: number;
}

/** What a heat map shows: an iperf property, signal strength or SNR. */
export type HeatmapProperty = keyof IperfTestProperty | "snr";

export type HeatmapKey =
  "signalStrength" | "snr" | `${keyof IperfResults}-${keyof IperfTestProperty}`;

/** Saved bounds in display units: Mbps, ms, counts, signal percent or dB (SNR). */
export type HeatmapScale = HeatmapRange & { enabled: boolean };

/** Independent per-map scales; disabled entries retain their saved bounds. */
export type HeatmapRanges = Partial<Record<HeatmapKey, HeatmapScale>>;

/**
 * The full set of data for a particular floor plan: the survey file
 * (see SurveyDocument in schema.ts) plus the sudo password, which lives only
 * in the browser's memory and is never sent to /api/settings.
 */
export type HeatmapSettings = SurveyDocument & { sudoerPassword: string };

/**
 * The subset of settings the measurement process needs.
 * This is what the browser POSTs to /api/start-task.
 */
export interface PartialHeatmapSettings {
  // missing: derived from iperfServerAdrs (localhost or empty = signal only)
  measureSpeed?: boolean;
  iperfServerAdrs: string;
  testDuration: number;
  sudoerPassword: string;
  iperfCommands: IperfCommands;
}

/**
 * AppStatus - facts about the running server, from GET /api/status
 */
export interface AppStatus {
  version: string;
  nodeVersion: string;
  platform: string; // darwin | win32 | linux
  osRelease: string;
  osName: string;
  podman: boolean;
  docker: boolean;
  mockMode: boolean;
  iperf3Version: string | null; // null when iperf3 is not installed
  dataDir: string;
  desktopApp: boolean; // started by the desktop app rather than npm/Docker
  // macOS only: path of the native Wi-Fi helper if it is built, else null.
  // Details (does it work, Location access) come from GET /api/macos-helper.
  macosHelper: string | null;
}

/**
 * MacosHelperStatus - GET /api/macos-helper (see src/lib/macos-helper.ts)
 */
export interface MacosHelperStatus {
  available: boolean;
  path: string | null;
  locationAuthorized?: boolean;
  locationStatus?: string; // notDetermined | denied | restricted | authorized
  locationServicesEnabled?: boolean;
  prompted?: boolean; // POST only: the macOS prompt was shown
  error?: string;
}

/** What the progress panel shows while measuring. */
export interface MeasurementFields {
  strength: string; // "78%" or "-"
  tcp: string; // "312.10 / 280.55 Mbps", "Skipped" or "Off"
  udp: string;
  // "signal": the survey measures signal only; "speed": signal and speed
  mode?: "signal" | "speed";
}

/**
 * A measurement job's state. "saving": measured, the point is being
 * written (too late to cancel); "done": saved.
 */
export type MeasurementState =
  "running" | "saving" | "done" | "error" | "cancelled";

/**
 * MeasurementEvent - one server-sent event on /api/events, sent to every
 * open tab. Measurement events carry the job they belong to.
 */
export interface MeasurementEvent {
  type: "ready" | "update" | "done" | "heartbeat";
  jobId?: string;
  survey?: string; // the floor plan the job measures for
  x?: number;
  y?: number;
  header: string;
  status: string; // human readable, multi-line
  fields?: MeasurementFields;
  // set when the reading is saved without speed although the survey wants it
  warning?: string;
  state?: MeasurementState; // set on "done"
  pointId?: string; // "done" and saved: the new point's id
}

/** GET /api/start-task?action=status&id=<job id> */
export interface MeasurementJobStatus {
  id: string;
  survey: string;
  x: number;
  y: number;
  state: MeasurementState;
  startedAt: string; // ISO time
  progress: MeasurementEvent | null; // the latest event
  pointId?: string; // done: the saved point
  warning?: string; // done: saved without speed, and why
  error?: string; // error: why there is no point
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

/**
 * Functions that do the platform-specfic work
 * Pass PartialHeatmapSettings for the essential parameters
 * Return a potentially-empty array of WifiResults and a "reason" string
 */
export interface WifiScanResults {
  SSIDs: WifiResults[]; // potentially empty
  reason: string; // if noErr "", otherwise an explanation
}

export interface WifiActions {
  /** can the Wi-Fi be read? "" or a reason to show */
  preflightSettings(settings: PartialHeatmapSettings): Promise<WifiScanResults>;
  /** nearby networks, sorted by signal strength (not used while measuring) */
  scanWifi(settings: PartialHeatmapSettings): Promise<WifiScanResults>;
  /** the current connection, as one WifiResults */
  getWifi(settings: PartialHeatmapSettings): Promise<WifiScanResults>;
}

/**
 * Definitions for SPAirPortDataType - ChatGPT derived the structure from the
 *    output of system_profiler -json SPAirPortDataType
 */

export interface AirportNetwork {
  _name: string;
  spairport_network_bssid: string;
  spairport_network_channel: number | string;
  spairport_network_country_code?: string;
  spairport_network_phymode: string;
  spairport_network_type: string;
  spairport_security_mode: string;
  spairport_signal_noise: string;
}

export interface AirportCurrentNetworkInformation extends AirportNetwork {
  spairport_network_mcs?: number;
  spairport_network_rate?: number;
}

export interface AirportInterface {
  _name: string;
  spairport_airdrop_channel?: number;
  spairport_airport_other_local_wireless_networks: AirportNetwork[];
  spairport_caps_airdrop?: string;
  spairport_caps_autounlock?: string;
  spairport_current_network_information?: AirportCurrentNetworkInformation;
  spairport_status_information?: string;
  spairport_supported_channels?: (number | string)[];
  spairport_supported_phymodes?: string;
  spairport_wireless_card_type?: string;
  spairport_wireless_country_code?: string;
  spairport_wireless_firmware_version?: string;
  spairport_wireless_locale?: string;
  spairport_wireless_mac_address?: string;
}

export interface SPAirPortSoftwareInformation {
  spairport_corewlan_version?: string;
  spairport_corewlankit_version?: string;
  spairport_diagnostics_version?: string;
  spairport_extra_version?: string;
  spairport_family_version?: string;
  spairport_profiler_version?: string;
  spairport_utility_version?: string;
}

export interface SPAirPortEntry {
  spairport_airport_interfaces: AirportInterface[];
  spairport_software_information?: SPAirPortSoftwareInformation;
}

export interface SPAirPortRoot {
  TestDescriptionDEADBEEF: string; // used to describe test conditions for this data
  SPAirPortDataType: SPAirPortEntry[];
}
