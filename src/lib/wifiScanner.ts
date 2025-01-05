import { exec } from "child_process";
import util from "util";
import { WifiNetwork } from "./types";

const execAsync = util.promisify(exec);

const getDefaultWifiNetwork = (): WifiNetwork => ({
  ssid: "",
  bssid: "",
  rssi: 0,
  channel: 0,
  frequency: 0,
  channelWidth: 0,
  txRate: 0,
  phyMode: "",
  security: "",
});

/**
 * Gets the current WiFi network name, BSSID of the AP it's connected to, and the RSSI.
 */
export async function scanWifi(sudoerPassword: string): Promise<WifiNetwork> {
  try {
    const platform = process.platform;

    if (platform === "darwin") {
      // macOS
      return await scanWifiMacOS(sudoerPassword);
    } else if (platform === "win32") {
      // Windows
      return await scanWifiWindows();
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }
  } catch (error_) {
    const error = error_ as Error;
    console.error("Error scanning WiFi:", error);
    if (error.message.includes("sudo")) {
      console.error(
        "This command requires sudo privileges. Please run the application with sudo."
      );
    }
    throw error;
  }
}

export async function scanWifiMacOS(
  sudoerPassword: string
): Promise<WifiNetwork> {
  const [wdutilOutput, ssid, bssid] = await Promise.all([
    execAsync(`echo ${sudoerPassword} | sudo -S wdutil info`),
    execAsync(
      "ioreg -l -n AirPortDriver | grep IO80211SSID | sed 's/^.*= \"\\(.*\\)\".*$/\\1/; s/ /_/g'"
    ),
    execAsync(
      "ioreg -l | grep \"IO80211BSSID\" | awk -F' = ' '{print $2}' | sed 's/[<>]//g'"
    ),
  ]);

  const network = parseWdutilOutput(wdutilOutput.stdout);

  network.ssid = ssid.stdout.trim();
  network.bssid = bssid.stdout.trim();

  return network;
}

async function scanWifiWindows(): Promise<WifiNetwork> {
  const command = "netsh wlan show interfaces";
  const { stdout } = await execAsync(command);

  return parseNetshOutput(stdout);
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
          networkInfo.bssid = value;
          break;
        case "RSSI":
          networkInfo.rssi = parseInt(value.split(" ")[0]);
          break;
        case "Channel": {
          const channelParts = value.split("/");
          networkInfo.frequency = parseInt(
            channelParts[0].match(/\d+/)?.[0] ?? "0"
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

  let SSID = "";
  let BSSID = "";
  let Signal = "";
  let Channel = "";
  let Authentication = "";
  let TR = "";
  let phyMode = "";

  lines.forEach((line) => {
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith("Name")) {
      SSID = "SSID";
      BSSID = "BSSID";
      Signal = "Signal";
      Channel = "Channel";
      Authentication = "Authentication";
      TR = "Transmit rate (Mbps)";
      phyMode = "Radio Type";
    } else if (trimmedLine.startsWith("Nome")) {
      SSID = "SSID";
      BSSID = "BSSID";
      Signal = "Segnale";
      Channel = "Canale";
      Authentication = "Autenticazione";
      TR = "Velocità trasmissione (Mbps)";
      phyMode = "Tipo frequenza radio";
    }
  });

  lines.forEach((line) => {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith(SSID)) {
      networkInfo.ssid = trimmedLine.split(":")[1]?.trim() || "";
    } else if (trimmedLine.startsWith(BSSID)) {
      const colonIndex = trimmedLine.indexOf(":");
      networkInfo.bssid = trimmedLine.substring(colonIndex + 1).trim();
    } else if (trimmedLine.startsWith(Signal)) {
      const signal = trimmedLine.split(":")[1]?.trim() || "";
      networkInfo.rssi = parseInt(signal.replace("%", ""));
    } else if (trimmedLine.startsWith(Channel)) {
      const channel = parseInt(trimmedLine.split(":")[1]?.trim() || "0");
      networkInfo.channel = channel;
      networkInfo.frequency = channel > 14 ? 5 : 2.4;
    } else if (trimmedLine.startsWith(phyMode)) {
      networkInfo.phyMode = trimmedLine.split(":")[1]?.trim() || "";
    } else if (trimmedLine.startsWith(Authentication)) {
      networkInfo.security = trimmedLine.split(":")[1]?.trim() || "";
    } else if (trimmedLine.startsWith(TR)) {
      const rate = trimmedLine.split(":")[1]?.trim() || "";
      networkInfo.txRate = parseFloat(rate.split(" ")[0]);
    }
  });

  return networkInfo;
}
