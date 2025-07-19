/**
 * A collection of helper functions that may be called either by client
 * or server code.
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { IperfTestProperty, testTypes } from "./types";
import { MeasurementTestType } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatMacAddress = (macAddress: string) => {
  return macAddress.replace(/../g, "$&-").toUpperCase().slice(0, -1);
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
