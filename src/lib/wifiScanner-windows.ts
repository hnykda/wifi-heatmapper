import { WifiNetwork } from "./types";
import { execAsync } from "./server-utils";
import { getLogger } from "./logger";
import { getDefaultWifiNetwork } from "./wifiScanner";
import { percentageToRssi } from "./utils";
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
  key: K,
  val: string,
) {
  const current = networkInfo[key];
  if (typeof current === "number") {
    networkInfo[key] = parseInt(val, 10) as any;
  } else {
    networkInfo[key] = val as any;
  }
}
/**
 * Parse the output of the `netsh wlan show interfaces` command.
 *
 * This code looks up the keys from the netsh... command
 * in a localization map that determines the proper key for the WifiNetwork
 */
export function parseNetshOutput(output: string): WifiNetwork {
  const networkInfo = getDefaultWifiNetwork();
  const lines = output.split("\n");
  for (const line of lines) {
    const pos = line.indexOf(":");
    if (pos == -1) continue; // no ":"? Just ignore line
    const key = line.slice(0, pos - 1).trim();
    let val = line.slice(pos + 1).trim();
    const result = reverseLookupTable.get(key) ?? null;
    if (key == "signalStrength") {
      val = val.replace("%", ""); // remove any "%"
    }
    if (key == "BSSID") {
      val = normalizeMacAddress(val);
    }
    if (result != null) {
      assignWindowsNetworkInfoValue(
        networkInfo,
        result as keyof WifiNetwork,
        val,
      );
    }
  }
  if (!isValidMacAddress(networkInfo.bssid)) {
    throw new Error(
      `Invalid BSSID when parsing netsh output: ${networkInfo.bssid}`,
    );
  }
  //update frequency band
  networkInfo.band = networkInfo.channel > 14 ? 5 : 2.4;
  networkInfo.rssi = percentageToRssi(networkInfo.signalStrength);

  return networkInfo;
}
