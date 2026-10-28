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
  averageNoise,
  averageRssi,
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
import { parseServerAddress } from "./measurement-mode";
import { planSpeedTest, speedTestFailedWarning } from "./speed-test";
import { rememberNetworks } from "./diagnostics-state";
const logger = getLogger("iperfRunner");

type TestType = "TCP" | "UDP";
type TestDirection = "Up" | "Down";

const wifiActions = await createWifiActions();

/**
 * The Wi-Fi association must not change while we measure, otherwise the
 * speed numbers belong to a different access point than the signal.
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

const PENDING = "-/- Mbps";
const OFF = "Off";
const SKIPPED = "Skipped";

// The measurement process updates these fields, which are
// then combined into progress events for the browser.
const displayStates = {
  type: "update",
  header: "In progress",
  strength: "-",
  tcp: PENDING,
  udp: PENDING,
  mode: "signal" as "signal" | "speed",
  warning: "",
};

function resetDisplayStates(mode: "signal" | "speed") {
  displayStates.type = "update";
  displayStates.header = "Measurement beginning";
  displayStates.strength = "-";
  displayStates.tcp = mode === "signal" ? OFF : PENDING;
  displayStates.udp = mode === "signal" ? OFF : PENDING;
  displayStates.mode = mode;
  displayStates.warning = "";
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
    status: `Signal strength: ${strength}\nSpeed: ${displayStates.tcp}\nUDP: ${displayStates.udp}`,
    fields: {
      strength,
      tcp: displayStates.tcp,
      udp: displayStates.udp,
      mode: displayStates.mode,
    },
    ...(displayStates.warning ? { warning: displayStates.warning } : {}),
  };
}

function checkForCancel() {
  if (getCancelFlag()) throw new Error("cancelled");
}

/**
 * runSurveyTests() - get the Wi-Fi and iperf readings
 * @param settings
 * @returns the Wi-Fi and iperf results for this location, or a
 *          human-readable `status` explaining why there are none.
 *          `warning` is set when the reading was saved without speed
 *          although the survey asks for it (iperf3 missing, server
 *          unreachable, a test failed).
 */
export async function runSurveyTests(
  settings: PartialHeatmapSettings,
): Promise<{
  iperfData: IperfResults | null;
  wifiData: WifiResults | null;
  status: string;
  warning?: string;
}> {
  // first check the settings and return a cogent error if not good
  const preResults = await wifiActions.preflightSettings(settings);
  if (preResults.reason != "") {
    logger.debug(`preflightSettings returned: ${JSON.stringify(preResults)}`);
    return { iperfData: null, wifiData: null, status: preResults.reason };
  }

  // Speed test or not? The same on every OS: a missing iperf3 or an
  // unreachable server skips the speed test, never the signal reading.
  const plan = await planSpeedTest(settings, wifiActions);
  logger.debug(`planSpeedTest returned: ${JSON.stringify(plan)}`);
  let runSpeed = plan.run;

  const startTime = Date.now();
  resetDisplayStates(plan.signalOnly ? "signal" : "speed");
  displayStates.warning = plan.warning;
  if (plan.warning) {
    displayStates.tcp = SKIPPED;
    displayStates.udp = SKIPPED;
  }
  sendSSEMessage(getUpdatedMessage()); // immediately send initial values
  displayStates.header = "Measurement in progress...";

  try {
    // Which SSID are we on? (used for the progress header)
    const ssids = await wifiActions.scanWifi(settings);
    rememberNetworks(ssids.SSIDs);
    logger.debug(`scanWifi returned: ${JSON.stringify(ssids)}`);
    const ssidName = ssids.SSIDs.find((item) => item.currentSSID)?.ssid ?? "";

    const server = settings.iperfServerAdrs;
    const duration = settings.testDuration;
    const cmds = settings.iperfCommands ?? defaultIperfCommands;
    const newIperfData = getDefaultIperfResults();
    const wifiStrengths: number[] = []; // percentages
    const wifiRssis: number[] = []; // dBm, as the OS reports it
    const wifiNoises: (number | null | undefined)[] = []; // dBm, if reported

    const measuringHeader =
      !ssidName || ssidName.includes("redacted")
        ? "Measuring Wi-Fi"
        : `Measuring Wi-Fi (${ssidName})`;
    displayStates.header = measuringHeader;

    const readWifi = async (): Promise<WifiResults> => {
      const resp = await wifiActions.getWifi(settings);
      if (resp.reason != "" || resp.SSIDs.length === 0) {
        throw new Error(resp.reason || "No Wi-Fi information returned.");
      }
      rememberNetworks(resp.SSIDs);
      wifiStrengths.push(resp.SSIDs[0].signalStrength);
      wifiRssis.push(resp.SSIDs[0].rssi);
      wifiNoises.push(resp.SSIDs[0].noise);
      displayStates.strength = arrayAverage(wifiStrengths).toString();
      checkForCancel();
      sendSSEMessage(getUpdatedMessage());
      return resp.SSIDs[0];
    };

    /**
     * Run one direction of one test. A failure stops the remaining speed
     * tests and turns into a warning; the signal reading carries on.
     */
    const speedTest = async (
      dir: TestDirection,
      type: TestType,
    ): Promise<IperfTestProperty | null> => {
      if (!runSpeed) return null;
      displayStates.header = `Testing ${dir === "Down" ? "download" : "upload"} speed${type === "UDP" ? " (UDP)" : ""}`;
      sendSSEMessage(getUpdatedMessage());
      try {
        return await runSingleTest(server, duration, dir, type, cmds);
      } catch (error) {
        logger.warn(`Speed test ${type} ${dir} failed: ${error}`);
        runSpeed = false;
        displayStates.warning = speedTestFailedWarning(error);
        return null;
      } finally {
        displayStates.header = measuringHeader;
      }
    };

    const runPair = async (type: TestType): Promise<string> => {
      if (!runSpeed) {
        await delay(300);
        return plan.signalOnly ? OFF : SKIPPED;
      }
      const down = await speedTest("Down", type);
      checkForCancel();
      const up = await speedTest("Up", type);
      const key = type === "TCP" ? "tcp" : "udp";
      if (down) newIperfData[`${key}Download`] = down;
      if (up) newIperfData[`${key}Upload`] = up;
      if (!down || !up) return SKIPPED;
      return `${toMbps(down.bitsPerSecond)} / ${toMbps(up.bitsPerSecond)} Mbps`;
    };

    const wifiDataBefore = await readWifi();
    logger.debug(`getWifi() returned: ${JSON.stringify(wifiDataBefore)}`);
    logger.debug(`Elapsed time for scan: ${Date.now() - startTime} ms`);

    // TCP tests (download / upload speed)
    displayStates.tcp = await runPair("TCP");
    checkForCancel();
    sendSSEMessage(getUpdatedMessage());

    await readWifi();

    // UDP tests (fixed rate: jitter and lost packets)
    displayStates.udp = await runPair("UDP");
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
    displayStates.header = displayStates.warning
      ? "Saved without speed"
      : "Measurement complete";
    sendSSEMessage(getUpdatedMessage());

    const strength = arrayAverage(wifiStrengths);
    const newWifiData: WifiResults = {
      ...wifiDataBefore,
      signalStrength: strength, // use the average signalStrength
      rssi: averageRssi(wifiRssis, strength),
      noise: averageNoise(wifiNoises),
    };
    logger.debug(`Measurement took ${Date.now() - startTime} ms`);
    return {
      iperfData: newIperfData,
      wifiData: newWifiData,
      status: "",
      ...(displayStates.warning ? { warning: displayStates.warning } : {}),
    };
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

  // host, host:port, [IPv6]:port or a bare IPv6 address
  const address = parseServerAddress(server);
  if (!address) throw new Error(`Invalid speed test server "${server}"`);
  const port = address.port === null ? "" : String(address.port);

  // Select the appropriate command template
  let template: string;
  if (testType === "TCP") {
    template = isDownload ? iperfCommands.tcpDownload : iperfCommands.tcpUpload;
  } else {
    template = isDownload ? iperfCommands.udpDownload : iperfCommands.udpUpload;
  }

  const command = buildIperfCommand(template, address.host, port, duration);
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
