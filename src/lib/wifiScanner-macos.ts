import { HeatmapSettings, WifiNetwork } from "./types";
import { execAsync } from "./server-utils";
import { getLogger } from "./logger";
// import os from "os";
import { getDefaultWifiNetwork } from "./wifiScanner";
import { rssiToPercentage } from "./utils";
// import { reverseLookup } from "./localization";
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
          const channelParts = value.split("/");
          networkInfo.frequency = parseInt(
            channelParts[0].match(/\d+/)?.[0] ?? "0",
          );
          networkInfo.channel = parseInt(channelParts[0].substring(2));
          if (channelParts[1]) {
            networkInfo.channelWidth = parseInt(channelParts[1]);
          } else {
            networkInfo.channelWidth = 0;
          }
          break;
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
