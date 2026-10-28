/**
 * The measurement sequence (iperfRunner.runSurveyTests) with a mocked
 * scanner and mocked commands: whether the speed test runs, and that the
 * signal reading is saved, with a warning, whenever it can't.
 * This logic is shared by every OS; see also the per-OS preflight tests
 * at the end.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import fs from "fs";
import path from "path";
import type {
  PartialHeatmapSettings,
  WifiActions,
  WifiResults,
} from "../src/lib/types";
import type { SSEMessageType } from "../src/app/api/events/route";
import { defaultIperfCommands } from "../src/lib/iperfUtils";
import { getDefaultWifiResults } from "../src/lib/utils";

const scanner = vi.hoisted(() => ({
  preflightSettings: vi.fn(),
  checkIperfServer: vi.fn(),
  scanWifi: vi.fn(),
  setWifi: vi.fn(),
  getWifi: vi.fn(),
}));
const sse = vi.hoisted(() => ({ messages: [] as SSEMessageType[] }));

vi.mock("../src/lib/wifiScanner", () => ({
  createWifiActions: async () => scanner,
}));
vi.mock("../src/lib/server-utils", () => ({
  execAsync: vi.fn(),
  delay: vi.fn(async () => {}),
  runDetached: vi.fn(),
}));
vi.mock("../src/lib/server-globals", () => ({
  getCancelFlag: () => false,
  sendSSEMessage: (msg: SSEMessageType) => sse.messages.push(msg),
}));
vi.mock("../src/lib/app-info", () => ({ isMockMode: () => false }));
vi.mock("is-docker", () => ({ default: vi.fn(() => false) }));
vi.mock("is-podman", () => ({ default: vi.fn(() => false) }));
vi.mock("../src/lib/macos-helper", () => ({
  findMacosHelper: () => null,
  runMacosHelper: vi.fn(),
}));

const { execAsync } = await import("../src/lib/server-utils");
const { runSurveyTests } = await import("../src/lib/iperfRunner");
const { IPERF3_MISSING } = await import("../src/lib/speed-test");
const mockExec = vi.mocked(execAsync);

const iperfJson = fs.readFileSync(
  path.join(__dirname, "data/iperf_udp_mac.json"),
  "utf-8",
);

const wifi: WifiResults = {
  ...getDefaultWifiResults(),
  ssid: "Home",
  bssid: "021122334455",
  signalStrength: 70,
  rssi: -58,
  channel: 36,
  band: 5,
  currentSSID: true,
};

const base: PartialHeatmapSettings = {
  iperfServerAdrs: "",
  testDuration: 1,
  sudoerPassword: "",
  iperfCommands: defaultIperfCommands,
};
const speed = (iperfServerAdrs: string): PartialHeatmapSettings => ({
  ...base,
  measureSpeed: true,
  iperfServerAdrs,
});

let commands: string[];
let iperfInstalled: boolean;
let iperfRun: (command: string) => { stdout: string; stderr: string };

beforeEach(() => {
  vi.clearAllMocks();
  sse.messages = [];
  commands = [];
  iperfInstalled = true;
  iperfRun = () => ({ stdout: iperfJson, stderr: "" });
  scanner.preflightSettings.mockResolvedValue({ SSIDs: [], reason: "" });
  scanner.checkIperfServer.mockResolvedValue({ SSIDs: [], reason: "" });
  scanner.scanWifi.mockResolvedValue({ SSIDs: [wifi], reason: "" });
  scanner.getWifi.mockResolvedValue({ SSIDs: [wifi], reason: "" });
  mockExec.mockReset();
  mockExec.mockImplementation(async (command: string) => {
    commands.push(command);
    if (command === "iperf3 --version") {
      if (!iperfInstalled) throw new Error("iperf3: command not found");
      return { stdout: "iperf 3.18 (cJSON 1.7.15)", stderr: "" };
    }
    if (command.startsWith("iperf3 -c")) return iperfRun(command);
    throw new Error(`Unexpected command: ${command}`);
  });
});

const iperfRuns = () => commands.filter((c) => c.startsWith("iperf3 -c"));
const done = () => sse.messages.filter((m) => m.type === "done").at(-1)!;

describe("signal only", () => {
  test.each([
    [
      "explicit choice",
      { ...base, measureSpeed: false, iperfServerAdrs: "10.0.0.2" },
    ],
    ["old survey with localhost", { ...base, iperfServerAdrs: "localhost" }],
    ["old survey with an empty server", { ...base, iperfServerAdrs: "" }],
  ])(
    "%s: measures the signal, runs nothing else, warns about nothing",
    async (_, settings) => {
      const result = await runSurveyTests(settings);
      expect(result.status).toBe("");
      expect(result.warning).toBeUndefined();
      expect(result.wifiData?.signalStrength).toBe(70);
      expect(result.iperfData?.tcpDownload.bitsPerSecond).toBe(0);
      expect(commands).toEqual([]);
      expect(scanner.checkIperfServer).not.toHaveBeenCalled();
      expect(done()).toMatchObject({
        header: "Measurement complete",
        fields: { mode: "signal", tcp: "Off", udp: "Off" },
      });
      expect(done().warning).toBeUndefined();
    },
  );
});

describe("signal and speed", () => {
  test("runs four tests against host:port and saves both", async () => {
    const result = await runSurveyTests(speed("nas.local:5300"));
    expect(result.warning).toBeUndefined();
    expect(result.iperfData?.tcpDownload.bitsPerSecond).toBeGreaterThan(0);
    expect(result.iperfData?.udpUpload.bitsPerSecond).toBeGreaterThan(0);
    expect(iperfRuns()).toHaveLength(4);
    for (const c of iperfRuns())
      expect(c).toMatch(/^iperf3 -c nas\.local -p 5300 /);
    expect(done().fields?.mode).toBe("speed");
  });

  test.each([
    ["[fe80::1]:5202", "-c fe80::1 -p 5202 "],
    ["fe80::1%en0", "-c fe80::1%en0 -t "],
    ["192.168.1.10", "-c 192.168.1.10 -t "],
  ])("passes %s to iperf3 as %j", async (address, expected) => {
    await runSurveyTests(speed(address));
    expect(iperfRuns()[0]).toContain(expected);
  });

  test("iperf3 missing: the signal is saved with a warning, on every OS", async () => {
    iperfInstalled = false;
    const result = await runSurveyTests(speed("10.0.0.2"));
    expect(result.status).toBe("");
    expect(result.wifiData?.signalStrength).toBe(70);
    expect(result.iperfData?.tcpDownload.bitsPerSecond).toBe(0);
    expect(result.warning).toBe(IPERF3_MISSING);
    expect(iperfRuns()).toEqual([]);
    expect(scanner.checkIperfServer).not.toHaveBeenCalled();
    expect(done()).toMatchObject({
      header: "Saved without speed",
      warning: IPERF3_MISSING,
      fields: { mode: "speed", tcp: "Skipped", udp: "Skipped" },
    });
  });

  test("server unreachable: the signal is saved with the scanner's reason", async () => {
    scanner.checkIperfServer.mockResolvedValue({
      SSIDs: [],
      reason: "Can't reach the speed test server at 10.0.0.2:5201.",
    });
    const result = await runSurveyTests(speed("10.0.0.2"));
    expect(result.wifiData).not.toBeNull();
    expect(result.warning).toMatch(/^Can't reach the speed test server/);
    expect(result.warning).toMatch(/speed test was skipped/);
    expect(iperfRuns()).toEqual([]);
  });

  test.each(["", "host:99999"])(
    "server %j: warns without checking anything",
    async (address) => {
      const result = await runSurveyTests(speed(address));
      expect(result.wifiData).not.toBeNull();
      expect(result.warning).toMatch(/speed test server/);
      expect(commands).toEqual([]);
      expect(scanner.checkIperfServer).not.toHaveBeenCalled();
    },
  );

  test("a failing iperf3 run keeps the signal and the tests that worked", async () => {
    let n = 0;
    iperfRun = () => {
      if (++n < 3) return { stdout: iperfJson, stderr: "" };
      throw Object.assign(new Error("Command failed: iperf3 -c 10.0.0.2"), {
        stdout:
          '{ "error": "the server is busy running a test. try again later" }',
      });
    };
    const result = await runSurveyTests(speed("10.0.0.2"));
    expect(result.status).toBe("");
    expect(result.wifiData?.signalStrength).toBe(70);
    expect(result.iperfData?.tcpDownload.bitsPerSecond).toBeGreaterThan(0);
    expect(result.iperfData?.udpDownload.bitsPerSecond).toBe(0);
    expect(result.warning).toMatch(/the server is busy running a test/);
    // the UDP upload is not attempted after the download failed
    expect(iperfRuns()).toHaveLength(3);
  });

  test("a Wi-Fi preflight error still stops the measurement", async () => {
    scanner.preflightSettings.mockResolvedValue({
      SSIDs: [],
      reason: "Please set sudo password.",
    });
    const result = await runSurveyTests(speed("10.0.0.2"));
    expect(result).toMatchObject({
      wifiData: null,
      status: "Please set sudo password.",
    });
  });
});

/**
 * Before, macOS and Linux refused to measure when iperf3 was missing and
 * every OS refused an empty server. Now the per-OS preflight only checks
 * that Wi-Fi can be read, and never runs iperf3.
 */
describe.each([
  [
    "Linux",
    async () =>
      new (await import("../src/lib/wifiScanner-linux")).LinuxWifiActions(),
  ],
  [
    "Windows",
    async () =>
      new (await import("../src/lib/wifiScanner-windows")).NetshWifiActions(),
  ],
  [
    "macOS",
    async () =>
      new (await import("../src/lib/wifiScanner-macos")).MacOSWifiActions(),
  ],
  [
    "mock",
    async () =>
      new (await import("../src/lib/wifiScanner-mock")).MockWifiActions(),
  ],
] as [string, () => Promise<WifiActions>][])(
  "%s preflight ignores the speed test",
  (_, make) => {
    test.each(["", "10.0.0.2"])(
      "server %j, iperf3 missing",
      async (address) => {
        iperfInstalled = false;
        mockExec.mockImplementation(async (command: string) => {
          commands.push(command);
          if (command.includes("iperf3")) throw new Error("not found");
          if (command === "which iw")
            return { stdout: "/usr/sbin/iw", stderr: "" };
          if (command === "iw dev") {
            return {
              stdout: fs.readFileSync(
                path.join(__dirname, "data/linux-iw-dev-monitor-first.txt"),
                "utf-8",
              ),
              stderr: "",
            };
          }
          if (command === "iw dev wlp0s20f3 link") {
            return {
              stdout: fs.readFileSync(
                path.join(__dirname, "data/linux-iw-connected-link.txt"),
                "utf-8",
              ),
              stderr: "",
            };
          }
          // macOS without the helper checks the sudo password
          if (command.includes("sudo -S ls")) return { stdout: "", stderr: "" };
          throw new Error(`not found: ${command}`);
        });
        const actions = await make();
        const result = await actions.preflightSettings({
          ...speed(address),
          sudoerPassword: "pw",
        });
        expect(result.reason).toBe("");
        expect(commands.some((c) => c.includes("iperf3"))).toBe(false);
      },
    );
  },
);
