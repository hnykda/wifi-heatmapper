import { HeatmapSettings, WifiNetwork } from "./types";
import { getLogger } from "./logger";
import os from "os";

import { scanWifiMacOS } from "./wifiScanner-macos";
import { scanWifiWindows } from "./wifiScanner-windows";
import { scanWifiLinux } from "./wifiScanner-linux";

export const RSSI_VALUE_ON_LOST_CONNECTION = -100;

const logger = getLogger("wifiScanner");

export const getDefaultWifiNetwork = (): WifiNetwork => ({
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
});

const hasValidData = (wifiData: WifiNetwork): boolean => {
  // if (!isValidMacAddress(wifiData.ssid)) {
  //   logger.warn("Invalid SSID (we were not able to get it):", wifiData.ssid);
  // }
  if (!isValidMacAddress(wifiData.bssid)) {
    logger.warn("Invalid BSSID (we were not able to get it):", wifiData.bssid);
  }

  return (
    // we also used to check for ssid and bssid, but at least on MacOS 15.3.1
    // these are not present in the output of any of the known OS commands
    // either rssi or signalStrength must be non-zero
    wifiData.rssi !== 0 || wifiData.signalStrength !== 0
  );
};

/**
 * Gets the current WiFi network name, BSSID of the AP it's connected to, and the RSSI.
 */
export async function scanWifi(
  settings: HeatmapSettings,
): Promise<WifiNetwork> {
  let wifiData: WifiNetwork | null = null;

  try {
    const platform = os.platform(); // Platform for the server

    if (platform === "darwin") {
      wifiData = await scanWifiMacOS(settings); // Needs sudoerPassword
    } else if (platform === "win32") {
      wifiData = await scanWifiWindows();
    } else if (platform === "linux") {
      wifiData = await scanWifiLinux(settings); // Needs sudoerPassword
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }
  } catch (error_) {
    const error = error_ as Error;
    logger.error("Error scanning WiFi:", error);
    if (error.message.includes("sudo")) {
      logger.error(
        "This command requires sudo privileges. Please run the application with sudo.",
      );
    }
    throw error;
  }

  if (!hasValidData(wifiData)) {
    throw new Error(
      "Measurement failed. We were not able to get good enough WiFi data: " +
        JSON.stringify(wifiData),
    );
  }

  return wifiData;
}

export const normalizeMacAddress = (macAddress: string): string => {
  return macAddress.replace(/[:-]/g, "").toLowerCase();
};

export const isValidMacAddress = (macAddress: string): boolean => {
  const cleanedMacAddress = normalizeMacAddress(macAddress);
  if (cleanedMacAddress === "000000000000") {
    // sometimes returned by ioreg, for example
    return false;
  }
  return /^[0-9a-f]{12}$/.test(cleanedMacAddress);
};
