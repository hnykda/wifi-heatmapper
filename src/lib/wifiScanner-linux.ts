import { HeatmapSettings, WifiNetwork } from "./types";
import { execAsync } from "./server-utils";
import { getLogger } from "./logger";
// import os from "os";
import { getDefaultWifiNetwork } from "./wifiScanner";
import { rssiToPercentage } from "./utils";
// import { reverseLookup } from "./localization";
import { normalizeMacAddress } from "./wifiScanner";
// import { reverseLookup } from "./localization";

const logger = getLogger("wifi-Linux");

async function inferWifiDeviceIdOnLinux(): Promise<string> {
  logger.debug("Inferring WLAN interface ID on Linux");
  const { stdout } = await execAsync(
    "iw dev | awk '$1==\"Interface\"{print $2}' | head -n1",
  );
  return stdout.trim();
}

async function iwDevLink(interfaceId: string, pw: string): Promise<string> {
  const command = `echo "${pw}" | sudo -S iw dev ${interfaceId} link`;
  const { stdout } = await execAsync(command);
  // console.log(`=== Link:\n${stdout}`);
  return stdout;
}

async function iwDevInfo(interfaceId: string): Promise<string> {
  const command = `iw dev ${interfaceId} info`;
  const { stdout } = await execAsync(command);
  // console.log(`=== Info:\n${stdout}`);
  return stdout;
}

/**
 * scanWifiLinux() scan the Wifi for Linux
 * @returns a WiFiNetwork description to be added to the surveyPoints
 */
export async function scanWifiLinux(
  heatmapsettings: HeatmapSettings,
): Promise<WifiNetwork> {
  let wlanInterface: string = "";
  wlanInterface = await inferWifiDeviceIdOnLinux();
  // console.log(`password: ${JSON.stringify(heatmapsettings.sudoerPassword)}`);

  const [linkOutput, infoOutput] = await Promise.all([
    iwDevLink(wlanInterface, heatmapsettings.sudoerPassword),
    iwDevInfo(wlanInterface),
  ]);

  logger.trace("IW output:", linkOutput);
  logger.trace("IW info:", infoOutput);
  const parsed = parseIwOutput(linkOutput, infoOutput);
  logger.trace("Final WiFi data:", parsed);
  return parsed;
}

/**
 * Parse (Unix) wdutil output
 * @param (string) output
 * @returns WifiNetwork
 */

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

/**
 * parseIwOutput from Linux host
 * @param linkOutput
 * @param infoOutput
 * @returns
 */
export function parseIwOutput(
  linkOutput: string,
  infoOutput: string,
): WifiNetwork {
  const networkInfo = getDefaultWifiNetwork();
  const linkLines = linkOutput.split("\n");
  linkLines.forEach((line) => {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith("SSID:")) {
      networkInfo.ssid = trimmedLine.split("SSID:")[1]?.trim() || "";
    } else if (trimmedLine.startsWith("Connected to")) {
      networkInfo.bssid = normalizeMacAddress(
        trimmedLine.split(" ")[2]?.trim() || "",
      );
    } else if (trimmedLine.startsWith("signal:")) {
      const signalMatch = trimmedLine.match(/signal:\s*(-?\d+)\s*dBm/);
      if (signalMatch) {
        networkInfo.rssi = parseInt(signalMatch[1]);
      }
    } else if (trimmedLine.startsWith("freq:")) {
      const freqMatch = trimmedLine.match(/freq:\s*(\d+)/);
      if (freqMatch) {
        const freqMhz = parseInt(freqMatch[1]);
        networkInfo.frequency = Math.round((freqMhz / 1000) * 100) / 100; // Convert MHz to GHz with 2 decimal places
      }
    } else if (trimmedLine.startsWith("tx bitrate:")) {
      const txRate = trimmedLine.split("tx bitrate:")[1]?.trim() || "";
      networkInfo.txRate = parseFloat(txRate.split(" ")[0]);
    } else if (trimmedLine.includes("width:")) {
      const width = trimmedLine.split("width:")[1]?.trim() || "";
      networkInfo.channelWidth = parseInt(width.split(" ")[0]);
    }
  });

  const infoLines = infoOutput.split("\n");
  infoLines.forEach((line) => {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith("channel")) {
      const channelMatch = trimmedLine.match(
        /channel\s+(\d+)\s+\((\d+)\s*MHz\),\s*width:\s*(\d+)\s*MHz/,
      );
      if (channelMatch) {
        networkInfo.channel = parseInt(channelMatch[1]);
        // Update frequency if not already set from linkOutput
        if (!networkInfo.frequency) {
          const freqMhz = parseInt(channelMatch[2]);
          networkInfo.frequency = Math.round((freqMhz / 1000) * 100) / 100;
        }
        networkInfo.channelWidth = parseInt(channelMatch[3]);
      }
    }
  });
  networkInfo.signalStrength = rssiToPercentage(networkInfo.rssi);
  // console.log(`=== networkInfo: ${JSON.stringify(networkInfo)}`);

  return networkInfo;
}
