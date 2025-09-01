import { HeatmapSettings, WifiResults, SPAirPortRoot } from "./types";
import { execAsync } from "./server-utils";
import { getLogger } from "./logger";
import {
  rssiToPercentage,
  channelToBand,
  bySignalStrength,
  isValidMacAddress,
  normalizeMacAddress,
  getDefaultWifiResults,
} from "./utils";
/**
 * Map system_profiler values into a WifiResults object
 */
type MappingSpec =
  | string
  | {
      key: string;
      transform?: (value: any) => string | Record<string, string>;
    };
type SPToWifiMap = Record<string, MappingSpec>;

const logger = getLogger("wifi-macOS");

/**
 * scanWifiMacOS() scan the Wifi for MacOS
 * @param settings - the full set of settings, including sudoerPassword
 * @returns a WiFiNetwork description to be added to the surveyPoints
 */
export async function scanWifiMacOS(
  settings: HeatmapSettings,
): Promise<WifiResults> {
  // toggle WiFi off and on to get fresh data
  // console.error("Toggling WiFi off ");
  // let offon = await execAsync(
  //   `echo ${settings.sudoerPassword} | sudo networksetup -setairportpower en0 off`,
  // );
  // console.error("Toggling WiFi on");
  // offon = await execAsync(
  //   `echo ${settings.sudoerPassword} | sudo networksetup -setairportpower en0 on`,
  // );

  const wdutilOutput = await execAsync(
    `echo ${settings.sudoerPassword} | sudo -S wdutil info`,
  );
  const wdutilNetworkInfo = parseWdutilOutput(wdutilOutput.stdout);
  logger.trace("WDUTIL output:", wdutilNetworkInfo);

  if (!isValidMacAddress(wdutilNetworkInfo.ssid)) {
    logger.trace("Invalid SSID, getting it from ioreg");
    const ssidOutput = await getIoregSsid();
    if (isValidMacAddress(ssidOutput)) {
      wdutilNetworkInfo.ssid = ssidOutput;
    }
  }

  if (!isValidMacAddress(wdutilNetworkInfo.bssid)) {
    logger.trace("Invalid BSSID, getting it from ioreg");
    const bssidOutput = await getIoregBssid();
    if (isValidMacAddress(bssidOutput)) {
      wdutilNetworkInfo.bssid = bssidOutput;
    }
  }

  logger.trace("Final WiFi data:", wdutilNetworkInfo);
  wdutilNetworkInfo.signalStrength = rssiToPercentage(wdutilNetworkInfo.rssi);
  return wdutilNetworkInfo;
}

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
 * parseChannel
 * macos 15 gives "2g1/20" where the channel is "1"
 * macos 15 gives "5g144/40" where the channel is "144"
 * macos 12 gives "11 (20 MHz, Active)" where the channel is "11"
 * macos 12 gives "144 (40Mhz, DFS)" where the channel is 144
 * @param channelString - see the formats above
 * @returns band (2 or 5 GHz); channel, channelWidth
 */
const parseChannel = (channelString: string): number[] => {
  let bandStr = "0",
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
    bandStr = channelParts[0].match(/\d+/)?.[0] ?? "0";
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
  band = parseInt(bandStr);
  channel = parseInt(channelStr);
  channelWidth = parseInt(channelWidthStr);
  band = channel > 14 ? 5 : 2.4; // patch up the frequency band
  return [band, channel, channelWidth];
};

/**
 * parseWdutilOutput - parses the string from `wdutil` into a WifiNetwork object
 */
export function parseWdutilOutput(output: string): WifiResults {
  const wifiResults = getDefaultWifiResults();
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
          wifiResults.ssid = value;
          break;
        case "BSSID":
          wifiResults.bssid = normalizeMacAddress(value);
          break;
        case "RSSI":
          wifiResults.rssi = parseInt(value.split(" ")[0]);
          // macOS returns dBm - convert to percentage
          wifiResults.signalStrength = rssiToPercentage(wifiResults.rssi);
          break;
        case "Channel": {
          [wifiResults.band, wifiResults.channel, wifiResults.channelWidth] =
            parseChannel(value);
          break;
        }
        case "Tx Rate":
          wifiResults.txRate = parseFloat(value.split(" ")[0]);
          break;
        case "PHY Mode":
          wifiResults.phyMode = value;
          break;
        case "Security":
          wifiResults.security = value;
          break;
      }
    }
  });
  return wifiResults;
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
    active: Boolean(sp.active),
  };
  // console.log(`Final mapping: ${JSON.stringify(result, null, 2)}`);

  return result;
}

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
