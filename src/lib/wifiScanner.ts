import { exec } from "child_process";
import util from "util";
import { WifiNetwork } from "./database";

const execAsync = util.promisify(exec);

/**
 * Gets the current WiFi network name, BSSID of the AP it's connected to, and the RSSI.
 */
export async function scanWifi(sudoerPassword: string): Promise<WifiNetwork> {
  try {
    const [wdutilOutput, ssid, bssid] = await Promise.all([
      execAsync(`echo ${sudoerPassword} | sudo -S wdutil info`),
      execAsync(
        "ioreg -l -n AirPortDriver | grep IO80211SSID | sed 's/^.*= \"\\(.*\\)\".*$/\\1/; s/ /_/g'",
      ),
      execAsync(
        "ioreg -l | grep \"IO80211BSSID\" | awk -F' = ' '{print $2}' | sed 's/[<>]//g'",
      ),
    ]);

    const network = parseWdutilOutput(wdutilOutput.stdout);

    network.ssid = ssid.stdout.trim();
    network.bssid = bssid.stdout.trim();

    return network;
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
}

function parseWdutilOutput(output: string): WifiNetwork {
  const wifiSection = output.split("WIFI")[1].split("BLUETOOTH")[0];
  const lines = wifiSection.split("\n");

  let currentNetwork: Partial<WifiNetwork> = {};

  lines.forEach((line) => {
    const [key, value] = line.split(":").map((s) => s.trim());
    switch (key) {
      case "SSID":
        if (Object.keys(currentNetwork).length > 0) {
          currentNetwork = {};
        }
        currentNetwork.ssid = value;
        break;
      case "BSSID":
        currentNetwork.bssid = value;
        break;
      case "RSSI":
        currentNetwork.rssi = parseInt(value.split(" ")[0]);
        break;
      case "Channel": {
        const channelParts = value.split(" ");
        // takes the first number
        currentNetwork.frequency = parseInt(
          channelParts[0].match(/\d+/)?.[0] ?? "0",
        );
        currentNetwork.channel = parseInt(channelParts[0].substring(2));
        currentNetwork.channelWidth = parseInt(
          channelParts[1].replace(/[()]/g, ""),
        );
        break;
      }
      case "Tx Rate":
        currentNetwork.txRate = parseFloat(value.split(" ")[0]);
        break;
      case "PHY Mode":
        currentNetwork.phyMode = value;
        break;
      case "Security":
        currentNetwork.security = value;
        break;
    }
  });

  return currentNetwork as WifiNetwork;
}
