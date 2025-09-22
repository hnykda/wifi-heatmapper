import {
  PartialHeatmapSettings,
  WifiResults,
  WifiScanResults,
  WifiActions,
} from "./types";
import { execAsync } from "./server-utils";
import {
  getDefaultWifiResults,
  isValidMacAddress,
  normalizeMacAddress,
  percentageToRssi,
  channelToBand,
  bySignalStrength,
  delay,
} from "./utils";
import { initLocalization } from "./localization";
// import { getLogger } from "./logger";
// const logger = getLogger("wifi-Windows");

const localizer = await initLocalization();
export class WindowsWifiActions implements WifiActions {
  nameOfWifi: string = ""; // OS-specific name of the current wifi interface
  currentSSIDName: string = ""; // name of the current SSID
  strongestSSID: WifiResults | null = null; // strongest SSID if not currentSSID

  /**
   * preflightSettings - check whether the settings are "primed" to run a test
   * Tests:
   *   * iperfServerAdrs - non-empty
   *   * testDuration - greater than zero
   *   * sudoerPassword - non-empty and correct
   *
   * @param settings
   * @returns string - empty, or error message to display
   */
  async preflightSettings(
    settings: PartialHeatmapSettings,
  ): Promise<WifiScanResults> {
    const response: WifiScanResults = {
      SSIDs: [],
      reason: "",
    };
    let reason: string = "";
    // test duration must be > 0 - otherwise iperf3 runs forever
    if (settings.testDuration <= 0) {
      reason = "Test duration must be greater than zero.";
    }

    // iperfServerAddress must not be empty or ""
    else if (!settings.iperfServerAdrs) {
      reason = "Please set iperf3 server address";
    }

    // fill in the reason and return it
    response.reason = reason;
    return response;
  }

  /**
   * checkIperfServer() - test if an iperf3 server is available at the address
   * @param settings includes the iperfServerAddress
   * @returns "" or error string
   */
  async checkIperfServer(
    settings: PartialHeatmapSettings,
  ): Promise<WifiScanResults> {
    const response: WifiScanResults = {
      SSIDs: [],
      reason: "",
    };
    let reason: string = "";
    const cmd = `powershell -NoProfile -Command "$r=[System.Net.Sockets.TcpClient]::new(); $r.ConnectAsync('${settings.iperfServerAdrs}',5201).Wait(2000) | Out-Null; $ok=$r.Connected; $r.Close(); if (-not $ok) { Write-Output 'Failed to connect to ${settings.iperfServerAdrs}:5201' }"`;

    try {
      await execAsync(cmd);
    } catch {
      reason = "Cannot connect to iperf3 server.";
    }
    response.reason = reason;
    return response;
  }

  /**
   * findWifi() - find the name of the wifi interface
   * save in an object variable
   * @returns name of (the first) wifi interface (string)
   */
  async findWifi(): Promise<string> {
    // logger.info(`Called findWifi():`);

    const { stdout } = await execAsync("netsh wlan show interfaces");
    const lines = stdout.split("]n");
    for (const line of lines) {
      const [, key, val] = splitLine(line);
      if (key == "name") {
        this.nameOfWifi = val;
        return val;
      }
    }
    return "";
  }

  /**
   * scanWifi() - return an array of available wifi SSIDs plus a reason string
   * These are sorted by the strongest RSSI
   */
  async scanWifi(_settings: PartialHeatmapSettings): Promise<WifiScanResults> {
    const response: WifiScanResults = {
      SSIDs: [],
      reason: "",
    };

    // Get information about local SSIDs
    try {
      const { stdout } = await execAsync(`netsh wlan show networks mode=bssid`);
      response.SSIDs = parseNetshNetworks(stdout);
      const currSSIDResults = await this.getWifi(_settings);
      // console.log(`getWifi : ${JSON.stringify(currSSIDResults.SSIDs[0])}`);
      const currSSID = response.SSIDs.filter(
        (item) => item.bssid == currSSIDResults.SSIDs[0].bssid,
      );
      currSSID[0].currentSSID = true;
    } catch (err) {
      response.reason = `Cannot get wifi info: ${err}"`;
    }
    return response;
  }

  /**
   * setWifi(settings, newSSID) - associate with the named SSID
   * Use: netsh wlan connect name="YourProfile" ssid="YourSSID"
   *
   * @param settings - same as always
   * @param wifiSettings - new SSID to associate with
   * @returns WifiScanResults - empty array of results, only the reason
   */
  async setWifi(
    settings: PartialHeatmapSettings,
    wifiSettings: WifiResults,
  ): Promise<WifiScanResults> {
    //
    // NOT IMPLEMENTED - DON'T USE THIS FUNCTION
    throw "wifi-heatmapper does not implement setWifi()";

    const response: WifiScanResults = {
      SSIDs: [],
      reason: "",
    };
    return response;

    const profiles = await getProfiles();
    const theProfile = await getProfileFromSSID(profiles, wifiSettings.ssid);

    try {
      await execAsync(
        `netsh wlan connect name="${theProfile}" ssid="${wifiSettings.ssid}"`,
      );
    } catch (err) {
      response.reason = `${err}`;
      return response;
    }

    // if it worked, return information about that interface/SSID
    return await this.getWifi(settings);
  }

  /**
   * getWifi - return the WifiResults for the currently-associated SSID
   * @param _settings (the leading "_" tells Typescript that it is not used)
   * @returns
   */
  async getWifi(_settings: PartialHeatmapSettings): Promise<WifiScanResults> {
    const response: WifiScanResults = {
      SSIDs: [],
      reason: "",
    };
    let stdout: string;
    const command = "netsh wlan show interfaces";
    while (true) {
      const execOutput = await execAsync(command);
      stdout = execOutput.stdout;
      // console.log(`Interfaces: ${stdout}`);
      const lines = stdout.split("\n");
      const state = lines.filter((line) => line.includes("State"));
      // console.log(`State line: ${state}`);
      const [, , val] = splitLine(state[0]);
      if (val == "connected") break;
      await delay(200);
    }
    const parsed = parseNetshInterfaces(stdout);
    // logger.info("Final WiFi data:", parsed);
    response.SSIDs.push(parsed);
    return response;
  }
}
/**
 * END OF WindowsOSWifiActions - the remainder is a set of helper functions
 */

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
 * Note: parseNetshNetworks() and parseNetshInterfaces() both rely
 * on splitLine() to handle localized `netsh` output
 *
 * Their structure is rather different because they deal with somewhat
 * different commandline output formats.
 *
 * It seems possible that they could be factored to have a more
 * similar structure, however they DO seem to produce the proper results.
 */

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
    const [, key, val] = splitLine(line);

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
      wifiResult.bssid = normalizeMacAddress(currentBSSID);
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

/**
 * splitLines - take a line from `netsh...` and split it into the label and value
 * Look up the label in the localization table to get the "real" label
 * Remove digits and whitespace from a label containing SSID or BSSID
 * Remove '"' from returned value
 * @param line - a "label" separated by a ":" followed by a value
 * @returns array of strings: [label, key, value] may be ["", "",""] if no ":"
 */
export function splitLine(line: string): string[] {
  const pos = line.indexOf(":");
  if (pos == -1) return ["", "", ""]; // no ":"? return empty values
  let label = line.slice(0, pos).trim(); // the (trimmed) label up to the ":"
  let key = "";
  const val = line
    .slice(pos + 1)
    .trim()
    .replace(/"/g, ""); // use the rest of the line trimming '"' and whitespace
  // remove trailing digits from BSSID or SSID line
  label = label.replace(/^(B?SSID)\s*\d*\s*$/, "$1");
  key = localizer[label];
  if (!key) key = "";
  return [label, key, val];
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
    let [, key, val] = splitLine(line);
    if (key == "signalStrength") {
      val = val.replace(/%/g, ""); // remove all "%"
    }
    if (key == "bssid") {
      val = normalizeMacAddress(val); // remove ":" or "-" to produce "############"
    }
    if (key != "") {
      assignWindowsNetworkInfoValue(networkInfo, key as keyof WifiResults, val);
    }
  }
  // Check to see if we didn't get any of the important info
  // If not, ask if they could provide info...
  if (
    networkInfo.signalStrength == 0 ||
    networkInfo.channel == 0 ||
    networkInfo.txRate == 0
  ) {
    // console.log(`NetworkInfo: ${JSON.stringify(networkInfo, null, 2)}`);
    throw new Error(
      `Could not read Wi-Fi info. Perhaps wifi-heatmapper is not localized for your system. See https://github.com/hnykda/wifi-heatmapper/issues/26 for details.`,
    );
  }
  if (!isValidMacAddress(networkInfo.bssid)) {
    throw new Error(
      `Invalid BSSID when parsing netsh output: ${networkInfo.bssid}`,
    );
  }
  //set frequency band and rssi
  networkInfo.band = channelToBand(networkInfo.channel);
  networkInfo.rssi = percentageToRssi(networkInfo.signalStrength);

  return networkInfo;
}

/**
 * getProfiles - issue `netsh wlan show profiles` and return an
 * array of profile names (string)
 */
async function getProfiles(): Promise<string[]> {
  const { stdout } = await execAsync("netsh wlan show profiles");
  return parseProfiles(stdout);
}

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
    const [, , val] = splitLine(line);
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

async function getProfileFromSSID(
  profiles: string[],
  theSSID: string,
): Promise<string> {
  for (const profile of profiles) {
    // netsh wlan show profile name="Profile 2"
    const { stdout } = await execAsync(
      `netsh wlan show profile name="${profile}"`,
    );
    const matchedProfile = findProfileFromSSID(stdout, theSSID);
    if (matchedProfile) return matchedProfile;
  }
  // tried them all, didn't find a match. Throw an error
  throw `Didn't find a profile to match ${theSSID}`;
}

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
    const [, key, val] = splitLine(line);
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

    const [, key, value] = splitLine(line);
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
