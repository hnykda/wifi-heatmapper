/**
 * A collection of helper functions that may be called either by client
 * or server code.
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  IperfTestProperty,
  testTypes,
  MeasurementTestType,
  WifiResults,
} from "./types";
import { LocalizerMap } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const rssiToPercentage = (rssi: number): number => {
  if (rssi == 0) return 0;
  if (rssi <= -100) return 0;
  if (rssi >= -40) return 100;
  return Math.round(((rssi + 100) / 60) * 100);
};

export const percentageToRssi = (percentage: number): number => {
  return Math.round(-100 + (percentage / 100) * 60);
};

/**
 * toMbps - convert a number to a "Mbps" value - two significant digits
 * @param the value (in bits/second) to convert
 * @returns String in format "123.45" (no units)
 */
export const toMbps = (value: number): string => {
  return `${(value / 1000000).toFixed(2)}`;
};

/**
 * format the parameter according to its "natural type" as a string
 *  signalStrength: add "dBm" or "%" as required
 *  throughput: xxx.xx Mbps (two decimal places)
 *  jitter: xxxx ms (four significant digits)
 *  other numbers: just their value as a string

 * @param value
 * @param metric
 * @param testType
 * @param showSignalStrengthAsPercentage
 * @returns
 */
export const metricFormatter = (
  value: number,
  metric: MeasurementTestType,
  testType?: keyof IperfTestProperty,
  showSignalStrengthAsPercentage?: boolean,
): string => {
  if (metric === testTypes.signalStrength) {
    return showSignalStrengthAsPercentage
      ? `${Math.round(value)}%`
      : `${Math.round(value)} dBm`;
  }
  if (testType === "bitsPerSecond") {
    return `${toMbps(value)} Mbps`;
  }
  if (testType === "jitterMs") {
    return `${value.toFixed(4)} ms`;
  }
  if (
    testType === "lostPackets" ||
    testType === "retransmits" ||
    testType === "packetsReceived"
  ) {
    return Math.round(value).toString();
  }
  return value.toFixed(2);
};

/**
 * delay a given number of milliseconds
 * @param ms:number - number of milliseconds to delay
 * @returns Promise<void>
 */
export async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const getDefaultWifiResults = (): WifiResults => {
  return {
    ssid: "",
    bssid: "",
    rssi: 0,
    signalStrength: 0,
    channel: 0,
    band: 0, // frequency band will be either 2.4 or 5 (GHz)
    channelWidth: 0,
    txRate: 0,
    phyMode: "",
    security: "",
    active: false,
  };
};

/**
 * formatMacAddress() - add punctuation: convert "0123456789ab" to "01-23-45-67-89-AB"
 * @param macAddress
 * @returns formatted string
 */
export const formatMacAddress = (macAddress: string) => {
  if (macAddress.includes("redacted")) {
    return macAddress;
  }
  return macAddress.replace(/../g, "$&-").toUpperCase().slice(0, -1);
};

/**
 * normalizeMacAddress - remove punctuation ("-", ":") from MAC address
 * @param macAddress
 * @returns
 */
export const normalizeMacAddress = (macAddress: string): string => {
  return macAddress.replace(/[:-]/g, "").toLowerCase();
};

/**
 * isValidMacAddress - return true if it's a valid MAC address
 * @param macAddress
 * @returns
 */
export const isValidMacAddress = (macAddress: string): boolean => {
  const cleanedMacAddress = normalizeMacAddress(macAddress);
  if (cleanedMacAddress === "000000000000") {
    // sometimes returned by ioreg, for example
    return false;
  }
  return /^[0-9a-f]{12}$/.test(cleanedMacAddress);
};
/**
 * The iperfRunner code receives a JSON object of all the test results.
 * This function extracts the interesting values and returns
 * an IperfTestProperty containing those results.
 *
 * @param result - JSON object of the iperf test results
 * @param isUdp - flag whether it's a TCP or UDP test
 * @returns IperfTestProperty
 */
export function extractIperfResults(
  result: {
    end: {
      sum_received?: { bits_per_second: number };
      sum_sent?: { retransmits?: number };
      sum?: {
        bits_per_second?: number;
        jitter_ms?: number;
        lost_packets?: number;
        packets?: number;
        lost_percent?: number;
        retransmits?: number;
      };
      streams?: Array<{
        udp?: {
          jitter_ms?: number;
          lost_packets?: number;
          packets?: number;
        };
      }>;
    };
    version?: string;
  },
  isUdp: boolean,
): IperfTestProperty {
  const end = result.end;

  // Check if we're dealing with newer iPerf (Mac - v3.17+) or older iPerf (Ubuntu - v3.9)
  // Newer versions have sum_received and sum_sent, older versions only have sum
  const isNewVersion = !!end.sum_received;

  /**
   * In newer versions (Mac):
   * - TCP: sum_received contains download/upload bps, sum_sent contains retransmits
   * - UDP: sum_received contains actual received data (~51 Mbps),
   *        sum contains reported test bandwidth (~948 Mbps)
   *
   * In older versions (Ubuntu):
   * - TCP: sum contains both bps and retransmits
   * - UDP: sum contains all metrics (bps, jitter, packet loss)
   */

  // For UDP tests with newer iPerf (Mac), we want to use sum.bits_per_second
  // For TCP tests with newer iPerf, we want to use sum_received.bits_per_second
  // For all tests with older iPerf (Ubuntu), we want to use sum.bits_per_second
  const bitsPerSecond = isNewVersion
    ? isUdp
      ? end.sum?.bits_per_second || 0
      : end.sum_received!.bits_per_second
    : end.sum?.bits_per_second || 0;

  if (!bitsPerSecond) {
    throw new Error(
      "No bits per second found in iperf results. This is fatal.",
    );
  }

  const retransmits = isNewVersion
    ? end.sum_sent?.retransmits || 0
    : end.sum?.retransmits || 0;

  return {
    bitsPerSecond,
    retransmits,

    // UDP metrics - only relevant for UDP tests
    // These fields will be null for TCP tests
    jitterMs: isUdp ? end.sum?.jitter_ms || null : null,
    lostPackets: isUdp ? end.sum?.lost_packets || null : null,
    packetsReceived: isUdp ? end.sum?.packets || null : null,
    signalStrength: 0,
  };
}

/**
 * bySignalStrength() - takes the signalStrength from two WifiResults and gives their ordering
 * @param a
 * @param b
 * @returns
 */
// sort by the signalStrength value (may be null)
export function bySignalStrength(a: any, b: any): number {
  // const parseSignal = (val: string | undefined): number | null => {
  //   const match = val?.match(/^(-?\d+)\s+dBm/);
  //   return match ? parseInt(match[1], 10) : null;
  // };

  const signalA = a.signalStrength;
  const signalB = b.signalStrength;

  if (signalA === null && signalB === null) return 0;
  if (signalA === null) return 1; // move A to end
  if (signalB === null) return -1; // move B to end

  // Descending: stronger (less negative) signal first
  return signalB - signalA;
}

/**
 * splitLine - split a line from command output into the label and value
 * Look up the label in the (optional) localization table to get the "real" label
 * Remove digits and whitespace from a label containing SSID or BSSID
 * Remove '"' from returned value
 * @param line - a "label" separated by a ":" followed by a value
 * @returns array of strings: [label, key, value] may be ["", "",""] if no ":"
 */
export function splitLine(line: string, localizer: LocalizerMap): string[] {
  const pos = line.indexOf(":");
  if (pos == -1) return ["", "", ""]; // no ":"? return empty values
  let label = line.slice(0, pos).trim(); // the (trimmed) label up to the ":"
  const val = line
    .slice(pos + 1)
    .trim()
    .replace(/"/g, ""); // use the rest of the line trimming '"' and whitespace

  // remove trailing digits from BSSID or SSID line
  label = label.replace(/^(B?SSID)\s*\d*\s*$/, "$1");

  // localize the label to produce the key
  let key = label;
  if (localizer) {
    key = localizer[label];
    if (!key) key = "";
  }
  return [label, key, val];
}

/**
 * channelToBand - convert channel (number) to the band (number)
 * @param channel
 * @returns 2.4 or 5 (as number)
 */
export function channelToBand(channel: number): number {
  return channel <= 14 ? 2.4 : 5;
}
