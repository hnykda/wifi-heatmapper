import { exec } from "child_process";
import util from "util";
import { ScannerSettings, WifiNetwork } from "./types";

const execAsync = util.promisify(exec);

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
  return (
    wifiData.ssid !== "" &&
    isValidMacAddress(wifiData.bssid) &&
    // either rssi or signalStrength must be non-zero
    (wifiData.rssi !== 0 || wifiData.signalStrength !== 0)
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
    console.error("Error scanning WiFi:", error);
    if (error.message.includes("sudo")) {
      console.error(
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
  const wdutilOutput = await execAsync(
    `echo ${settings.sudoerPassword} | sudo -S wdutil info`,
  );
  const wdutilNetworkInfo = parseWdutilOutput(wdutilOutput.stdout);

  if (!isValidMacAddress(wdutilNetworkInfo.bssid)) {
    const ssidOutput = await getIoregSsid();
    wdutilNetworkInfo.ssid = ssidOutput;
  }

  if (!isValidMacAddress(wdutilNetworkInfo.bssid)) {
    const bssidOutput = await getIoregBssid();
    wdutilNetworkInfo.bssid = bssidOutput;
  }

  return wdutilNetworkInfo;
}

async function scanWifiWindows(): Promise<WifiNetwork> {
  const command = "netsh wlan show interfaces";
  const { stdout } = await execAsync(command);

  return parseNetshOutput(stdout);
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

  return parseIwOutput(linkOutput, infoOutput);
}

export function parseWdutilOutput(output: string): WifiNetwork {
  const wifiSection = output.split("WIFI")[1].split("BLUETOOTH")[0];
  const lines = wifiSection.split("\n");

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

  return networkInfo;
}

export function parseNetshOutput(output: string): WifiNetwork {
  const networkInfo = getDefaultWifiNetwork();

  const lines = output.split("\n");

  lines.forEach((line) => {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith("SSID")) {
      networkInfo.ssid = trimmedLine.split(":")[1]?.trim() || "";
    } else if (trimmedLine.startsWith("BSSID")) {
      const colonIndex = trimmedLine.indexOf(":");
      networkInfo.bssid = normalizeMacAddress(
        trimmedLine.substring(colonIndex + 1).trim(),
      );
    } else if (trimmedLine.startsWith("Signal")) {
      // netsh uses signal instead of rssi
      const signal = trimmedLine.split(":")[1]?.trim() || "";
      networkInfo.signalStrength = parseInt(signal.replace("%", ""));
    } else if (trimmedLine.startsWith("Channel")) {
      const channel = parseInt(trimmedLine.split(":")[1]?.trim() || "0");
      networkInfo.channel = channel;
      // Set frequency based on channel number (2.4GHz for channels 1-14, 5GHz for higher)
      networkInfo.frequency = channel > 14 ? 5 : 2.4;
    } else if (trimmedLine.startsWith("Radio type")) {
      networkInfo.phyMode = trimmedLine.split(":")[1]?.trim() || "";
    } else if (trimmedLine.startsWith("Authentication")) {
      networkInfo.security = trimmedLine.split(":")[1]?.trim() || "";
    } else if (trimmedLine.startsWith("Transmit rate")) {
      const rate = trimmedLine.split(":")[1]?.trim() || "";
      networkInfo.txRate = parseFloat(rate.split(" ")[0]);
    }
  });

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
