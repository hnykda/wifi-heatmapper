import { HeatmapSettings, WifiNetwork } from "./types";
// import { execAsync } from "./server-utils";
import { getLogger } from "./logger";
import os from "os";

import { scanWifiMacOS } from "./wifiScanner-macos";
import { scanWifiWindows } from "./wifiScanner-windows";
import { scanWifiLinux } from "./wifiScanner-linux";

const logger = getLogger("wifiScanner");
// import { rssiToPercentage, percentageToRssi } from "./utils";
// import { reverseLookup } from "./localization";
// import { inferWifiDeviceIdOnLinux } from "./actions";

export const getDefaultWifiNetwork = (): WifiNetwork => ({
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
    // we also used to check for ssid and bssid, but at least on MacOS 15.3.1
    // these are not present in the output of any of the known OS commands
    // either rssi or signalStrength must be non-zero
    wifiData.rssi !== 0 || wifiData.signalStrength !== 0
  );
};

/**
 * Gets the current WiFi network name, BSSID of the AP it's connected to, and the RSSI.
 */
export async function scanWifi(
  settings: HeatmapSettings,
): Promise<WifiNetwork> {
  let wifiData: WifiNetwork | null = null;

  // console.log(`BSSID: ${await reverseLookup("BSSID")}`);
  // console.log(`AP BSSID: ${await reverseLookup("AP BSSID")}`);
  // console.log(`Signal: ${await reverseLookup("Signal")}`);
  // console.log(`Autenticazione: ${await reverseLookup("Autenticazione")}`);
  // console.log(
  //   `Velocità trasmissione (Mbps): ${await reverseLookup("Velocità trasmissione (Mbps)")}`,
  // );
  // console.log(`foobar: ${await reverseLookup("foobar")}`);

  try {
    const platform = os.platform(); // Platform for the server

    if (platform === "darwin") {
      wifiData = await scanWifiMacOS(settings); // Needs sudoerPassword
    } else if (platform === "win32") {
      wifiData = await scanWifiWindows();
    } else if (platform === "linux") {
      wifiData = await scanWifiLinux(settings); // Needs sudoerPassword
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

  // if (!hasValidData(wifiData)) {
  //   throw new Error(
  //     "Measurement failed. We were not able to get good enough WiFi data: " +
  //       JSON.stringify(wifiData),
  //   );
  // }

  return wifiData;
}

export const normalizeMacAddress = (macAddress: string): string => {
  return macAddress.replace(/[:-]/g, "").toLowerCase();
};

export const isValidMacAddress = (macAddress: string): boolean => {
  const cleanedMacAddress = normalizeMacAddress(macAddress);
  if (cleanedMacAddress === "000000000000") {
    // sometimes returned by ioreg, for example
    return false;
  }
  return /^[0-9a-f]{12}$/.test(cleanedMacAddress);
};

/**
 * Test the Windows parsing code on macOS...
 * 
 * Test with:  await parseTestOutput("abc");

 */

// export async function parseTestOutput(output: string): Promise<WifiNetwork> {
//   const networkInfo = getDefaultWifiNetwork();

//   const testStr = `
//      Nome                   : Wi-Fi
//    Descrizione            : Intel(R) Wi-Fi 6 AX201 160MHz
//    GUID                   : e36a6a75-d662-4a6b-9399-f1304b0fe75e
//    Indirizzo fisico       : 3c:58:c2:c2:1b:f9
//    Stato                  : connessa
//    SSID                   : Doddy
//    BSSID                  : 24:a5:2c:10:f7:a8
//    Tipo di rete           : Infrastruttura
//    Tipo frequenza radio   : 802.11n
//    Autenticazione         : WPA2-Personal
//    Crittografia           : CCMP
//    Modalità connessione   : Profilo
//    Canale                 : 4
//    Velocità ricezione (Mbps)  : 130
//    Velocità trasmissione (Mbps) : 130
//    Segnale                : 85%
//    Profilo                : Doddy

//    Stato rete ospitata    : Non disponibile`;

//   // split into separate lines
//   console.log(`Starting Test Output****`);
//   const lines = testStr.split("\n");
//   for (const line of lines) {
//     const pos = line.indexOf(":");
//     if (pos == -1) continue; // no ":"? Just ignore line
//     const key = line.slice(0, pos - 1).trim();
//     let val = line.slice(pos + 1).trim();
//     const result = await reverseLookup(key);
//     console.log(`Key/Val/Result: "${key}" "${val}", ${result}`);
//     if (key == "signalStrength") {
//       val = val.slice(0, -1); // strip trailing "%"
//     }
//     // Yikes! This was a siege to get the warnings to go away...
//     if (result == null) {
//       console.log(`Not added: ${key}`);
//     } else {
//       assignWindowsNetworkInfoValue(
//         networkInfo,
//         result as keyof WifiNetwork,
//         val,
//       );
//     }
//   }

//   console.log(`End Of Test Output**** ${JSON.stringify(networkInfo)}`);

//   return networkInfo;
// }
