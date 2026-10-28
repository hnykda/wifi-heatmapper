import "server-only";
import os from "os";
import { WifiActions, WifiScanResults, WifiResults } from "./types";
import { getLogger } from "./logger";
import { MacOSWifiActions } from "./wifiScanner-macos";
import { WindowsWifiActions } from "./wifiScanner-windows";
import { LinuxWifiActions } from "./wifiScanner-linux";
import { MockWifiActions } from "./wifiScanner-mock";
import { isMockMode } from "./app-info";
/**
 * wifiScanner.ts is a factory module that returns the proper set of
 * functions for the underlying OS (or the mock backend when
 * WIFI_HEATMAPPER_MOCK is set).
 */

const logger = getLogger("wifiScanner");

export async function createWifiActions(): Promise<WifiActions> {
  if (isMockMode()) {
    logger.info("Mock mode: using synthetic Wi-Fi and iperf3 results");
    return new MockWifiActions();
  }
  const platform = os.platform();
  switch (platform) {
    case "darwin":
      return new MacOSWifiActions();
    case "win32":
      return new WindowsWifiActions();
    case "linux":
      return new LinuxWifiActions();
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

export async function logWifiResults(results: WifiScanResults): Promise<void> {
  logger.info(`===== WifiResults =====`);
  results.SSIDs.forEach(logWifiResult);
}

export async function logWifiResult(result: WifiResults) {
  logger.info(
    `active: signalStrength: ${result.signalStrength}; channel: ${result.channel}; ssid: ${result.ssid}`,
  );
}
