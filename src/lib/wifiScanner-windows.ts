import { WifiResults } from "./types";
import { execAsync } from "./server-utils";
import { getLogger } from "./logger";
import {
  getDefaultWifiResults,
  isValidMacAddress,
  normalizeMacAddress,
  percentageToRssi,
  channelToBand,
  bySignalStrength,
  splitLine,
} from "./utils";
import { initLocalization } from "./localization";

const logger = getLogger("wifi-Windows");
const localizer = await initLocalization();

/**
 * scanWifiWindows() scan the Wifi for Windows
 * @returns a WiFiNetwork description to be added to the surveyPoints
 */
export async function scanWifiWindows(): Promise<WifiResults> {
  const command = "netsh wlan show interfaces";
  const { stdout } = await execAsync(command);
  logger.trace("NETSH output:", stdout);
  const parsed = parseNetshInterfaces(stdout);
  logger.trace("Final WiFi data:", parsed);
  return parsed;
}

function assignWindowsNetworkInfoValue<K extends keyof WifiResults>(
  networkInfo: WifiResults,
  label: K,
  val: string,
) {
  const current = networkInfo[label];
  if (typeof current === "number") {
    networkInfo[label] = parseInt(val, 10) as any;
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
export function parseNetshInterfaces(output: string): WifiResults {
  const networkInfo = getDefaultWifiResults();
  const lines = output.split("\n");
  for (const line of lines) {
    // eslint-disable-next-line prefer-const
    let [, key, val] = splitLine(line, localizer);
    if (key === "") continue; // ignore lines that don't have a key

    if (key == "signalStrength") {
      val = val.replace("%", ""); // remove any "%"
    }
    if (key == "bssid") {
      val = normalizeMacAddress(val); // remove ":" or "-" to produce "############"
    }
    if (key != null) {
      // console.log(`Real label/val: ${key} ${val}`);
      assignWindowsNetworkInfoValue(networkInfo, key as keyof WifiResults, val);
    }
  }
  // Check to see if we got any of the important info
  // If not, ask if they could provide info...
  if (
    networkInfo.signalStrength == 0 ||
    networkInfo.channel == 0 ||
    networkInfo.txRate == 0
  ) {
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
  networkInfo.rssi = percentageToRssi(networkInfo.signalStrength);

  return networkInfo;
}

/**
 * getProfiles - issue `netsh wlan show profiles` and return an
 * array of profile names (string)
 */
// async function getProfiles(): Promise<string[]> {
//   const { stdout } = await execAsync("netsh wlan show profiles");
//   return parseProfiles(stdout);
// }

/**
 * parseProfiles() - return the list of profiles from `netsh ... profiles`
 * Valid lines contain "????? : profileName"
 * @param stdout - output of the `netsh ...` command
 * @returns array of profile names (strings) detected in the output
 */
export function parseProfiles(stdout: string): string[] {
  const response = [];
  // break into lines, removing those without ":"
  const lines = stdout.split("\n").filter((line) => line.includes(":"));
  for (const line of lines) {
    const [, , val] = splitLine(line, localizer);
    if (val) {
      response.push(val);
    }
  }
  // console.log(`Profiles: ${JSON.stringify(response)}`);
  return response;
}
/**
 * getProfileFromSSID(ssid)
 * Look through all the Profiles on the system, and return
 *   the first profile name that contains the specified SSID
 * @param profiles the profiles for this wifi device (string[])
 * @param theSSID to retrieve (string)
 * @returns the Profile that matches that SSID
 */

// async function getProfileFromSSID(
//   profiles: string[],
//   theSSID: string,
// ): Promise<string> {
//   for (const profile of profiles) {
//     // netsh wlan show profile name="Profile 2"
//     const { stdout } = await execAsync(
//       `netsh wlan show profile name="${profile}"`,
//     );
//     const matchedProfile = findProfileFromSSID(stdout, theSSID);
//     if (matchedProfile) return matchedProfile;
//   }
//   // tried them all, didn't find a match. Throw an error
//   throw `Didn't find a profile to match ${theSSID}`;
// }

/**
 * findProfilefrom SSID() - find the Profile for the named SSID
 * Parse the output of `netsh wlan show profile name="Profile 2"
 *
 * - The profile name if it contains the passed-in SSID
 * - null if not
 * @param stdout - the output of the `netsh...` command (above)
 * @param theSSID - the SSID we're looking for
 * @returns - the profile (if SSID matches) or null
 */
export function findProfileFromSSID(
  stdout: string,
  theSSID: string,
): string | null {
  let profile = "";
  const profileLines = stdout.split("\n");
  for (const line of profileLines) {
    const [, key, val] = splitLine(line, localizer);
    if (key == "name") {
      profile = val;
      break;
    }
  }
  if (!profile) {
    throw new Error("No profile name found");
  }

  // Now see what SSIDs this file contains
  const lines = stdout.split("\n");
  const ssidLines = [];
  for (const line of lines) {
    // console.log(`theLine: ${line}`);

    const [, key, value] = splitLine(line, localizer);
    // console.log(`Key/Val: "${key}" "${value}"`);
    if (key == "ssid") {
      ssidLines.push(value);
    }
  }
  // no SSIDs at all is an error
  if (ssidLines.length == 0) {
    throw new Error(`Can't find an SSID for profile ${profile}`);
  }
  for (const ssid of ssidLines) {
    if (ssid == theSSID) {
      return profile;
    }
  }
  return null;
}

/**
 * parseNetshNetworks() parses the `netsh wlan show networks mode=bssid`
 *
 * Ignore any SSID that is ""
 *
 * @param string Output of the command
 * @returns array of WifiResults, sorted by signalStrength
 */
export function parseNetshNetworks(text: string): WifiResults[] {
  const results: WifiResults[] = [];

  let currentSSID = "";
  let currentBSSID = "";
  let currentSecurity = "";
  let wifiResult = getDefaultWifiResults();

  const lines = text.split("\n");
  for (const line of lines) {
    const [, key, val] = splitLine(line, localizer);

    // If we have accumulated a SSID and BSSID, push out that record
    // because the new ssid/bssid start a new record
    if (key == "ssid" || key == "bssid") {
      if (currentSSID != "" && currentBSSID != "") {
        results.push(wifiResult);
        currentBSSID = ""; // reset the parameters
        // console.log(`***** wifiResult: ${JSON.stringify(wifiResult)}`);
        wifiResult = getDefaultWifiResults();
      }
    }

    // starts a new SSID: just remember its SSID
    if (key == "ssid") {
      currentSSID = val;
      continue;
    }

    // encountering "BSSID" starts a new WifiResult
    // record its ssid, bssid, security
    if (key == "bssid") {
      currentBSSID = val;
      wifiResult.ssid = currentSSID;
      wifiResult.bssid = currentBSSID;
      wifiResult.security = currentSecurity;
      continue;
    }

    // "security" follows the SSID line: remember it globally
    if (key == "security") {
      currentSecurity = val;
      continue;
    }

    if (key == "signalStrength") {
      wifiResult.signalStrength = Number(val.replace("%", "")); // remove any "%"
      wifiResult.rssi = percentageToRssi(wifiResult.signalStrength);
      continue;
    }

    if (key == "phyMode") {
      wifiResult.phyMode = val;
      continue;
    }

    if (key == "channel") {
      wifiResult.channel = Number(val);
      wifiResult.band = channelToBand(wifiResult.channel);
      continue;
    }
  }

  // completed the loop - push out final accumulated record
  results.push(wifiResult);
  // console.log(`***** wifiResult: ${JSON.stringify(wifiResult)}`);

  const sortedResults = results.sort(bySignalStrength);
  const nonEmptyResults = sortedResults.filter((item) => item.ssid != "");
  // console.log(`Network Results: ${JSON.stringify(nonEmptyResults, null, 2)}`);
  return nonEmptyResults;
}
