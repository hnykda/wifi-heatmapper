"use server";
import { exec } from "child_process";
import util from "util";
import {
  HeatmapSettings,
  IperfResults,
  IperfTestProperty,
  WifiNetwork,
} from "./types";
import { scanWifi } from "./wifiScanner";
import { sendSSEMessage } from "./sseGlobal";
import { getHostPlatform } from "./actions";
import { percentageToRssi } from "./utils";
import { SSEMessageType } from "@/app/api/events/route";

const execAsync = util.promisify(exec);

const validateWifiDataConsistency = (
  wifiDataBefore: WifiNetwork,
  wifiDataAfter: WifiNetwork,
) => {
  return (
    wifiDataBefore.bssid === wifiDataAfter.bssid &&
    wifiDataBefore.ssid === wifiDataAfter.ssid &&
    wifiDataBefore.frequency === wifiDataAfter.frequency &&
    wifiDataBefore.channel === wifiDataAfter.channel
  );
};

/**
 * checkSettings - check whether the settings are "primed" to run a test
 * @param settings
 * @returns string
 */
export const checkSettings = async (settings: HeatmapSettings) => {
  sendSSEMessage({
    type: "update",
    status: "",
    header: "In progress",
  });
  let settingsErrorMessage = "";
  console.log(
    `checkSettings: "${settings.iperfServerAdrs}" "${settings.sudoerPassword}"`,
  );
  if (!settings.iperfServerAdrs) {
    settingsErrorMessage = "Please set iperf server address";

    sendSSEMessage({
      type: "done",
      status: settingsErrorMessage,
      header: "Error",
    });
  }

  const runningPlatform = await getHostPlatform();
  // console.log(`platform: ${runningPlatform}`);

  if (
    runningPlatform == "macos" &&
    (!settings.sudoerPassword || settings.sudoerPassword == "")
  ) {
    console.warn(
      "No sudoer password set, but running on macOS where it's required for wdutil info command",
    );
    settingsErrorMessage =
      "Please set sudoer password. It is required on macOS.";
    sendSSEMessage({
      type: "done",
      header: "Error",
      status: settingsErrorMessage,
    });
  }
  return settingsErrorMessage;
};

function arrayAverage(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sum = arr.reduce((acc, val) => acc + val, 0);
  return Math.round(sum / arr.length);
}

// measurement process updates these variables
// which then are built into the updates
let displayedType = "update";
let displayedHeader = "In progress";
let displayedStrength = 0; // numerical value
let displayedTCP = "-/-";
let displayedUDP = "-/-";

function updatedMessage(): SSEMessageType {
  return {
    type: displayedType,
    header: displayedHeader,
    status: `Signal strength: ${displayedStrength}%\nTCP: ${displayedTCP} Mbps\nUDP: ${displayedUDP} Mbps`,
  };
}

export async function runIperfTest(
  settings: HeatmapSettings,
): Promise<{ iperfResults: IperfResults; wifiData: WifiNetwork }> {
  // if (!checkSettings(settings)) {
  //   return;
  // }
  try {
    const maxRetries = 3;
    let attempts = 0;
    let results: IperfResults | null = null;
    let wifiData: WifiNetwork | null = null;

    sendSSEMessage(updatedMessage()); // immediately send the template

    // TODO: only retry the one that failed
    while (attempts < maxRetries && !results) {
      try {
        const server = settings.iperfServerAdrs;
        const duration = settings.testDuration;
        const wifiStrengths: number[] = []; // percentages

        const wifiDataBefore = await scanWifi(settings);
        wifiStrengths.push(wifiDataBefore.signalStrength);
        displayedStrength = arrayAverage(wifiStrengths);
        sendSSEMessage(updatedMessage());

        const tcpDownload = await runSingleTest(server, duration, true, false);
        const tcpUpload = await runSingleTest(server, duration, false, false);
        displayedTCP = `${(tcpDownload.bitsPerSecond / 1000000).toFixed(2)} / ${(tcpUpload.bitsPerSecond / 1000000).toFixed(2)}`;
        sendSSEMessage(updatedMessage());

        const wifiDataMiddle = await scanWifi(settings);
        wifiStrengths.push(wifiDataMiddle.signalStrength);
        displayedStrength = arrayAverage(wifiStrengths);
        sendSSEMessage(updatedMessage());

        const udpDownload = await runSingleTest(server, duration, true, true);
        const udpUpload = await runSingleTest(server, duration, false, true);
        displayedUDP = `${(udpDownload.bitsPerSecond / 1000000).toFixed(2)} / ${(udpUpload.bitsPerSecond / 1000000).toFixed(2)}`;
        sendSSEMessage(updatedMessage());

        const wifiDataAfter = await scanWifi(settings);
        wifiStrengths.push(wifiDataAfter.signalStrength);
        displayedStrength = arrayAverage(wifiStrengths);
        displayedType = "done";
        displayedHeader = "Complete";
        sendSSEMessage(updatedMessage());

        if (!validateWifiDataConsistency(wifiDataBefore, wifiDataAfter)) {
          throw new Error(
            "Wifi configuration changed between scans! Cancelling instead of giving wrong results.",
          );
        }

        results = {
          tcpDownload,
          tcpUpload,
          udpDownload,
          udpUpload,
        };
        // console.error(`Wifi: ${wifiDataBefore.rssi} & ${wifiDataAfter.rssi}`);
        // display the average
        // const averageStrength = arrayAverage(wifiStrengths);
        console.log(
          `signalStrength: ${JSON.stringify(wifiStrengths)}, ${displayedStrength}`,
        );
        wifiData = {
          ...wifiDataBefore,
          signalStrength: displayedStrength,
        };
        //
        wifiData = {
          ...wifiData,
          // be more precise by averaging
          rssi: percentageToRssi(displayedStrength),
        };
      } catch (error) {
        console.error(`Attempt ${attempts + 1} failed:`, error);
        attempts++;
        if (attempts >= maxRetries) {
          throw error;
        }
        // wait 2 secs to recover
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    return { iperfResults: results!, wifiData: wifiData! };
  } catch (error) {
    console.error("Error running iperf3 test:", error);
    throw error;
  }
}

async function runSingleTest(
  server: string,
  duration: number,
  isDownload: boolean,
  isUdp: boolean,
): Promise<IperfTestProperty> {
  let port = "";
  if (server.includes(":")) {
    const [host, serverPort] = server.split(":");
    server = host;
    port = serverPort;
  }
  const command = `iperf3 -c ${server} ${
    port ? `-p ${port}` : ""
  } -t ${duration} ${isDownload ? "-R" : ""} ${isUdp ? "-u -b 0" : ""} -J`;
  const { stdout } = await execAsync(command);
  const result = JSON.parse(stdout);
  return extractIperfResults(result);
}

function extractIperfResults(result: {
  end: {
    sum_received: { bits_per_second: number };
    sum_sent: { retransmits: number };
    sum?: { jitter_ms: number; lost_packets: number; packets: number };
  };
}): IperfTestProperty {
  const end = result.end;
  return {
    bitsPerSecond: end.sum_received.bits_per_second,
    retransmits: end.sum_sent.retransmits,
    jitterMs: end.sum?.jitter_ms,
    lostPackets: end.sum?.lost_packets,
    packetsReceived: end.sum?.packets,
  };
}
