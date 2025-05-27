import { WifiNetwork } from "./types";
import { execAsync } from "./server-utils";
import { getLogger } from "./logger";
import { getDefaultWifiNetwork } from "./wifiScanner";
import { percentageToRssi } from "./utils";
import { isValidMacAddress } from "./wifiScanner";
import { reverseLookup } from "./localization";

const logger = getLogger("wifi-Windows");

/**
 * scanWifiWindows() scan the Wifi for Windows
 * @returns a WiFiNetwork description to be added to the surveyPoints
 */
export async function scanWifiWindows(): Promise<WifiNetwork> {
  const command = "netsh wlan show interfaces";
  const { stdout } = await execAsync(command);
  logger.trace("NETSH output:", stdout);
  const parsed = parseNetshOutput(stdout);
  logger.trace("Final WiFi data:", parsed);
  return parsed;
}

function assignWindowsNetworkInfoValue<K extends keyof WifiNetwork>(
  networkInfo: WifiNetwork,
  key: K,
  val: string,
) {
  const current = networkInfo[key];
  if (typeof current === "number") {
    networkInfo[key] = parseInt(val, 10) as any;
  } else {
    networkInfo[key] = val as any;
  }
}
/**
 * Parse the output of the `netsh wlan show interfaces` command.
 *
 * This code looks up the keys from the netsh... command
 * in a localization map that determines the proper key for the WifiNetwork
 */
export async function parseNetshOutput(output: string): Promise<WifiNetwork> {
  const networkInfo = getDefaultWifiNetwork();
  const lines = output.split("\n");
  for (const line of lines) {
    const pos = line.indexOf(":");
    if (pos == -1) continue; // no ":"? Just ignore line
    const key = line.slice(0, pos - 1).trim();
    let val = line.slice(pos + 1).trim();
    const result = await reverseLookup(key);
    if (key == "signalStrength") {
      val = val.replace("%", ""); // remove any "%"
    }
    if (result != null) {
      assignWindowsNetworkInfoValue(
        networkInfo,
        result as keyof WifiNetwork,
        val,
      );
    }
  }
  if (!isValidMacAddress(networkInfo.bssid)) {
    throw new Error(
      `Invalid BSSID when parsing netsh output: ${networkInfo.bssid}`,
    );
  }
  //update frequency band
  networkInfo.band = networkInfo.channel > 14 ? 5 : 2.4;
  networkInfo.rssi = percentageToRssi(networkInfo.signalStrength);

  return networkInfo;
}

/**
 * Test the Windows parsing code on macOS...
 */

// This should be moved into a separate test file

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
