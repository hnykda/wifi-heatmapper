import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Database, IperfTestProperty, testTypes } from "./types";
import { MeasurementTestType } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const getDefaults = (): Database => {
  return {
    surveyPoints: [],
    floorplanImage: "",
    iperfServer: "",
    apMapping: [],
    testDuration: 10,
  };
};

export const formatMacAddress = (macAddress: string) => {
  return macAddress.replace(/../g, "$&-").toUpperCase().slice(0, -1);
};

export const rssiToPercentage = (rssi: number): number => {
  if (rssi <= -80) return 0;
  if (rssi >= -40) return 100;
  return Math.round(((rssi + 80) / 40) * 100);
};

export const percentageToRssi = (percentage: number): number => {
  return Math.round(-80 + (percentage / 100) * 40);
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
    return `${(value / 1000000).toFixed(2)} Mbps`;
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
