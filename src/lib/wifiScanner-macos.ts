import { HeatmapSettings, WifiNetwork } from "./types";
import { execAsync } from "./server-utils";
import { getLogger } from "./logger";
import { getDefaultWifiNetwork } from "./wifiScanner";
import { rssiToPercentage } from "./utils";
import { isValidMacAddress, normalizeMacAddress } from "./wifiScanner";

const logger = getLogger("wifi-macOS");

/**
 * scanWifiMacOS() scan the Wifi for MacOS
 * @param settings - the full set of settings, including sudoerPassword
 * @returns a WiFiNetwork description to be added to the surveyPoints
 */
export async function scanWifiMacOS(
  settings: HeatmapSettings,
): Promise<WifiNetwork> {
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
 * @returns
 */
const parseChannel = (channelString: string): number[] => {
  let bandStr = "",
    channelStr = "",
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
      // use startNumber and mhzNumber
    }
    bandStr = "0";
    channelStr = channelParts[1];
    channelWidthStr = channelParts[2];
  }
  band = parseInt(bandStr);
  channel = parseInt(channelStr);
  channelWidth = parseInt(channelWidthStr);
  if (band == 0) {
    band = channel > 14 ? 2 : 5; // patch up the frequency band
  }
  return [band, channel, channelWidth];
};

export function parseWdutilOutput(output: string): WifiNetwork {
  const wifiSection = output.split("WIFI")[1].split("BLUETOOTH")[0];
  const lines = wifiSection.split("\n");
  logger.silly("WDUTIL lines:", lines);
  const networkInfo = getDefaultWifiNetwork();

  lines.forEach((line) => {
    if (line.includes(":")) {
      const colonIndex = line.indexOf(":");
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();
      switch (key) {
        case "SSID":
          networkInfo.ssid = value;
          break;
        case "BSSID":
          networkInfo.bssid = normalizeMacAddress(value);
          break;
        case "RSSI":
          networkInfo.rssi = parseInt(value.split(" ")[0]);
          break;
        case "Channel": {
          [networkInfo.band, networkInfo.channel, networkInfo.channelWidth] =
            parseChannel(value);
          logger.info(`${JSON.stringify(networkInfo)}`);
          break;
          // const channelParts = value.split("/");
          // networkInfo.band = parseInt(channelParts[0].match(/\d+/)?.[0] ?? "0");
          // networkInfo.channel = parseInt(channelParts[0].substring(2));
          // if (channelParts[1]) {
          //   networkInfo.channelWidth = parseInt(channelParts[1]);
          // } else {
          //   networkInfo.channelWidth = 0;
          // }
          // break;
        }
        case "Tx Rate":
          networkInfo.txRate = parseFloat(value.split(" ")[0]);
          break;
        case "PHY Mode":
          networkInfo.phyMode = value;
          break;
        case "Security":
          networkInfo.security = value;
          break;
      }
    }
  });

  logger.trace("Final WiFi data:", networkInfo);
  return networkInfo;
}
