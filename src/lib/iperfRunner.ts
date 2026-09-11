"use server";
import {
  PartialHeatmapSettings,
  IperfResults,
  IperfTestProperty,
  IperfCommands,
  WifiResults,
} from "./types";
import { execAsync, delay } from "./server-utils";
import { getCancelFlag, sendSSEMessage } from "./server-globals";
import {
  percentageToRssi,
  toMbps,
  getDefaultIperfResults,
  extractIperfResults,
} from "./utils";
import { SSEMessageType } from "@/app/api/events/route";
import { createWifiActions } from "./wifiScanner";
import { getLogger } from "./logger";
import { defaultIperfCommands, buildIperfCommand } from "./iperfUtils";
import { isMockMode } from "./app-info";
import { mockIperfResult } from "./wifiScanner-mock";
const logger = getLogger("iperfRunner");

type TestType = "TCP" | "UDP";
type TestDirection = "Up" | "Down";

const wifiActions = await createWifiActions();

/**
 * The Wi-Fi association must not change while we measure, otherwise the
 * throughput numbers belong to a different access point than the signal.
 */
const wifiDataIsConsistent = (
  before: WifiResults,
  after: WifiResults,
): boolean => {
  const same =
    before.bssid === after.bssid &&
    before.ssid === after.ssid &&
    before.band === after.band &&
    before.channel === after.channel;
  if (!same) {
    logger.debug(
      `Wi-Fi changed during measurement: ${JSON.stringify(before.bssid)} -> ${JSON.stringify(after.bssid)}`,
    );
  }
  return same;
};

function arrayAverage(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sum = arr.reduce((acc, val) => acc + val, 0);
  return Math.round(sum / arr.length);
}

// The measurement process updates these fields, which are
// then combined into progress events for the browser.
const displayStates = {
  type: "update",
  header: "In progress",
  strength: "-",
  tcp: "-/- Mbps",
  udp: "-/- Mbps",
};

function resetDisplayStates() {
  displayStates.type = "update";
  displayStates.header = "Measurement beginning";
  displayStates.strength = "-";
  displayStates.tcp = "-/- Mbps";
  displayStates.udp = "-/- Mbps";
}

/**
 * getUpdatedMessage - combine all the displayState values
 * @returns (SSEMessageType) - the message to send
 */
function getUpdatedMessage(): SSEMessageType {
  let strength = displayStates.strength;
  if (strength != "-") {
    strength += "%";
  }
  return {
    type: displayStates.type,
    header: displayStates.header,
    status: `Signal strength: ${strength}\nTCP: ${displayStates.tcp}\nUDP: ${displayStates.udp}`,
    fields: { strength, tcp: displayStates.tcp, udp: displayStates.udp },
  };
}

function checkForCancel() {
  if (getCancelFlag()) throw new Error("cancelled");
}

/**
 * runSurveyTests() - get the Wi-Fi and iperf readings
 * @param settings
 * @returns the Wi-Fi and iperf results for this location, or a
 *          human-readable `status` explaining why there are none
 */
export async function runSurveyTests(
  settings: PartialHeatmapSettings,
): Promise<{
  iperfData: IperfResults | null;
  wifiData: WifiResults | null;
  status: string;
}> {
  // first check the settings and return a cogent error if not good
  const preResults = await wifiActions.preflightSettings(settings);
  if (preResults.reason != "") {
    logger.debug(`preflightSettings returned: ${JSON.stringify(preResults)}`);
    return { iperfData: null, wifiData: null, status: preResults.reason };
  }

  // Is the iperf3 server reachable? This is separate from the other
  // preflight checks because measuring the Wi-Fi alone is still useful
  // (say, you have moved to another subnet).
  let noIperfTestReason = "";
  let performIperfTest = true;
  if (settings.iperfServerAdrs == "localhost") {
    performIperfTest = false;
    noIperfTestReason = "Not performed";
  } else {
    const resp = await wifiActions.checkIperfServer(settings);
    logger.debug(`checkIperfServer returned: ${JSON.stringify(resp)}`);
    if (resp.reason != "") {
      performIperfTest = false;
      noIperfTestReason = resp.reason;
    }
  }

  const startTime = Date.now();
  resetDisplayStates();
  sendSSEMessage(getUpdatedMessage()); // immediately send initial values
  displayStates.header = "Measurement in progress...";

  try {
    // Which SSID are we on? (used for the progress header)
    const ssids = await wifiActions.scanWifi(settings);
    logger.debug(`scanWifi returned: ${JSON.stringify(ssids)}`);
    const ssidName = ssids.SSIDs.find((item) => item.currentSSID)?.ssid ?? "";

    const server = settings.iperfServerAdrs;
    const duration = settings.testDuration;
    const cmds = settings.iperfCommands ?? defaultIperfCommands;
    const newIperfData = getDefaultIperfResults();
    const wifiStrengths: number[] = []; // percentages

    displayStates.header = ssidName.includes("redacted")
      ? "Measuring Wi-Fi"
      : `Measuring Wi-Fi (${ssidName})`;

    const readWifi = async (): Promise<WifiResults> => {
      const resp = await wifiActions.getWifi(settings);
      if (resp.reason != "" || resp.SSIDs.length === 0) {
        throw new Error(resp.reason || "No Wi-Fi information returned.");
      }
      wifiStrengths.push(resp.SSIDs[0].signalStrength);
      displayStates.strength = arrayAverage(wifiStrengths).toString();
      checkForCancel();
      sendSSEMessage(getUpdatedMessage());
      return resp.SSIDs[0];
    };

    const wifiDataBefore = await readWifi();
    logger.debug(`getWifi() returned: ${JSON.stringify(wifiDataBefore)}`);
    logger.debug(`Elapsed time for scan: ${Date.now() - startTime} ms`);

    // TCP tests
    if (performIperfTest) {
      newIperfData.tcpDownload = await runSingleTest(
        server,
        duration,
        "Down",
        "TCP",
        cmds,
      );
      checkForCancel();
      newIperfData.tcpUpload = await runSingleTest(
        server,
        duration,
        "Up",
        "TCP",
        cmds,
      );
      displayStates.tcp = `${toMbps(newIperfData.tcpDownload.bitsPerSecond)} / ${toMbps(newIperfData.tcpUpload.bitsPerSecond)} Mbps`;
    } else {
      await delay(300);
      displayStates.tcp = noIperfTestReason;
    }
    checkForCancel();
    sendSSEMessage(getUpdatedMessage());

    await readWifi();

    // UDP tests
    if (performIperfTest) {
      newIperfData.udpDownload = await runSingleTest(
        server,
        duration,
        "Down",
        "UDP",
        cmds,
      );
      checkForCancel();
      newIperfData.udpUpload = await runSingleTest(
        server,
        duration,
        "Up",
        "UDP",
        cmds,
      );
      displayStates.udp = `${toMbps(newIperfData.udpDownload.bitsPerSecond)} / ${toMbps(newIperfData.udpUpload.bitsPerSecond)} Mbps`;
    } else {
      await delay(300);
      displayStates.udp = noIperfTestReason;
    }
    checkForCancel();
    sendSSEMessage(getUpdatedMessage());

    const wifiDataAfter = await readWifi();

    if (!wifiDataIsConsistent(wifiDataBefore, wifiDataAfter)) {
      throw new Error(
        "Wi-Fi connection changed during the measurement (different access point, band or channel). Stay in one place and try again.",
      );
    }

    // Final update - type is "done"
    displayStates.type = "done";
    displayStates.header = "Measurement complete";
    sendSSEMessage(getUpdatedMessage());

    const strength = arrayAverage(wifiStrengths);
    const newWifiData: WifiResults = {
      ...wifiDataBefore,
      signalStrength: strength, // use the average signalStrength
      rssi: percentageToRssi(strength), // set corresponding RSSI
    };
    logger.debug(`Measurement took ${Date.now() - startTime} ms`);
    return { iperfData: newIperfData, wifiData: newWifiData, status: "" };
  } catch (error: any) {
    if (error?.message == "cancelled") {
      logger.info("Measurement cancelled");
      sendSSEMessage({
        type: "done",
        header: "Cancelled",
        status: "Measurement cancelled",
      });
      return {
        iperfData: null,
        wifiData: null,
        status: "Measurement cancelled",
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Error running measurement tests:", message);
    sendSSEMessage({ type: "done", header: "Error", status: message });
    return { iperfData: null, wifiData: null, status: message };
  }
}

async function runSingleTest(
  server: string,
  duration: number,
  testDir: TestDirection,
  testType: TestType,
  iperfCommands: IperfCommands,
): Promise<IperfTestProperty> {
  const isUdp = testType == "UDP";
  const isDownload = testDir == "Down";

  if (isMockMode()) {
    return mockIperfResult(isUdp, isDownload, duration);
  }

  let port = "";
  if (server.includes(":")) {
    const [host, serverPort] = server.split(":");
    server = host;
    port = serverPort;
  }

  // Select the appropriate command template
  let template: string;
  if (testType === "TCP") {
    template = isDownload ? iperfCommands.tcpDownload : iperfCommands.tcpUpload;
  } else {
    template = isDownload ? iperfCommands.udpDownload : iperfCommands.udpUpload;
  }

  const command = buildIperfCommand(template, server, port, duration);
  logger.debug("Executing iperf command:", command);
  const { stdout } = await execAsync(command);
  const result = JSON.parse(stdout);
  logger.trace("Iperf JSON-parsed result:", result);
  const extracted = extractIperfResults(result, isUdp);
  logger.trace("Iperf extracted results:", extracted);
  return extracted;
}

/** Kept for existing tests; the implementation lives in utils.ts */
export async function extractIperfData(
  result: Parameters<typeof extractIperfResults>[0],
  isUdp: boolean,
): Promise<IperfTestProperty> {
  return extractIperfResults(result, isUdp);
}
