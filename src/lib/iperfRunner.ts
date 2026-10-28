import "server-only";
import {
  PartialHeatmapSettings,
  IperfResults,
  IperfTestProperty,
  IperfCommands,
  MeasurementEvent,
  MeasurementFields,
  WifiResults,
} from "./types";
import { execAsync, delay } from "./server-utils";
import { isAbortError, throwIfAborted } from "./abort";
import {
  averageNoise,
  averageRssi,
  toMbps,
  getDefaultIperfResults,
  extractIperfResults,
} from "./utils";
import { createWifiActions } from "./wifiScanner";
import { getLogger } from "./logger";
import { defaultIperfCommands, iperfArgs, IperfTest } from "./iperfUtils";
import { isMockMode } from "./app-info";
import { mockIperf3 } from "./wifiScanner-mock";
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

/** What one measurement shows while it runs (one per measurement). */
type Display = {
  header: string;
  strength: string;
  tcp: string;
  udp: string;
  mode: "signal" | "speed";
  warning: string;
};

/** The progress event for the current display. */
function progressEvent(d: Display): MeasurementEvent {
  const strength = d.strength === "-" ? d.strength : `${d.strength}%`;
  const fields: MeasurementFields = {
    strength,
    tcp: d.tcp,
    udp: d.udp,
    mode: d.mode,
  };
  return {
    type: "update",
    header: d.header,
    status: `Signal strength: ${strength}\nSpeed: ${d.tcp}\nUDP: ${d.udp}`,
    fields,
    ...(d.warning ? { warning: d.warning } : {}),
  };
}

export interface MeasureOptions {
  /** aborting it stops the measurement at once and kills a running iperf3 */
  signal?: AbortSignal;
  /** receives progress ("update") events */
  emit?: (event: MeasurementEvent) => void;
}

export interface MeasureResult {
  iperfData: IperfResults | null;
  wifiData: WifiResults | null;
  /** "" when measured, else why there is no reading */
  status: string;
  /** set when the reading has no speed although the survey asks for it */
  warning?: string;
  /** the last progress shown (for the final "done" event) */
  fields?: MeasurementFields;
}

/**
 * runSurveyTests() - get the Wi-Fi and iperf readings
 * @param settings
 * @param options signal to stop it, emit for progress events
 * @returns the Wi-Fi and iperf results for this location, or a
 *          human-readable `status` explaining why there are none.
 *          `warning` is set when the reading was saved without speed
 *          although the survey asks for it (iperf3 missing, server
 *          unreachable, a test failed).
 * @throws an AbortError when the signal is aborted
 */
export async function runSurveyTests(
  settings: PartialHeatmapSettings,
  { signal, emit = () => {} }: MeasureOptions = {},
): Promise<MeasureResult> {
  // first check the settings and return a cogent error if not good
  const preResults = await wifiActions.preflightSettings(settings);
  throwIfAborted(signal);
  if (preResults.reason != "") {
    logger.debug(`preflightSettings returned: ${JSON.stringify(preResults)}`);
    return { iperfData: null, wifiData: null, status: preResults.reason };
  }

  // Speed test or not? The same on every OS: a missing iperf3 or an
  // unreachable server skips the speed test, never the signal reading.
  const plan = await planSpeedTest(settings);
  throwIfAborted(signal);
  logger.debug(`planSpeedTest returned: ${JSON.stringify(plan)}`);
  let runSpeed = plan.run;

  const startTime = Date.now();
  const mode = plan.signalOnly ? "signal" : "speed";
  const display: Display = {
    header: "Measurement beginning",
    strength: "-",
    tcp: mode === "signal" ? OFF : plan.warning ? SKIPPED : PENDING,
    udp: mode === "signal" ? OFF : plan.warning ? SKIPPED : PENDING,
    mode,
    warning: plan.warning,
  };
  const send = () => emit(progressEvent(display));
  send(); // immediately send initial values

  try {
    const server = settings.iperfServerAdrs;
    const duration = settings.testDuration;
    const cmds = settings.iperfCommands ?? defaultIperfCommands;
    const newIperfData = getDefaultIperfResults();
    const wifiStrengths: number[] = []; // percentages
    const wifiRssis: number[] = []; // dBm, as the OS reports it
    const wifiNoises: (number | null | undefined)[] = []; // dBm, if reported

    let measuringHeader = "Measuring Wi-Fi";
    display.header = measuringHeader;

    const readWifi = async (): Promise<WifiResults> => {
      const resp = await wifiActions.getWifi(settings);
      throwIfAborted(signal);
      if (resp.reason != "" || resp.SSIDs.length === 0) {
        throw new Error(resp.reason || "No Wi-Fi information returned.");
      }
      rememberNetworks(resp.SSIDs);
      wifiStrengths.push(resp.SSIDs[0].signalStrength);
      wifiRssis.push(resp.SSIDs[0].rssi);
      wifiNoises.push(resp.SSIDs[0].noise);
      display.strength = arrayAverage(wifiStrengths).toString();
      send();
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
      display.header = `Testing ${dir === "Down" ? "download" : "upload"} speed${type === "UDP" ? " (UDP)" : ""}`;
      send();
      try {
        return await runSingleTest(server, duration, dir, type, cmds, signal);
      } catch (error) {
        if (isAbortError(error) || signal?.aborted) throw error;
        logger.warn(`Speed test ${type} ${dir} failed: ${error}`);
        runSpeed = false;
        display.warning = speedTestFailedWarning(error);
        return null;
      } finally {
        display.header = measuringHeader;
      }
    };

    const runPair = async (type: TestType): Promise<string> => {
      if (!runSpeed) {
        await delay(300, signal);
        return plan.signalOnly ? OFF : SKIPPED;
      }
      const down = await speedTest("Down", type);
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
    // The network name for the header comes from the reading itself
    // (macOS hides it without Location access: "<redacted>")
    const ssidName = wifiDataBefore.ssid ?? "";
    if (ssidName && !ssidName.includes("redacted")) {
      measuringHeader = `Measuring Wi-Fi (${ssidName})`;
      display.header = measuringHeader;
    }

    // TCP tests (download / upload speed)
    display.tcp = await runPair("TCP");
    send();

    await readWifi();

    // UDP tests (fixed rate: jitter and lost packets)
    display.udp = await runPair("UDP");
    send();

    const wifiDataAfter = await readWifi();

    if (!wifiDataIsConsistent(wifiDataBefore, wifiDataAfter)) {
      throw new Error(
        "Wi-Fi connection changed during the measurement (different access point, band or channel). Stay in one place and try again.",
      );
    }

    display.header = "Saving";
    send();

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
      fields: progressEvent(display).fields,
      ...(display.warning ? { warning: display.warning } : {}),
    };
  } catch (error: unknown) {
    if (isAbortError(error) || signal?.aborted) throw error;
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Error running measurement tests:", message);
    return {
      iperfData: null,
      wifiData: null,
      status: message,
      fields: progressEvent(display).fields,
    };
  }
}

async function runSingleTest(
  server: string,
  duration: number,
  testDir: TestDirection,
  testType: TestType,
  iperfCommands: IperfCommands,
  signal?: AbortSignal,
): Promise<IperfTestProperty> {
  const isUdp = testType == "UDP";
  const isDownload = testDir == "Down";

  // host, host:port, [IPv6]:port or a bare IPv6 address
  const address = parseServerAddress(server);
  if (!address) throw new Error(`Invalid speed test server "${server}"`);
  const port = address.port === null ? "" : String(address.port);

  const test: IperfTest = `${isUdp ? "udp" : "tcp"}${isDownload ? "Download" : "Upload"}`;
  // One argument per value, no shell: the server name is passed as is
  const args = iperfArgs(
    test,
    address.host,
    port,
    duration,
    iperfCommands[test] ?? defaultIperfCommands[test],
  );
  logger.debug("Executing iperf3", args);
  // aborting the signal kills iperf3. Mock mode answers like iperf3 would.
  const { stdout } = isMockMode()
    ? await mockIperf3(args, { signal })
    : await execAsync("iperf3", args, { signal });
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
