import { HeatmapSettings, WifiNetwork } from "./types";
import { execAsync } from "./server-utils";
import { getLogger } from "./logger";
// import os from "os";
import { getDefaultWifiNetwork } from "./wifiScanner";
import { rssiToPercentage, percentageToRssi } from "./utils";
// import { reverseLookup } from "./localization";
import { isValidMacAddress,normalizeMacAddress } from "./wifiScanner";
import { reverseLookup } from "./localization";

const logger = getLogger("wifi-Windows");

//   ssid: "",

//   bssid: "",
//   rssi: 0,
//   signalStrength: 0,
//   channel: 0,
//   frequency: 0,
//   channelWidth: 0,
//   txRate: 0,
//   phyMode: "",
//   security: "",
// });

// const hasValidData = (wifiData: WifiNetwork): boolean => {
//   if (!isValidMacAddress(wifiData.ssid)) {
//     logger.warn("Invalid SSID (we were not able to get it):", wifiData.ssid);
//   }
//   if (!isValidMacAddress(wifiData.bssid)) {
//     logger.warn("Invalid BSSID (we were not able to get it):", wifiData.bssid);
//   }

//   return (
//     // we also used to check for ssid and bssid, but at leaston MacOS 15.3.1
//     // these are not present in the output of any of the known OS commands
//     // either rssi or signalStrength must be non-zero
//     wifiData.rssi !== 0 || wifiData.signalStrength !== 0
//   );
// };

// /**
//  * Gets the current WiFi network name, BSSID of the AP it's connected to, and the RSSI.
//  */
// export async function scanWifi(
//   settings: HeatmapSettings,
// ): Promise<WifiNetwork> {
//   let wifiData: WifiNetwork | null = null;

//   // console.log(`BSSID: ${await reverseLookup("BSSID")}`);
//   // console.log(`AP BSSID: ${await reverseLookup("AP BSSID")}`);
//   // console.log(`Signal: ${await reverseLookup("Signal")}`);
//   // console.log(`Autenticazione: ${await reverseLookup("Autenticazione")}`);
//   // console.log(
//   //   `Velocità trasmissione (Mbps): ${await reverseLookup("Velocità trasmissione (Mbps)")}`,
//   // );
//   // console.log(`foobar: ${await reverseLookup("foobar")}`);

//   try {
//     const platform = os.platform(); // Platform for the server
//     const defaultWiFiInfo = getDefaultWifiNetwork();

//     // await parseTestOutput("abc");
//     if (platform === "darwin") {
//       wifiData = await scanWifiMacOS( settings); // Needs sudoerPassword
//     } else if (platform === "win32") {
//       wifiData = await scanWifiWindows();
//     } else if (platform === "linux") {
//       wifiData = await scanWifiLinux(settings); // Needs sudoerPassword
//     } else {
//       throw new Error(`Unsupported platform: ${platform}`);
//     }
//   } catch (error_) {
//     const error = error_ as Error;
//     logger.error("Error scanning WiFi:", error);
//     if (error.message.includes("sudo")) {
//       logger.error(
//         "This command requires sudo privileges. Please run the application with sudo.",
//       );
//     }
//     throw error;
//   }

//   // if (!hasValidData(wifiData)) {
//   //   throw new Error(
//   //     "Measurement failed. We were not able to get good enough WiFi data: " +
//   //       JSON.stringify(wifiData),
//   //   );
//   // }

//   return wifiData;
// }

// export const normalizeMacAddress = (macAddress: string): string => {
//   return macAddress.replace(/[:-]/g, "").toLowerCase();
// };

// export const isValidMacAddress = (macAddress: string): boolean => {
//   const cleanedMacAddress = normalizeMacAddress(macAddress);
//   if (cleanedMacAddress === "000000000000") {
//     // sometimes returned by ioreg, for example
//     return false;
//   }
//   return /^[0-9a-f]{12}$/.test(cleanedMacAddress);
// };

// const getIoregSsid = async (): Promise<string> => {
//   const { stdout } = await execAsync(
//     "ioreg -l -n AirPortDriver | grep IO80211SSID | sed 's/^.*= \"\\(.*\\)\".*$/\\1/; s/ /_/g'",
//   );
//   return stdout.trim();
// };

// const getIoregBssid = async (): Promise<string> => {
//   const { stdout } = await execAsync(
//     "ioreg -l | grep \"IO80211BSSID\" | awk -F' = ' '{print $2}' | sed 's/[<>]//g'",
//   );
//   return stdout.trim();
// };

// /**
//  * scanWifiMacOS() scan the Wifi for MacOS
//  * @param settings - the full set of settins, including sudoerPassword
//  * @returns a WiFiNetwork description to be added to the surveyPoints
//  */
// export async function scanWifiMacOS(
//   settings: HeatmapSettings,
// ): Promise<WifiNetwork> {
//   // toggle WiFi off and on to get fresh data
//   // console.error("Toggling WiFi off ");
//   // let offon = await execAsync(
//   //   `echo ${settings.sudoerPassword} | sudo networksetup -setairportpower en0 off`,
//   // );
//   // console.error("Toggling WiFi on");
//   // offon = await execAsync(
//   //   `echo ${settings.sudoerPassword} | sudo networksetup -setairportpower en0 on`,
//   // );

//   const wdutilOutput = await execAsync(
//     `echo ${settings.sudoerPassword} | sudo -S wdutil info`,
//   );
//   const wdutilNetworkInfo = parseWdutilOutput(wdutilOutput.stdout);
//   logger.trace("WDUTIL output:", wdutilNetworkInfo);

//   if (!isValidMacAddress(wdutilNetworkInfo.ssid)) {
//     logger.trace("Invalid SSID, getting it from ioreg");
//     const ssidOutput = await getIoregSsid();
//     if (isValidMacAddress(ssidOutput)) {
//       wdutilNetworkInfo.ssid = ssidOutput;
//     }
//   }

//   if (!isValidMacAddress(wdutilNetworkInfo.bssid)) {
//     logger.trace("Invalid BSSID, getting it from ioreg");
//     const bssidOutput = await getIoregBssid();
//     if (isValidMacAddress(bssidOutput)) {
//       wdutilNetworkInfo.bssid = bssidOutput;
//     }
//   }

//   logger.trace("Final WiFi data:", wdutilNetworkInfo);
//   wdutilNetworkInfo.signalStrength = rssiToPercentage(wdutilNetworkInfo.rssi);
//   return wdutilNetworkInfo;
// }

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

// // moved from action.ts
// async function inferWifiDeviceIdOnLinux(): Promise<string> {
//   logger.debug("Inferring WLAN interface ID on Linux");
//   const { stdout } = await execAsync(
//     "iw dev | awk '$1==\"Interface\"{print $2}' | head -n1",
//   );
//   return stdout.trim();
// }

// async function iwDevLink(interfaceId: string, pw: string): Promise<string> {
//   const command = `echo "${pw}" | sudo -S iw dev ${interfaceId} link`;
//   const { stdout } = await execAsync(command);
//   // console.log(`=== Link:\n${stdout}`);
//   return stdout;
// }

// async function iwDevInfo(interfaceId: string): Promise<string> {
//   const command = `iw dev ${interfaceId} info`;
//   const { stdout } = await execAsync(command);
//   // console.log(`=== Info:\n${stdout}`);
//   return stdout;
// }

// /**
//  * scanWifiLinux() scan the Wifi for Linux
//  * @returns a WiFiNetwork description to be added to the surveyPoints
//  */
// async function scanWifiLinux(
//   heatmapsettings: HeatmapSettings,
// ): Promise<WifiNetwork> {
//   let wlanInterface: string = "";
//   wlanInterface = await inferWifiDeviceIdOnLinux();
//   // console.log(`password: ${JSON.stringify(heatmapsettings.sudoerPassword)}`);

//   const [linkOutput, infoOutput] = await Promise.all([
//     iwDevLink(wlanInterface, heatmapsettings.sudoerPassword),
//     iwDevInfo(wlanInterface),
//   ]);

//   logger.trace("IW output:", linkOutput);
//   logger.trace("IW info:", infoOutput);
//   const parsed = parseIwOutput(linkOutput, infoOutput);
//   logger.trace("Final WiFi data:", parsed);
//   return parsed;
// }

// /**
//  * Parse (Unix) wdutil output
//  * @param (string) output
//  * @returns WifiNetwork
//  */

// export function parseWdutilOutput(output: string): WifiNetwork {
//   const wifiSection = output.split("WIFI")[1].split("BLUETOOTH")[0];
//   const lines = wifiSection.split("\n");
//   logger.silly("WDUTIL lines:", lines);
//   const networkInfo = getDefaultWifiNetwork();

//   lines.forEach((line) => {
//     if (line.includes(":")) {
//       const colonIndex = line.indexOf(":");
//       const key = line.substring(0, colonIndex).trim();
//       const value = line.substring(colonIndex + 1).trim();
//       switch (key) {
//         case "SSID":
//           networkInfo.ssid = value;
//           break;
//         case "BSSID":
//           networkInfo.bssid = normalizeMacAddress(value);
//           break;
//         case "RSSI":
//           networkInfo.rssi = parseInt(value.split(" ")[0]);
//           break;
//         case "Channel": {
//           const channelParts = value.split("/");
//           networkInfo.frequency = parseInt(
//             channelParts[0].match(/\d+/)?.[0] ?? "0",
//           );
//           networkInfo.channel = parseInt(channelParts[0].substring(2));
//           if (channelParts[1]) {
//             networkInfo.channelWidth = parseInt(channelParts[1]);
//           } else {
//             networkInfo.channelWidth = 0;
//           }
//           break;
//         }
//         case "Tx Rate":
//           networkInfo.txRate = parseFloat(value.split(" ")[0]);
//           break;
//         case "PHY Mode":
//           networkInfo.phyMode = value;
//           break;
//         case "Security":
//           networkInfo.security = value;
//           break;
//       }
//     }
//   });

//   logger.trace("Final WiFi data:", networkInfo);
//   return networkInfo;
// }

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
  // console.log(`After assignment: ${networkInfo[key]} ${val}`);
}
/**
 * Parses the output of the `netsh wlan show interfaces` command.
 *
 * The reason why it relies on the presence of the "Wi-Fi" line and ordering of the lines
 * is because the output is localized in the language of the system. The alternative would be
 * to maintain a language-specific parser for each language.
 *
 * This code has been superceded by code to look up the keys from the netsh... command
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
    console.log(`Key/Val/Result: "${key}" "${val}", ${result}`);
    if (key == "signalStrength") {
      val = val.replace("%", ""); // remove any "%"
    }
    // Yikes! This was a siege to get the warnings to go away...
    if (result == null) {
      // console.log(`Not added: ${key}`);
    } else {
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
  networkInfo.frequency = networkInfo.channel > 14 ? 5 : 2.4;
  networkInfo.rssi = percentageToRssi(networkInfo.signalStrength);

  return networkInfo;
}
// old code to parse netsh... output
//   const lines = output.split("\n").map((line) => line.trim());
//   logger.trace("NETSH lines:", lines);
//   // Find the Wi-Fi interface section
//   const wifiLineIndex = lines.findIndex((line) => line.includes("Wi-Fi"));
//   if (wifiLineIndex === -1) return networkInfo;

//   // Find SSID and BSSID lines as they are consistent markers
//   const ssidLineIndex = lines.findIndex(
//     (line, index) =>
//       index > wifiLineIndex && line.includes("SSID") && !line.includes("BSSID"),
//   );
//   logger.trace("SSID line index:", ssidLineIndex);
//   if (ssidLineIndex === -1) return networkInfo;

//   const bssidLineIndex = lines.findIndex(
//     (line, index) => index > wifiLineIndex && line.includes("BSSID"),
//   );
//   logger.trace("BSSID line index:", bssidLineIndex);
//   if (bssidLineIndex === -1) return networkInfo;

//   // Parse values based on their position relative to BSSID line
//   const getValue = (line: string): string => {
//     const colonIndex = line.indexOf(":");
//     return colonIndex !== -1 ? line.substring(colonIndex + 1).trim() : "";
//   };

//   // SSID is always present and consistent
//   networkInfo.ssid = getValue(lines[ssidLineIndex]);
//   logger.trace("SSID:", networkInfo.ssid);
//   // BSSID is always present and consistent
//   networkInfo.bssid = normalizeMacAddress(getValue(lines[bssidLineIndex]));
//   logger.trace("BSSID:", networkInfo.bssid);
//   if (!isValidMacAddress(networkInfo.bssid)) {
//     throw new Error(
//       "Invalid BSSID when parsing netsh output: " +
//         networkInfo.bssid +
//         ". Giving up as everything below relies on it order-wise.",
//     );
//   }

//   // Radio type is 2 lines after BSSID
//   networkInfo.phyMode = getValue(lines[bssidLineIndex + 2]);
//   logger.trace("PHY mode:", networkInfo.phyMode);
//   // Authentication is 3 lines after BSSID
//   networkInfo.security = getValue(lines[bssidLineIndex + 3]);
//   logger.trace("Security:", networkInfo.security);
//   // Channel is 6 lines after BSSID
//   const channel = parseInt(getValue(lines[bssidLineIndex + 6]) || "0");
//   networkInfo.channel = channel;
//   networkInfo.frequency = channel > 14 ? 5 : 2.4;
//   logger.trace("Frequency:", networkInfo.frequency);
//   // Transmit rate is 7 lines after BSSID
//   const txRate = getValue(lines[bssidLineIndex + 8]);
//   networkInfo.txRate = parseFloat(txRate.split(" ")[0]);
//   logger.trace("Transmit rate:", networkInfo.txRate);
//   // Signal is 8 lines after BSSID
//   const signal = getValue(lines[bssidLineIndex + 9]);
//   networkInfo.signalStrength = parseInt(signal.replace("%", ""));
//   logger.trace("Signal strength:", networkInfo.signalStrength);
//   logger.trace("Final WiFi data:", networkInfo);
//   networkInfo.rssi = percentageToRssi(networkInfo.signalStrength);

//   return networkInfo;
// }

// /**
//  * parseIwOutput from Linux host
//  * @param linkOutput
//  * @param infoOutput
//  * @returns
//  */
// export function parseIwOutput(
//   linkOutput: string,
//   infoOutput: string,
// ): WifiNetwork {
//   const networkInfo = getDefaultWifiNetwork();
//   const linkLines = linkOutput.split("\n");
//   linkLines.forEach((line) => {
//     const trimmedLine = line.trim();
//     if (trimmedLine.startsWith("SSID:")) {
//       networkInfo.ssid = trimmedLine.split("SSID:")[1]?.trim() || "";
//     } else if (trimmedLine.startsWith("Connected to")) {
//       networkInfo.bssid = normalizeMacAddress(
//         trimmedLine.split(" ")[2]?.trim() || "",
//       );
//     } else if (trimmedLine.startsWith("signal:")) {
//       const signalMatch = trimmedLine.match(/signal:\s*(-?\d+)\s*dBm/);
//       if (signalMatch) {
//         networkInfo.rssi = parseInt(signalMatch[1]);
//       }
//     } else if (trimmedLine.startsWith("freq:")) {
//       const freqMatch = trimmedLine.match(/freq:\s*(\d+)/);
//       if (freqMatch) {
//         const freqMhz = parseInt(freqMatch[1]);
//         networkInfo.frequency = Math.round((freqMhz / 1000) * 100) / 100; // Convert MHz to GHz with 2 decimal places
//       }
//     } else if (trimmedLine.startsWith("tx bitrate:")) {
//       const txRate = trimmedLine.split("tx bitrate:")[1]?.trim() || "";
//       networkInfo.txRate = parseFloat(txRate.split(" ")[0]);
//     } else if (trimmedLine.includes("width:")) {
//       const width = trimmedLine.split("width:")[1]?.trim() || "";
//       networkInfo.channelWidth = parseInt(width.split(" ")[0]);
//     }
//   });

//   const infoLines = infoOutput.split("\n");
//   infoLines.forEach((line) => {
//     const trimmedLine = line.trim();
//     if (trimmedLine.startsWith("channel")) {
//       const channelMatch = trimmedLine.match(
//         /channel\s+(\d+)\s+\((\d+)\s*MHz\),\s*width:\s*(\d+)\s*MHz/,
//       );
//       if (channelMatch) {
//         networkInfo.channel = parseInt(channelMatch[1]);
//         // Update frequency if not already set from linkOutput
//         if (!networkInfo.frequency) {
//           const freqMhz = parseInt(channelMatch[2]);
//           networkInfo.frequency = Math.round((freqMhz / 1000) * 100) / 100;
//         }
//         networkInfo.channelWidth = parseInt(channelMatch[3]);
//       }
//     }
//   });
//   networkInfo.signalStrength = rssiToPercentage(networkInfo.rssi);
//   // console.log(`=== networkInfo: ${JSON.stringify(networkInfo)}`);

//   return networkInfo;
// }

/**
 * Test the Windows parsing code on macOS...
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
