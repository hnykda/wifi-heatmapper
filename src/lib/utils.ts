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

export const rssiToPercentage = (rssi: number): number => {
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
