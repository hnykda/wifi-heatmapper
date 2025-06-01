"use server";
import os from "os";
import {
  HeatmapSettings,
  IperfResults,
  IperfTestProperty,
  WifiNetwork,
  SurveyPoint,
} from "./types";
import { scanWifi } from "./wifiScanner";
import { execAsync } from "./server-utils";
import { getCancelFlag, sendSSEMessage } from "./sseGlobal";
import { percentageToRssi, toMbps } from "./utils";
import { SSEMessageType } from "@/app/api/events/route";
import { getLogger } from "./logger";

const logger = getLogger("iperfRunner");

const validateWifiDataConsistency = (
  wifiDataBefore: WifiNetwork,
  wifiDataAfter: WifiNetwork,
) => {
  if (
    wifiDataBefore.bssid === wifiDataAfter.bssid &&
    wifiDataBefore.ssid === wifiDataAfter.ssid &&
    wifiDataBefore.band === wifiDataAfter.band &&
    wifiDataBefore.channel === wifiDataAfter.channel
  ) {
    return true;
  }
  const logString = `${JSON.stringify(wifiDataBefore.bssid)} ${JSON.stringify(wifiDataAfter.bssid)}`;
  logger.info(logString);
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

  if (!settings.iperfServerAdrs) {
    settingsErrorMessage = "Please set iperf server address";

    sendSSEMessage({
      type: "done",
      status: settingsErrorMessage,
      header: "Error",
    });
  }

  const runningPlatform = os.platform();

  if (
    runningPlatform == "darwin" &&
    (!settings.sudoerPassword || settings.sudoerPassword == "")
  ) {
    console.warn(
      "No sudo password set, but running on macOS where it's required for wdutil info command",
    );
    settingsErrorMessage =
      "Please set sudo password.\nIt is required on macOS.";
    sendSSEMessage({
      type: "done",
      header: "Error",
      status: settingsErrorMessage,
    });
  }
  return settingsErrorMessage;
};

// moved from actions.ts
export async function startSurvey(
  settings: HeatmapSettings,
): Promise<SurveyPoint | null> {
  const { iperfResults, wifiData } = await runIperfTest(settings);

  if (!iperfResults || !wifiData) {
    // null indicates measurement was canceled
    return null;
  }

  const newPoint: SurveyPoint = {
    wifiData,
    iperfResults,
    timestamp: new Date().toISOString(),
    x: 0, //assigned by the recipient
    y: 0, //assigned by the recipient
    id: "BAD ID", //assigned by the recipient
    isEnabled: true, //assigned by the recipient
  };

  return newPoint;
}

function arrayAverage(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sum = arr.reduce((acc, val) => acc + val, 0);
  return Math.round(sum / arr.length);
}
const initialStates = {
  type: "update",
  header: "Measurement beginning",
  strength: 0,
  tcp: "-/- Mbps",
  udp: "-/- Mbps",
};

// The measurement process updates these variables
// which then are converted into update events
let displayStates = {
  type: "update",
  header: "In progress",
  strength: 0,
  tcp: "-/- Mbps",
  udp: "-/- Mbps",
};

/**
 * getUpdatedMessage - combine all the displayState values
 * @returns (SSEMessageType) - the message to send
 */
function getUpdatedMessage(): SSEMessageType {
  return {
    type: displayStates.type,
    header: displayStates.header,
    status: `Signal strength: ${displayStates.strength}%\nTCP: ${displayStates.tcp}\nUDP: ${displayStates.udp}`,
  };
}

function checkForCancel() {
  if (getCancelFlag()) throw new Error("cancelled");
}
/**
 * runIperfTest() - get the WiFi and iperf readings
 * @param settings
 * @returns the WiFi and iperf results for this location
 */
export async function runIperfTest(settings: HeatmapSettings): Promise<{
  iperfResults: IperfResults | null;
  wifiData: WifiNetwork | null;
}> {
  const performIperfTest = settings.iperfServerAdrs != "localhost";
  try {
    const maxRetries = 3;
    let attempts = 0;
    let results: IperfResults | null = null;
    let wifiData: WifiNetwork | null = null;

    while (attempts < maxRetries && !results) {
      try {
        // set the initial states, then send an event to the client
        displayStates = { ...displayStates, ...initialStates };
        sendSSEMessage(getUpdatedMessage()); // immediately send initial values
        displayStates.header = "Measurement in progress...";

        const server = settings.iperfServerAdrs;
        const duration = settings.testDuration;
        const wifiStrengths: number[] = []; // percentages
        const emptyIperfTestProperty: IperfTestProperty = {
          bitsPerSecond: 0,
          retransmits: 0,
          jitterMs: 0,
          lostPackets: 0,
          packetsReceived: 0,
          signalStrength: 0,
        };

        let tcpDownload = emptyIperfTestProperty;
        let tcpUpload = emptyIperfTestProperty;
        let udpDownload = emptyIperfTestProperty;
        let udpUpload = emptyIperfTestProperty;

        const wifiDataBefore = await scanWifi(settings);
        wifiStrengths.push(wifiDataBefore.signalStrength);
        displayStates.strength = arrayAverage(wifiStrengths);
        checkForCancel();
        sendSSEMessage(getUpdatedMessage());

        if (performIperfTest) {
          tcpDownload = await runSingleTest(server, duration, true, false);
          tcpUpload = await runSingleTest(server, duration, false, false);
          displayStates.tcp = `${toMbps(tcpDownload.bitsPerSecond)} / ${toMbps(tcpUpload.bitsPerSecond)} Mbps`;
        } else {
          displayStates.tcp = "Not performed";
        }
        checkForCancel();
        sendSSEMessage(getUpdatedMessage());

        const wifiDataMiddle = await scanWifi(settings);
        wifiStrengths.push(wifiDataMiddle.signalStrength);
        displayStates.strength = arrayAverage(wifiStrengths);
        checkForCancel();
        sendSSEMessage(getUpdatedMessage());

        if (performIperfTest) {
          udpDownload = await runSingleTest(server, duration, true, true);
          udpUpload = await runSingleTest(server, duration, false, true);
          displayStates.udp = `${toMbps(udpDownload.bitsPerSecond)} / ${toMbps(udpUpload.bitsPerSecond)} Mbps`;
        } else {
          displayStates.udp = "Not performed";
        }
        checkForCancel();
        sendSSEMessage(getUpdatedMessage());

        const wifiDataAfter = await scanWifi(settings);
        wifiStrengths.push(wifiDataAfter.signalStrength);
        displayStates.strength = arrayAverage(wifiStrengths);
        checkForCancel();

        // Send the final update - type is "done"
        displayStates.type = "done";
        displayStates.header = "Measurement complete";
        sendSSEMessage(getUpdatedMessage());

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

        wifiData = {
          ...wifiDataBefore,
          signalStrength: displayStates.strength, // uses the average value
        };
        //
        wifiData = {
          ...wifiData,
          rssi: percentageToRssi(displayStates.strength),
        };
      } catch (error: any) {
        if (error.message == "cancelled") {
          return { iperfResults: null, wifiData: null };
        }
        logger.error(`Attempt ${attempts + 1} failed:`, error);
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
    logger.error("Error running iperf3 test:", error);
    sendSSEMessage({
      type: "done",
      status: "Error running iperf3 test",
      header: "Error",
    });

    throw error;
  }
}

async function runSingleTest(
  server: string,
  duration: number,
  isDownload: boolean,
  isUdp: boolean,
): Promise<IperfTestProperty> {
  const logger = getLogger("runSingleTest");

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
  logger.trace("Iperf JSON-parsed result:", result);
  const extracted = extractIperfResults(result, isUdp);
  logger.trace("Iperf extracted results:", extracted);
  return extracted;
}

export function extractIperfResults(
  result: {
    end: {
      sum_received?: { bits_per_second: number };
      sum_sent?: { retransmits?: number };
      sum?: {
        bits_per_second?: number;
        jitter_ms?: number;
        lost_packets?: number;
        packets?: number;
        lost_percent?: number;
        retransmits?: number;
      };
      streams?: Array<{
        udp?: {
          jitter_ms?: number;
          lost_packets?: number;
          packets?: number;
        };
      }>;
    };
    version?: string;
  },
  isUdp: boolean,
): IperfTestProperty {
  const end = result.end;

  // Check if we're dealing with newer iPerf (Mac - v3.17+) or older iPerf (Ubuntu - v3.9)
  // Newer versions have sum_received and sum_sent, older versions only have sum
  const isNewVersion = !!end.sum_received;

  /**
   * In newer versions (Mac):
   * - TCP: sum_received contains download/upload bps, sum_sent contains retransmits
   * - UDP: sum_received contains actual received data (~51 Mbps),
   *        sum contains reported test bandwidth (~948 Mbps)
   *
   * In older versions (Ubuntu):
   * - TCP: sum contains both bps and retransmits
   * - UDP: sum contains all metrics (bps, jitter, packet loss)
   */

  // For UDP tests with newer iPerf (Mac), we want to use sum.bits_per_second
  // For TCP tests with newer iPerf, we want to use sum_received.bits_per_second
  // For all tests with older iPerf (Ubuntu), we want to use sum.bits_per_second
  const bitsPerSecond = isNewVersion
    ? isUdp
      ? end.sum?.bits_per_second || 0
      : end.sum_received!.bits_per_second
    : end.sum?.bits_per_second || 0;

  if (!bitsPerSecond) {
    throw new Error(
      "No bits per second found in iperf results. This is fatal.",
    );
  }

  const retransmits = isNewVersion
    ? end.sum_sent?.retransmits || 0
    : end.sum?.retransmits || 0;

  return {
    bitsPerSecond,
    retransmits,

    // UDP metrics - only relevant for UDP tests
    // These fields will be null for TCP tests
    jitterMs: isUdp ? end.sum?.jitter_ms || null : null,
    lostPackets: isUdp ? end.sum?.lost_packets || null : null,
    packetsReceived: isUdp ? end.sum?.packets || null : null,
    signalStrength: 0,
  };
}
