/**
 * wifiScanner-mock.ts - a fake measurement backend.
 *
 * Enabled with WIFI_HEATMAPPER_MOCK=1. It never runs sudo, wdutil, netsh,
 * iw or iperf3, so the whole app can be exercised on any machine: for
 * development, screenshots and the Playwright e2e tests.
 *
 * Signal strength follows a slow random walk so consecutive points look
 * like a real survey; throughput is derived from the signal strength.
 * Each reading reports a noise floor of -90 to -95 dBm, so the SNR map
 * can be tried out.
 *
 * e2e tests change what it answers with a scenario (mock-scenario.ts):
 * a sudo password needed, Wi-Fi off, no noise, iperf3 failing, slow steps.
 */
import {
  PartialHeatmapSettings,
  WifiActions,
  WifiResults,
  WifiScanResults,
} from "./types";
import { getDefaultWifiResults, percentageToRssi } from "./utils";
import { delay, showCommand, type CommandError } from "./server-utils";
import { recordWifiMethod, WIFI_METHOD } from "./diagnostics-state";
import { SUDO_PASSWORD_INVALID, sudoPasswordMissing } from "./sudo";
import type { MockScenario } from "./schema";
import {
  mockDelayMs,
  mockRandom as random,
  mockReadings,
  mockScenario,
} from "./mock-scenario";

function nextStrength(): number {
  const r = mockReadings();
  const fixed = mockScenario().signal;
  if (fixed !== undefined) {
    r.strength = fixed;
    return fixed;
  }
  const drift = (random() - 0.5) * 16;
  r.strength = Math.round(Math.min(100, Math.max(15, r.strength + drift)));
  return r.strength;
}

const DEMO_SSID = "Demo Network";
const DEMO_BSSID = "9e05d696e830";

/** A noise floor between -90 and -95 dBm, like a quiet real channel. */
function nextNoise(): number | null {
  const fixed = mockScenario().noise;
  if (fixed !== undefined) return fixed;
  return -90 - Math.round(random() * 5);
}

function currentWifi(strength: number, noise: number | null): WifiResults {
  const band = mockReadings().band;
  return {
    ...getDefaultWifiResults(),
    ssid: DEMO_SSID,
    bssid: DEMO_BSSID,
    signalStrength: strength,
    rssi: percentageToRssi(strength),
    noise,
    channel: band === 5 ? 44 : 6,
    band,
    channelWidth: band === 5 ? 80 : 20,
    txRate: Math.round(strength * 8.6),
    phyMode: "11ax",
    security: "WPA3 Personal",
    currentSSID: true,
  };
}

/** Record the reading the way the scenario's real scanner would. */
function recordMethod(method: MockScenario["wifiMethod"]) {
  switch (method) {
    case "macos-helper":
      return recordWifiMethod(WIFI_METHOD.macosHelper);
    case "wdutil":
      return recordWifiMethod(
        WIFI_METHOD.wdutil,
        "the Wi-Fi helper is not built",
      );
    case "wlan-api":
      return recordWifiMethod(WIFI_METHOD.wlanApi);
    case "netsh-fallback":
      return recordWifiMethod(
        WIFI_METHOD.netshFallback,
        "the WLAN API failed: koffi could not load wlanapi.dll",
      );
    case "iw":
      return recordWifiMethod(WIFI_METHOD.iw, "iw dev wlan0 link");
    case "iw-sudo":
      return recordWifiMethod(WIFI_METHOD.iwSudo, "iw dev wlan0 link");
    default:
      return recordWifiMethod(WIFI_METHOD.mock);
  }
}

export class MockWifiActions implements WifiActions {
  async preflightSettings(
    settings: PartialHeatmapSettings,
  ): Promise<WifiScanResults> {
    // The band is chosen here, once per measurement, so it never flips
    // half way and fails the "Wi-Fi changed during the measurement" check
    const r = mockReadings();
    r.band = r.strength > 55 ? 5 : 2.4;
    r.iperfRuns = 0;
    // like macOS without the Wi-Fi helper, if the scenario says so
    const { wifi, sudoPassword } = mockScenario();
    const password = settings.sudoerPassword ?? "";
    let reason = "";
    if (wifi === "needs-sudo" || wifi === "wrong-sudo") {
      if (!password) reason = sudoPasswordMissing(false);
      else if (
        wifi === "wrong-sudo" ||
        (sudoPassword !== undefined && password !== sudoPassword)
      ) {
        reason = SUDO_PASSWORD_INVALID;
      }
    }
    return { SSIDs: [], reason };
  }

  async scanWifi(_settings: PartialHeatmapSettings): Promise<WifiScanResults> {
    await delay(mockDelayMs());
    const strength = mockReadings().strength;
    const mine = currentWifi(strength, null);
    const neighbour: WifiResults = {
      ...getDefaultWifiResults(),
      ssid: "Neighbour 5G",
      bssid: "a1b2c3d4e5f6",
      signalStrength: Math.max(5, strength - 30),
      rssi: percentageToRssi(Math.max(5, strength - 30)),
      channel: 100,
      band: 5,
      channelWidth: 80,
      security: "WPA2 Personal",
    };
    return { SSIDs: [mine, neighbour], reason: "" };
  }

  async getWifi(_settings: PartialHeatmapSettings): Promise<WifiScanResults> {
    await delay(mockDelayMs());
    const scenario = mockScenario();
    if (scenario.wifi === "not-connected") {
      return {
        SSIDs: [],
        reason:
          "Wi-Fi is not connected. Connect to a Wi-Fi network and try again.",
      };
    }
    if (scenario.wifi === "error") {
      return {
        SSIDs: [],
        reason: `Can't getWifi: ${scenario.wifiError ?? "the mock Wi-Fi reader failed"}`,
      };
    }
    mockReadings().measurements++;
    recordMethod(scenario.wifiMethod);
    return {
      SSIDs: [currentWifi(nextStrength(), nextNoise())],
      reason: "",
    };
  }
}

/** iperf3's error for a speed test that fails part way (scenario default). */
const MIDWAY_ERROR = "the server is busy running a test. try again later";

/**
 * mockIperf3() - stands in for `iperf3 <args>` (execAsync): the same
 * arguments, the same JSON on stdout (iperf3 3.9 layout), parsed by the
 * real code. Throughput scales with the signal: TCP ~ 0-950 Mbps, UDP
 * capped like the default "-b 100M" command would be. A cancel stops it
 * at once, like killing iperf3.
 */
export async function mockIperf3(
  args: readonly string[],
  { signal }: { signal?: AbortSignal } = {},
): Promise<{ stdout: string; stderr: string }> {
  const isUdp = args.includes("-u");
  const isDownload = args.includes("-R");
  const t = Number(args[args.indexOf("-t") + 1]);
  const duration = Number.isFinite(t) && t > 0 ? t : 1;
  await delay(Math.min(duration, 2) * mockDelayMs() * 2, signal);

  const scenario = mockScenario();
  const r = mockReadings();
  r.iperfRuns++;
  if (scenario.iperf === "fails-midway" && r.iperfRuns >= 2) {
    const error = scenario.iperfError ?? MIDWAY_ERROR;
    const shown = showCommand("iperf3", args);
    throw Object.assign(new Error(`Command failed: ${shown}`), {
      code: 1,
      signal: null,
      stdout: JSON.stringify({ start: {}, intervals: [], end: {}, error }),
      stderr: "",
      cmd: shown,
    }) satisfies CommandError;
  }

  const quality = r.strength / 100;
  const jitter = () => 0.9 + random() * 0.2;
  const tcpMbps = 950 * quality * quality * jitter() * (isDownload ? 1 : 0.8);
  const udpMbps = Math.min(100, tcpMbps) * jitter();
  const sum = isUdp
    ? {
        bits_per_second: Math.round(udpMbps * 1_000_000),
        jitter_ms: Math.round((1 - quality) * 8 * random() * 1000) / 1000,
        lost_packets: Math.round((1 - quality) * 50 * random()),
        packets: Math.round(udpMbps * 90 * duration),
      }
    : {
        bits_per_second: Math.round(tcpMbps * 1_000_000),
        retransmits: Math.round((1 - quality) * 40 * random()),
      };
  return {
    stdout: JSON.stringify({
      start: { version: "iperf 3.9 (mock)" },
      end: { sum },
    }),
    stderr: "",
  };
}
