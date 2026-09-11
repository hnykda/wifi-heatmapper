/**
 * wifiScanner-mock.ts - a fake measurement backend.
 *
 * Enabled with WIFI_HEATMAPPER_MOCK=1. It never runs sudo, wdutil, netsh,
 * iw or iperf3, so the whole app can be exercised on any machine: for
 * development, screenshots and the Playwright e2e tests.
 *
 * Signal strength follows a slow random walk so consecutive points look
 * like a real survey; throughput is derived from the signal strength.
 */
import {
  IperfTestProperty,
  PartialHeatmapSettings,
  WifiActions,
  WifiResults,
  WifiScanResults,
} from "./types";
import { getDefaultWifiResults, percentageToRssi } from "./utils";
import { delay } from "./server-utils";

const STEP_DELAY_MS = parseInt(
  process.env.WIFI_HEATMAPPER_MOCK_DELAY_MS || "150",
  10,
);

/** Deterministic PRNG (mulberry32) so runs are repeatable. */
function makeRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = makeRandom(
  parseInt(process.env.WIFI_HEATMAPPER_MOCK_SEED || "42", 10),
);

/** Shared state so the fake iperf3 results track the fake signal. */
export const mockState = {
  strength: 78, // percent
  measurements: 0,
};

function nextStrength(): number {
  const drift = (random() - 0.5) * 16;
  mockState.strength = Math.round(
    Math.min(100, Math.max(15, mockState.strength + drift)),
  );
  return mockState.strength;
}

const DEMO_SSID = "Demo Network";
const DEMO_BSSID = "9e05d696e830";

function currentWifi(strength: number): WifiResults {
  const band = strength > 55 ? 5 : 2.4;
  return {
    ...getDefaultWifiResults(),
    ssid: DEMO_SSID,
    bssid: DEMO_BSSID,
    signalStrength: strength,
    rssi: percentageToRssi(strength),
    channel: band === 5 ? 44 : 6,
    band,
    channelWidth: band === 5 ? 80 : 20,
    txRate: Math.round(strength * 8.6),
    phyMode: "11ax",
    security: "WPA3 Personal",
    currentSSID: true,
  };
}

export class MockWifiActions implements WifiActions {
  async preflightSettings(
    settings: PartialHeatmapSettings,
  ): Promise<WifiScanResults> {
    let reason = "";
    if (settings.testDuration <= 0) {
      reason = "Test duration must be greater than zero.";
    } else if (!settings.iperfServerAdrs) {
      reason = "Please set iperf3 server address";
    }
    return { SSIDs: [], reason };
  }

  async checkIperfServer(
    settings: PartialHeatmapSettings,
  ): Promise<WifiScanResults> {
    await delay(STEP_DELAY_MS);
    // "unreachable" lets tests and demos exercise the error path
    const reason = /unreachable/i.test(settings.iperfServerAdrs)
      ? "Cannot connect to iperf3 server."
      : "";
    return { SSIDs: [], reason };
  }

  async scanWifi(_settings: PartialHeatmapSettings): Promise<WifiScanResults> {
    await delay(STEP_DELAY_MS);
    const mine = currentWifi(mockState.strength);
    const neighbour: WifiResults = {
      ...getDefaultWifiResults(),
      ssid: "Neighbour 5G",
      bssid: "a1b2c3d4e5f6",
      signalStrength: Math.max(5, mockState.strength - 30),
      rssi: percentageToRssi(Math.max(5, mockState.strength - 30)),
      channel: 100,
      band: 5,
      channelWidth: 80,
      security: "WPA2 Personal",
    };
    return { SSIDs: [mine, neighbour], reason: "" };
  }

  async setWifi(): Promise<WifiScanResults> {
    return { SSIDs: [], reason: "setWifi is not supported" };
  }

  async getWifi(_settings: PartialHeatmapSettings): Promise<WifiScanResults> {
    await delay(STEP_DELAY_MS);
    mockState.measurements++;
    return { SSIDs: [currentWifi(nextStrength())], reason: "" };
  }
}

/**
 * mockIperfResult() - synthetic iperf3 numbers that scale with signal.
 * TCP ~ 0-950 Mbps, UDP capped like the default "-b 100M" command would be.
 */
export async function mockIperfResult(
  isUdp: boolean,
  isDownload: boolean,
  duration: number,
): Promise<IperfTestProperty> {
  await delay(Math.min(duration, 2) * STEP_DELAY_MS * 2);
  const quality = mockState.strength / 100;
  const jitter = () => 0.9 + random() * 0.2;
  const tcpMbps = 950 * quality * quality * jitter() * (isDownload ? 1 : 0.8);
  const udpMbps = Math.min(100, tcpMbps) * jitter();
  const mbps = isUdp ? udpMbps : tcpMbps;
  return {
    bitsPerSecond: Math.round(mbps * 1_000_000),
    retransmits: isUdp ? 0 : Math.round((1 - quality) * 40 * random()),
    jitterMs: isUdp
      ? Math.round((1 - quality) * 8 * random() * 1000) / 1000
      : null,
    lostPackets: isUdp ? Math.round((1 - quality) * 50 * random()) : null,
    packetsReceived: isUdp ? Math.round(udpMbps * 90 * duration) : null,
    signalStrength: 0,
  };
}
