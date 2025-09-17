import {
  PartialHeatmapSettings,
  WifiResults,
  WifiScanResults,
  WifiActions,
  SPAirPortRoot,
} from "./types";
import { execAsync } from "./server-utils";
import { getLogger } from "./logger";
import { rssiToPercentage, bySignalStrength, delay } from "./utils";
import { isValidMacAddress, normalizeMacAddress, channelToBand } from "./utils";
import { setSSID, getSSID } from "./server-globals";

const logger = getLogger("wifi-macOS");

export class MacOSWifiActions implements WifiActions {
  nameOfWifi: string = "";

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

    // macOS requires a sudo password
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
   * findWifi() - find the name of the wifi interface
   * save in a class variable
   * @returns name of (the first) wifi interface (string)
   */
  async findWifi(): Promise<string> {
    // logger.info(`Called findWifi():`);

    const { stdout } = await execAsync(
      'networksetup -listallhardwareports | grep -A 1 "Wi-Fi\\|Airport" | grep "Device" |  sed "s/Device: //"',
    );
    this.nameOfWifi = stdout;
    return stdout;
  }

  /**
   * findBestWifi() - return an array of available wifi SSIDs plus a reason string
   * These are sorted by the strongest RSSI
   */
  async scanWifi(_settings: PartialHeatmapSettings): Promise<WifiScanResults> {
    const response: WifiScanResults = {
      SSIDs: [],
      reason: "",
    };
    // let stdout: string;
    let jsonResults: SPAirPortRoot;
    const currentIf = await this.findWifi();

    try {
      // Get the Wifi information from system_profiler
      const result = await execAsync(`system_profiler -json SPAirPortDataType`);
      jsonResults = JSON.parse(result.stdout);

      // jsonResults holds the Wifi environment from system_profiler
      response.SSIDs = getCandidateSSIDs(
        jsonResults,
        currentIf,
        _settings.ignoredSSIDs,
      );
      // console.log(`Local SSIDs: ${response.SSIDs.length}`);
      // console.log(`Local SSIDs: ${JSON.stringify(response.SSIDs, null, 2)}`);
    } catch (err) {
      response.reason = `Cannot get wifi info: ${err}"`;
    }
    // ======= FINALLY WE ARE DONE! =======
    return response;
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

  /**
   * getWdutilResults() call `wdutil` to get the signal strength, etc.
   * This code simply parses the response, returning all the values it finds
   * (txRate may not be available right away, so the caller may re-try)
   * @param settings - the full set of settings, including sudoerPassword
   * @returns a WiFiResults description to be added to the surveyPoints
   */
  async getWdutilResults(
    settings: PartialHeatmapSettings,
  ): Promise<WifiResults> {
    // Issue the OS command
    const wdutilOutput = await execAsync(
      `echo ${settings.sudoerPassword} | sudo -S wdutil info`,
    );
    // parse that command into wdutilNetworkInfo
    const wdutilNetworkInfo = parseWdutilOutput(wdutilOutput.stdout);
    // logger.trace("WDUTIL output:", wdutilNetworkInfo);

    if (!isValidMacAddress(wdutilNetworkInfo.ssid)) {
      // logger.trace("Invalid SSID, getting it from ioreg");
      const ssidOutput = await getIoregSsid();
      if (isValidMacAddress(ssidOutput)) {
        wdutilNetworkInfo.ssid = ssidOutput;
      }
    }

    if (!isValidMacAddress(wdutilNetworkInfo.bssid)) {
      // logger.trace("Invalid BSSID, getting it from ioreg");
      const bssidOutput = await getIoregBssid();
      if (isValidMacAddress(bssidOutput)) {
        wdutilNetworkInfo.bssid = bssidOutput;
      }
    }

    logger.trace("Final WiFi data:", wdutilNetworkInfo);
    // console.log(`Wifi strength: ${wdutilNetworkInfo.signalStrength}%`);
    return wdutilNetworkInfo;
  }
}
/**
 * parse `ioreg` commands (used if "wdutil" doesn't work)
 * @returns
 */
const getIoregSsid = async (): Promise<string> => {
  const { stdout } = await execAsync(
    "ioreg -l -n AirPortDriver | grep IO80211SSID | sed 's/^.*= \"\\(.*\\)\".*$/\\1/; s/ /_/g'",
  );
  return stdout.trim();
};

const getIoregBssid = async (): Promise<string> => {
  const { stdout } = await execAsync(
    "ioreg -l | grep \"IO80211BSSID\" | awk -F' = ' '{print $2}' | sed 's/[<>]//g'",
  );
  return stdout.trim();
};

/**
 * parseChannel() from the `wdutil info` output
 * macos 15 gives "2g1/20" where the channel is "1"
 * macos 15 gives "5g144/40" where the channel is "144"
 * macos 12 gives "11 (20 MHz, Active)" where the channel is "11"
 * macos 12 gives "144 (40Mhz, DFS)" where the channel is "144"
 * @param channelString - see the formats above
 * @returns [ band (2.4 or 5 GHz), channel, channelWidth ]
 */
const parseChannel = (channelString: string): number[] => {
  let //bandStr,
    channelStr = "0",
    channelWidthStr = "0",
    band = 0,
    channel = 0,
    channelWidth = 0;

  // macOS 15 - "2g1/20" or "5g144/40"
  const channelParts = channelString.split("/");

  // macos 15 has a "/" - parse it
  if (channelParts.length == 2) {
    // leading digit is the band
    // bandStr = channelParts[0].match(/\d+/)?.[0] ?? "0";
    // channel number follows the "g"
    channelStr = channelParts[0].substring(2);
    if (channelParts[1]) {
      // the channel width follows the "/"
      channelWidthStr = channelParts[1];
    } else {
      channelWidthStr = "0";
    }
  }
  // macos 12 - "11 (20 MHz, Active)" or "144 (40Mhz, DFS)"
  else {
    const match = channelString.match(/(\d+).*?(\d+)\s*[Mm][Hh][Zz]/);
    if (match) {
      [, channelStr, channelWidthStr] = match;
    }
  }

  // 2.4GHz or 5GHz processing
  // band = parseInt(bandStr); // IGNORE THE PARSED-OUT "bandStr"
  channel = parseInt(channelStr);
  channelWidth = parseInt(channelWidthStr);
  band = channel > 14 ? 5 : 2.4; // patch up the frequency band

  return [band, channel, channelWidth];
};

/**
 * parseWdutilOutput - parses the string from `wdutil` into a WifiNetwork object
 */
export function parseWdutilOutput(output: string): WifiResults {
  const partialNetworkInfo: Partial<WifiResults> = {};
  const wifiSection = output.split("WIFI")[1].split("BLUETOOTH")[0];
  const lines = wifiSection.split("\n");
  logger.silly("WDUTIL lines:", lines);

  lines.forEach((line) => {
    if (line.includes(":")) {
      const colonIndex = line.indexOf(":");
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();
      switch (key) {
        case "SSID":
          partialNetworkInfo.ssid = value;
          break;
        case "BSSID":
          partialNetworkInfo.bssid = normalizeMacAddress(value);
          break;
        case "RSSI":
          partialNetworkInfo.rssi = parseInt(value.split(" ")[0]);
          // macOS returns dBm - convert to percentage
          partialNetworkInfo.signalStrength = rssiToPercentage(
            partialNetworkInfo.rssi,
          );
          break;
        case "Channel": {
          [
            partialNetworkInfo.band,
            partialNetworkInfo.channel,
            partialNetworkInfo.channelWidth,
          ] = parseChannel(value);
          break;
        }
        case "Tx Rate":
          partialNetworkInfo.txRate = parseFloat(value.split(" ")[0]);
          break;
        case "PHY Mode":
          partialNetworkInfo.phyMode = value;
          break;
        case "Security":
          partialNetworkInfo.security = value;
          break;
      }
    }
  });
  if (partialNetworkInfo.txRate != 0) {
    // logger.info(
    //   `RSSI: ${partialNetworkInfo.rssi} txRate: ${partialNetworkInfo.txRate}`,
    // );
  }

  const networkInfo: WifiResults = partialNetworkInfo as WifiResults;
  // logger.info(`Final WiFi data: ${JSON.stringify(networkInfo)}`);
  return networkInfo;
}

/**
 * getCandidates(jsonResults) - pluck up the local SSIDs from the JSON
 * @param - Object that contains output of system_profiler for Wifi
 * @returns WifiResults[] sorted by signalStrength
 */

export const getCandidateSSIDs = (
  spData: SPAirPortRoot,
  currentInterface: string,
  ignoredSSIDs: string[],
): WifiResults[] => {
  // pluck out the local candidate SSIDs from the system_profiler output
  const localCandidates = (
    spData.SPAirPortDataType.flatMap(
      (entry) => entry.spairport_airport_interfaces || [],
    ).find((iface) => iface._name === currentInterface)
      ?.spairport_airport_other_local_wireless_networks ?? []
  ).map((network) => ({
    ...network,
    active: false,
  }));
  // const localCount = localCandidates.length;

  // Get the current SSID (if any)
  const current = spData.SPAirPortDataType.flatMap(
    (entry) => entry.spairport_airport_interfaces || [],
  ).find(
    (iface) => iface._name === currentInterface,
  )?.spairport_current_network_information;
  // add active: true if there is an SSID
  const fullCurrent = current ? { ...current, active: true } : undefined;

  // let currentCount = 0;
  if (fullCurrent) {
    // const currentPlus = { ...current, inUse: true };
    // currentCount = 1;
    localCandidates.push(fullCurrent);
  }
  // logSPResults(localCandidates);

  // convert each to a WifiResults
  const candidates = localCandidates.map((item) => convertToWifiResults(item));

  // console.log(
  //   `SSIDs: ${localCount} ${currentCount} \n${JSON.stringify(candidates, null, 2)}`,
  // );

  // eliminate any RSSI=0 (no reading), then sort by RSSI
  const nonZeroCandidates = candidates.filter((item) => item.rssi != 0);
  // eliminate any SSIDs to be ignored
  const nonIgnoredCandidates = nonZeroCandidates.filter(
    (item) => !ignoredSSIDs.includes(item.ssid),
  );
  // sort the remainder by signal strength
  const sortedCandidates = nonIgnoredCandidates.sort(bySignalStrength);

  return sortedCandidates;
};

/**
 * Map system_profiler values into a WifiResults object
 */
// type AObject = Record<string, any>;
type MappingSpec =
  | string
  | {
      key: string;
      transform?: (value: any) => string | Record<string, string>;
    };
type SPToWifiMap = Record<string, MappingSpec>;

// A map to convert from system_profiler property names to WifiResults property names
// This map uses the property's value unchanged,
//  or uses the transform to convert the value to the desired form
const spToWifiResultMap: SPToWifiMap = {
  _name: "ssid",
  spairport_network_phymode: "phyMode",
  spairport_network_rate: "txRate",
  spairport_network_channel: {
    key: "channel", // return channel and possibly channelWidth
    transform: (val: string) => parseChannelInfo(val), // e.g. "6" from "6 (2GHz, 20MHz)",
  },
  spairport_network_bssid: "bssid",
  spairport_security_mode: {
    key: "security",
    transform: (val: string) => SECURITY_LABELS[val] ?? "Unrecognized",
  },
  spairport_signal_noise: {
    key: "rssi",
    transform: (val: string) => parseRSSI(val), // e.g. "-56"
  },
  // we don't use these properties from system_profiler
  // spairport_network_mcs: 15,
  // spairport_network_type: "spairport_network_type_station",
};

/**
 * mapSPToWifiResults - take the values from system_profiler
 *   and return the corresponding values placed in a WifiResults
 * @param aObject values from a system_profiler AirportNetwork
 * @param aToBMap a mapping function from system_profiler prop names to WifiResults
 * @returns WifiResults, but with all values as a string
 */
function mapSPToWifiResults(
  aObject: Record<string, any>, // actually it's an AirportNetwork
  aToBMap: Record<string, MappingSpec>,
): Record<string, string> {
  const bObject: Record<string, string> = {}; // a

  for (const [aKey, mapping] of Object.entries(aToBMap)) {
    let bKey: string;
    let transform: ((val: any) => string | Record<string, string>) | undefined;

    if (typeof mapping === "string") {
      bKey = mapping;
    } else {
      bKey = mapping.key;
      transform = mapping.transform;
    }

    const raw = aKey in aObject ? aObject[aKey] : undefined;

    if (raw === undefined) {
      bObject[bKey] = "";
      continue;
    }

    const result = transform ? transform(raw) : String(raw);

    if (typeof result === "string") {
      bObject[bKey] = result;
    } else {
      Object.assign(bObject, result);
    }
  }
  return postProcessWifiResults(bObject); // return final object as STRINGs

  // return bObject;
}

const SECURITY_LABELS: Record<string, string> = {
  spairport_security_mode_none: "None",
  spairport_security_mode_wep: "WEP",
  spairport_security_mode_wpa_personal: "WPA Personal",
  spairport_security_mode_wpa2_personal: "WPA2 Personal",
  spairport_security_mode_wpa3_personal: "WPA3 Personal",
  spairport_security_mode_wpa_enterprise: "WPA Enterprise",
  spairport_security_mode_wpa2_enterprise: "WPA2 Enterprise",
  spairport_security_mode_wpa3_enterprise: "WPA3 Enterprise",
  spairport_security_mode_unknown: "Unknown",
};

/**
 * parseChannelInfo - parse channel: from system_profiler
 * @param input - string received from system_profiler
 * @returns channel, channelWidth, channelWidthIndicator,
 *
 * All return values are STRINGS
 * - "6 (2GHz, 20MHz)", return "6", "20", "" (15.5)
 * - 6 (a number), return "6", "20", "",  (10.15)
 * - "149,+1", return "149", "", "+1"  (10.15)
 *
 * channelWidthIndicator is a string that is used
 *  along with the phyMode to determine channelWidth
 *  See Theory of Operation
 */
function parseChannelInfo(input: string): {
  channel: string;
  channelWidth: string;
  channelWidthIndicator: string;
} {
  // if a bare number, macOS 10.15 style data, default (20MHz) channel width
  if (typeof input === "number") {
    return {
      channel: String(input),
      channelWidth: "20", // default channel width
      channelWidthIndicator: "", // no further processing needed
    };
  }
  // look for "+" - macOS 10.15 style channel, with width indication
  if (input.includes("+") || input.includes("-")) {
    const chMatch = input.match(/(\d+),([+-\d+])/);
    // console.log(`Found + in channel ${input}: ${chMatch[1]}, ${chMatch[2]}`);
    return {
      channel: chMatch?.[1] ?? "",
      channelWidth: "", // determine this in postProcessWifiResults()
      channelWidthIndicator: chMatch?.[2] ?? "", // ditto
    };
  }
  // parse out "6 (2GHz, 20MHz)"
  const match = input.match(/^(\d+)(?:\s+\([^(,]+,\s*(\d+)MHz\))?$/);
  const channel = match?.[1] ?? "";
  return {
    channel: channel,
    channelWidth: match?.[2] ?? "",
    channelWidthIndicator: "",
  };
}

/**
 * parseRSSI()
 * @param input - RSSI string from system_profiler
 * @returns an object with both rssi: and signalStrength: properties as strings
 */
function parseRSSI(input: string): {
  rssi: string;
  signalStrength: string;
} {
  const rssi = parseInt(input.split(" ")[0]);
  return {
    rssi: String(rssi),
    signalStrength: String(rssiToPercentage(rssi)),
  };
}

/**
 * convertToWifiResult()
 * re-map the properties of a system_profiler results into
 *    a WifiResults object (which are all strings)
 * Then convert the proper values back to numbers
 */
function convertToWifiResults(obj: object): WifiResults {
  const sp = mapSPToWifiResults(obj, spToWifiResultMap);
  // console.log(`mapped to WifiResults: ${JSON.stringify(sp, null, 2)}`);
  const result: WifiResults = {
    ssid: sp.ssid,
    bssid: sp.bssid,
    security: sp.security,
    phyMode: sp.phyMode,
    rssi: Number(sp.rssi),
    signalStrength: Number(sp.signalStrength),
    channel: Number(sp.channel),
    band: Number(sp.band),
    txRate: Number(sp.txRate),
    channelWidth: Number(sp.channelWidth),
    // activeSSID: Boolean(sp.active),
  };
  // console.log(`Final mapping: ${JSON.stringify(result, null, 2)}`);

  return result;
}

/**
 * postProcessWifiResults - examine channel and channelWidthIndicator
 *   to return proper band and channelWidth
 * @param obj almost complete WifiResults
 * @returns WifiResults (but with all values as strings)
 */
function postProcessWifiResults(
  obj: Record<string, string>,
): Record<string, string> {
  obj.band = String(channelToBand(parseInt(obj.channel)));
  obj.channelWidth = inferChannelWidth(obj.channelWidthIndicator, obj.phyMode);
  if (!obj.rssi) {
    // console.log(`No RSSI found...`);
    obj.rssi = "-100";
    obj.signalStrength = "0";
  }

  return obj;
}

function inferChannelWidth(channel: string, phymode: string): string {
  const hasOffset = channel != "";

  switch (phymode) {
    case "802.11ac":
      return hasOffset ? "80" : "20";
    case "802.11n":
      return hasOffset ? "40" : "20";
    case "802.11ax":
      return hasOffset ? "80" : "20"; // or 160 if needed, but 80 is safer default
    default:
      return "20";
  }
}

export function logSPResults(results: Record<string, any>[]): void {
  logger.info(`===== system_profiler results =====`);
  results.forEach(logSPResult);
}

export async function logSPResult(result: Record<string, any>) {
  logger.info(
    `active: ${result.active}; signalStrength: ${result.spairport_signal_noise}; channel: ${result.spairport_network_channel}; ssid: ${result._name}`,
  );
}
