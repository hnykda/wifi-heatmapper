import { ScannerSettings, WifiNetwork } from "./types";
import { execAsync } from "./server-utils";
import { getLogger } from "./logger";

const logger = getLogger("wifiScanner");
import { rssiToPercentage } from "./utils";
import { percentageToRssi, rssiToPercentage } from "./utils";

const getDefaultWifiNetwork = (): WifiNetwork => ({
  ssid: "",
  bssid: "",
  rssi: 0,
  signalStrength: 0,
  channel: 0,
  frequency: 0,
  channelWidth: 0,
  txRate: 0,
  phyMode: "",
  security: "",
});

const hasValidData = (wifiData: WifiNetwork): boolean => {
  if (!isValidMacAddress(wifiData.ssid)) {
    logger.warn("Invalid SSID (we were not able to get it):", wifiData.ssid);
  }
  if (!isValidMacAddress(wifiData.bssid)) {
    logger.warn("Invalid BSSID (we were not able to get it):", wifiData.bssid);
  }

  return (
    // we also used to check for ssid and bssid, but at leaston MacOS 15.3.1
    // these are not present in the output of any of the known OS commands
    // either rssi or signalStrength must be non-zero
    wifiData.rssi !== 0 || wifiData.signalStrength !== 0
  );
};

/**
 * Gets the current WiFi network name, BSSID of the AP it's connected to, and the RSSI.
 */
export async function scanWifi(
  settings: ScannerSettings,
): Promise<WifiNetwork> {
  let wifiData: WifiNetwork | null = null;

  try {
    const platform = process.platform;

    if (platform === "darwin") {
      wifiData = await scanWifiMacOS(settings);
    } else if (platform === "win32") {
      wifiData = await scanWifiWindows();
    } else if (platform === "linux") {
      wifiData = await scanWifiLinux(settings);
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }
  } catch (error_) {
    const error = error_ as Error;
    logger.error("Error scanning WiFi:", error);
    if (error.message.includes("sudo")) {
      logger.error(
        "This command requires sudo privileges. Please run the application with sudo.",
      );
    }
    throw error;
  }

  if (!hasValidData(wifiData)) {
    throw new Error(
      "Measurement failed. We were not able to get good enough WiFi data: " +
        JSON.stringify(wifiData),
    );
  }

  return wifiData;
}

const normalizeMacAddress = (macAddress: string): string => {
  return macAddress.replace(/[:-]/g, "").toLowerCase();
};

const isValidMacAddress = (macAddress: string): boolean => {
  const cleanedMacAddress = normalizeMacAddress(macAddress);
  if (cleanedMacAddress === "000000000000") {
    // sometimes returned by ioreg, for example
    return false;
  }
  return /^[0-9a-f]{12}$/.test(cleanedMacAddress);
};

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

export async function scanWifiMacOS(
  settings: ScannerSettings,
): Promise<WifiNetwork> {
  // toggle WiFi off and on to get fresh data
  await execAsync(
    `echo ${settings.sudoerPassword} | sudo networksetup -setairportpower en0 off; sudo networksetup -setairportpower en0 off`,
  );
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

async function scanWifiWindows(): Promise<WifiNetwork> {
  const command = "netsh wlan show interfaces";
  const { stdout } = await execAsync(command);
  logger.trace("NETSH output:", stdout);
  const parsed = parseNetshOutput(stdout);
  logger.trace("Final WiFi data:", parsed);
  return parsed;
}

async function iwDevLink(interfaceId: string): Promise<string> {
  const command = `iw dev ${interfaceId} link`;
  const { stdout } = await execAsync(command);
  return stdout;
}

async function iwDevInfo(interfaceId: string): Promise<string> {
  const command = `iw dev ${interfaceId} info`;
  const { stdout } = await execAsync(command);
  return stdout;
}

async function scanWifiLinux(settings: ScannerSettings): Promise<WifiNetwork> {
  const [linkOutput, infoOutput] = await Promise.all([
    iwDevLink(settings.wlanInterfaceId),
    iwDevInfo(settings.wlanInterfaceId),
  ]);

  logger.trace("IW output:", linkOutput);
  logger.trace("IW info:", infoOutput);
  const parsed = parseIwOutput(linkOutput, infoOutput);
  logger.trace("Final WiFi data:", parsed);
  return parsed;
}

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
 * Parses the output of the `netsh wlan show interfaces` command.
 *
 * The reason why it relies on the presence of the "Wi-Fi" line and ordering of the lines
 * is because the output is localized in the language of the system. The alternative would be
 * to maintain a language-specific parser for each language.
 */
export function parseNetshOutput(output: string): WifiNetwork {
  const networkInfo = getDefaultWifiNetwork();
  const lines = output.split("\n").map((line) => line.trim());
  logger.trace("NETSH lines:", lines);
  // Find the Wi-Fi interface section
  const wifiLineIndex = lines.findIndex((line) => line.includes("Wi-Fi"));
  if (wifiLineIndex === -1) return networkInfo;

  // Find SSID and BSSID lines as they are consistent markers
  const ssidLineIndex = lines.findIndex(
    (line, index) =>
      index > wifiLineIndex && line.includes("SSID") && !line.includes("BSSID"),
  );
  logger.trace("SSID line index:", ssidLineIndex);
  if (ssidLineIndex === -1) return networkInfo;

  const bssidLineIndex = lines.findIndex(
    (line, index) => index > wifiLineIndex && line.includes("BSSID"),
  );
  logger.trace("BSSID line index:", bssidLineIndex);
  if (bssidLineIndex === -1) return networkInfo;

  // Parse values based on their position relative to BSSID line
  const getValue = (line: string): string => {
    const colonIndex = line.indexOf(":");
    return colonIndex !== -1 ? line.substring(colonIndex + 1).trim() : "";
  };

  // SSID is always present and consistent
  networkInfo.ssid = getValue(lines[ssidLineIndex]);
  logger.trace("SSID:", networkInfo.ssid);
  // BSSID is always present and consistent
  networkInfo.bssid = normalizeMacAddress(getValue(lines[bssidLineIndex]));
  logger.trace("BSSID:", networkInfo.bssid);
  if (!isValidMacAddress(networkInfo.bssid)) {
    throw new Error(
      "Invalid BSSID when parsing netsh output: " +
        networkInfo.bssid +
        ". Giving up as everything below relies on it order-wise.",
    );
  }

  // Radio type is 2 lines after BSSID
  networkInfo.phyMode = getValue(lines[bssidLineIndex + 2]);
  logger.trace("PHY mode:", networkInfo.phyMode);
  // Authentication is 3 lines after BSSID
  networkInfo.security = getValue(lines[bssidLineIndex + 3]);
  logger.trace("Security:", networkInfo.security);
  // Channel is 6 lines after BSSID
  const channel = parseInt(getValue(lines[bssidLineIndex + 6]) || "0");
  networkInfo.channel = channel;
  networkInfo.frequency = channel > 14 ? 5 : 2.4;
  logger.trace("Frequency:", networkInfo.frequency);
  // Transmit rate is 7 lines after BSSID
  const txRate = getValue(lines[bssidLineIndex + 8]);
  networkInfo.txRate = parseFloat(txRate.split(" ")[0]);
  logger.trace("Transmit rate:", networkInfo.txRate);
  // Signal is 8 lines after BSSID
  const signal = getValue(lines[bssidLineIndex + 9]);
  networkInfo.signalStrength = parseInt(signal.replace("%", ""));
  logger.trace("Signal strength:", networkInfo.signalStrength);
  logger.trace("Final WiFi data:", networkInfo);
  networkInfo.rssi = percentageToRssi(networkInfo.signalStrength);

  return networkInfo;
}

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

  return networkInfo;
}
