import {
  PartialHeatmapSettings,
  WifiResults,
  WifiScanResults,
  WifiActions,
} from "./types";
import { execAsync } from "./server-utils";
import { getLogger } from "./logger";
import {
  channelToBand,
  delay,
  getDefaultWifiResults,
  percentageToRssi,
  bySignalStrength,
} from "./utils";
import { setSSID, getSSID } from "./server-globals";

const logger = getLogger("wifi-Linux");

export class LinuxWifiActions implements WifiActions {
  nameOfWifi: string = "";

  /**
   * preflightSettings - check whether the settings are "primed" to run a test
   * Tests:
   *   * iperfServerAdrs - non-empty
   *   * testDuration - greater than zero
   *   * sudoerPassword - non-empty and correct
   *
   * @param settings
   * @returns empty array of SSIDs, plus "" or error string
   */
  async preflightSettings(
    settings: PartialHeatmapSettings,
  ): Promise<WifiScanResults> {
    const response: WifiScanResults = {
      SSIDs: [],
      reason: "",
    };

    let reason: string = "";
    // check that iperf3 is really installed if it's needed
    try {
      if (settings.iperfServerAdrs != "localhost") {
        await execAsync("iperf3 --version");
      }
    } catch {
      reason =
        "iperf3 not installed. Install it,\n or set the iperfServer to 'localhost'.";
    }
    // console.log(`partialSettings: ${JSON.stringify(settings)}`);
    // test duration must be > 0 - otherwise iperf3 runs forever
    if (settings.testDuration <= 0) {
      reason = "Test duration must be greater than zero.";
    }

    // iperfServerAddress must not be empty or ""
    else if (!settings.iperfServerAdrs) {
      reason = "Please set iperf3 server address";
    }

    // Linux requires a sudo password
    else if (!settings.sudoerPassword || settings.sudoerPassword == "") {
      reason = "Please set sudo password. It is required on macOS.";
    }

    // check that the sudo password is actually correct
    // execAsync() throws if there is an error
    else {
      try {
        await execAsync(`echo ${settings.sudoerPassword} | sudo -S ls`);
      } catch {
        reason = "Please enter a valid sudo password.";
      }
    }

    // fill in the reason and return it
    response.reason = reason;
    return response;
  }

  /**
   * checkIperfServer() - test if an iperf3 server is available at the address
   * @param settings includes the iperfServerAddress
   * @returns empty array of SSIDs, plus "" or error string
   */
  async checkIperfServer(
    settings: PartialHeatmapSettings,
  ): Promise<WifiScanResults> {
    const response: WifiScanResults = {
      SSIDs: [],
      reason: "",
    };
    let reason: string = "";

    // check that we can actually connect to the iperf3 server
    // command throws if there is an error
    try {
      await execAsync(`nc -vz ${settings.iperfServerAdrs} 5201`);
    } catch {
      reason = "Cannot connect to iperf3 server.";
    }
    response.reason = reason;
    return response;
  }

  /**
   * findWifiInterface() - find the name of the wifi interface
   * save in a class variable
   * @returns name of (the first) wifi interface (string)
   */
  async findWifiInterface(): Promise<string> {
    logger.debug("Inferring WLAN interface ID on Linux");
    const { stdout } = await execAsync(
      "iw dev | awk '$1==\"Interface\"{print $2}' | head -n1",
    );
    this.nameOfWifi = stdout.trim();
    return this.nameOfWifi;
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

    try {
      // Get the Wifi information from system_profiler
      const result = await execAsync(`nmcli -t dev wifi list`);
      const nmcliOutput = JSON.parse(result.stdout);

      response.SSIDs = getCandidateSSIDs(nmcliOutput);
      // console.log(`Local SSIDs: ${response.SSIDs.length}`);
      // console.log(`Local SSIDs: ${JSON.stringify(response.SSIDs, null, 2)}`);
    } catch (err) {
      response.reason = `Cannot get wifi info: ${err}"`;
    }
    return response; // WifiScanResults which is array of WifiResults and error code
  }

  /**
   * setWifi(settings, newWifiSettings) - associate with the named SSID
   *
   * @param settings - same as always
   * @param newWifiSettings - .ssid has the new SSID to associate with
   * @returns either:
   *    WifiScanResults
   *    or throw("reason explaining the error")
   */
  async setWifi(
    settings: PartialHeatmapSettings,
    newWifiSettings: WifiResults,
  ): Promise<WifiScanResults> {
    const response: WifiScanResults = {
      SSIDs: [],
      reason: "",
    };
    setSSID(null); // assume a bad outcome
    let netInfo: WifiResults;

    if (!newWifiSettings) {
      throw `setWifi error: Empty SSID "${JSON.stringify(newWifiSettings)}`;
    }

    console.log(
      `Setting Wifi SSID on interface ${this.nameOfWifi}: ${newWifiSettings.ssid}`,
    );
    // `networksetup -setairportnetwork ${this.nameOfWifi} ${newWifiSettings.ssid}`
    const { stdout, stderr } = await execAsync(
      `networksetup -setairportnetwork ${this.nameOfWifi} ${newWifiSettings.ssid}`,
    );
    if (stdout != "" || stderr != "") {
      throw stdout + stderr;
    }

    const start = Date.now();
    const timeout = 40_000; // 40 seconds
    while (true) {
      if (Date.now() > start + timeout) {
        throw `Can't set wifi to "${newWifiSettings.ssid}": Timed out after ${timeout / 1000} seconds`;
      }
      netInfo = await this.getWdutilResults(settings);
      console.log(`wdutils: SSID: ${netInfo.ssid} txRate: ${netInfo.txRate}`);
      if (netInfo.txRate != 0) {
        netInfo.ssid = newWifiSettings.ssid;
        setSSID(netInfo); // save it globally
        response.SSIDs.push(netInfo);
        return response;
      }
      await delay(200);
    }
  }

  /**
   * getWifi - return the WifiResults for the currently-associated SSID
   * @param settings
   * @returns
   */
  async getWifi(settings: PartialHeatmapSettings): Promise<WifiScanResults> {
    const response: WifiScanResults = {
      SSIDs: [],
      reason: "",
    };
    try {
      const netInfo: WifiResults = await this.getWdutilResults(settings);
      const wifiResults = getSSID(); // SSID we tried to set
      // if the returned SSID contains "redacted" use the "global SSID"
      if (wifiResults != null && netInfo.ssid.includes("redacted")) {
        netInfo.ssid = wifiResults.ssid;
      }
      response.SSIDs.push(netInfo);
    } catch (err) {
      response.reason = `Can't getWifi: ${err}`;
    }
    return response;
  }
}
/**
 * splitColonDelimited() - split a colon-delimited string
 * @param line - read from nmcli -t command (":" delimited)
 * @returns array of columns
 */
export function splitColonDelimited(line: string) {
  const result = [];
  let current = "";
  let i = 0;

  const str = line.trim();
  if (str.length == 0) return [];
  str.concat(":");
  while (i < str.length) {
    if (str[i] === "\\" && i + 1 < str.length) {
      // Handle escaped characters
      current += str[i + 1]; // Add the escaped character
      i += 2; // Skip both the backslash and the escaped character
    } else if (str[i] === ":") {
      // Unescaped colon - end of field
      result.push(current);
      current = "";
      i++;
    } else {
      // Regular character
      current += str[i];
      i++;
    }
  }

  // Add the last field
  result.push(current);

  return result;
}

/**
 * getCandidates(nmcliData) - pluck up the local SSIDs from nmcli output
 * @param - Object that contains output of system_profiler for Wifi
 * @returns WifiResults[] sorted by signalStrength
 */
export const getCandidateSSIDs = (nmcliData: string): WifiResults[] => {
  const candidates = [];
  const lines = nmcliData.split("\n");
  for (const line of lines) {
    if (line.startsWith("//")) continue;
    const cols = splitColonDelimited(line);
    if (cols.length == 0) continue;

    // now do something with the columns
    const candidate = getDefaultWifiResults();
    candidate.bssid = cols[1];
    candidate.ssid = cols[2];
    candidate.channel = parseInt(cols[4]);
    candidate.txRate = stripMbps(cols[5]);
    candidate.signalStrength = parseInt(cols[6]);
    candidate.rssi = percentageToRssi(candidate.signalStrength);
    candidate.band = channelToBand(candidate.channel);
    candidate.security = cols[8];
    // skip phymode, channelWidth

    candidates.push(candidate);
    // console.log(`candidate: ${JSON.stringify(candidate, null, 2)}`);
  }
  // eliminate any RSSI=0 (no reading), then sort by RSSI
  const nonZeroCandidates = candidates.filter((item) => item.rssi != 0);
  // eliminate any SSIDs to be ignored
  // const nonIgnoredCandidates = nonZeroCandidates.filter(
  //   (item) => !ignoredSSIDs.includes(item.ssid),
  // );
  // sort the remainder by signal strength
  const sortedCandidates = nonZeroCandidates.sort(bySignalStrength);
  return sortedCandidates;
};

/**
 * stripMbps() - retain the number at head of a string
 * @param string - "123 Mbits/s"
 * @result numeric 123
 */
function stripMbps(str: string): number {
  const strs = str.split(" ");
  return parseInt(strs[0]);
}
