import { WifiNetwork } from "./types";
import { execAsync } from "./server-utils";
import { getLogger } from "./logger";
import {
  getDefaultWifiNetwork,
  percentageToRssi,
  RSSI_VALUE_ON_LOST_CONNECTION,
  rssiToPercentage,
} from "./wifiScanner";
import { isValidMacAddress, normalizeMacAddress } from "./wifiScanner";
import { getReverseLookupMap } from "./localization";

const logger = getLogger("wifi-Windows");
const reverseLookupTable = await getReverseLookupMap();
/**
 * scanWifiWindows() scan the Wifi for Windows
 * @returns a WiFiNetwork description to be added to the surveyPoints
 */
export async function scanWifiWindows(): Promise<WifiNetwork> {
  const command = "netsh wlan show interfaces";
  const { stdout } = await execAsync(command);
  logger.trace("NETSH output:", stdout);
  const parsed = parseNetshOutput(stdout);
  logger.trace("Final WiFi data:", parsed);
  return parsed;
}

function assignWindowsNetworkInfoValue<K extends keyof WifiNetwork>(
  networkInfo: WifiNetwork,
  label: K,
  val: string,
) {
  const current = networkInfo[label];
  if (typeof current === "number") {
    const parsedValue = parseInt(val, 10);
    networkInfo[label] = !isNaN(parsedValue) ? parsedValue : (0 as any);
  } else {
    networkInfo[label] = val as any;
  }
}
/**
 * Parse the output of the `netsh wlan show interfaces` command.
 *
 * This code looks up the labels from the netsh... command
 * in a localization map that determines the proper label for the WifiNetwork
 */
export function parseNetshOutput(output: string): WifiNetwork {
  const networkInfo = getDefaultWifiNetwork();
  const lines = output.split("\n");
  for (const line of lines) {
    const pos = line.indexOf(":");
    if (pos == -1) continue; // no ":"? Just ignore line
    const label = line.slice(0, pos - 1).trim(); // the label up to the ":"
    let val = line.slice(pos + 1).trim(); // string read from rest of the line
    const key = reverseLookupTable.get(label) ?? null; // key is the name of the property
    // console.log(`Looking up: ${label} ${key}`);
    if (key == "signalStrength") {
      val = val.replace("%", ""); // remove any "%"
    }
    if (key == "bssid") {
      val = normalizeMacAddress(val); // remove ":" or "-" to produce "############"
    }
    if (key != null) {
      // console.log(`Real label/val: ${key} ${val}`);
      assignWindowsNetworkInfoValue(networkInfo, key as keyof WifiNetwork, val);
    }
  }
  // Check to see if we got any of the important info
  // If not, ask if they could provide info...
  if (networkInfo.signalStrength === 0) {
    networkInfo.rssi = RSSI_VALUE_ON_LOST_CONNECTION;
  } else {
    networkInfo.rssi = percentageToRssi(networkInfo.signalStrength);
  }
  if (networkInfo.channel == 0 || networkInfo.txRate == 0) {
    throw new Error(
      `Could not read Wi-Fi info. Perhaps wifi-heatmapper is not localized for your system. See https://github.com/hnykda/wifi-heatmapper/issues/26 for details.`,
    );
  }
  if (!isValidMacAddress(networkInfo.bssid)) {
    throw new Error(
      `Invalid BSSID when parsing netsh output: ${networkInfo.bssid}`,
    );
  }
  //update frequency band
  networkInfo.band = networkInfo.channel > 14 ? 5 : 2.4;
  networkInfo.signalStrength = rssiToPercentage(networkInfo.rssi);

  return networkInfo;
}
