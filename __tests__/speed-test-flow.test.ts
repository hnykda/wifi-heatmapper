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
  MeasurementEvent,
  PartialHeatmapSettings,
  WifiActions,
  WifiResults,
} from "../src/lib/types";
import { defaultIperfCommands } from "../src/lib/iperfUtils";
import { getDefaultWifiResults } from "../src/lib/utils";

const scanner = vi.hoisted(() => ({
  preflightSettings: vi.fn(),
  scanWifi: vi.fn(),
  getWifi: vi.fn(),
}));
const server = vi.hoisted(() => ({ checkIperfServer: vi.fn() }));
const sse = vi.hoisted(() => ({ messages: [] as MeasurementEvent[] }));

vi.mock("../src/lib/wifiScanner", () => ({
  createWifiActions: async () => scanner,
}));
vi.mock("../src/lib/server-utils", () => ({
  execAsync: vi.fn(),
  delay: vi.fn(async () => {}),
}));
vi.mock("../src/lib/iperf-server-check", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/iperf-server-check")>()),
  checkIperfServer: server.checkIperfServer,
}));
vi.mock("../src/lib/app-info", () => ({ isMockMode: () => false }));
vi.mock("is-docker", () => ({ default: vi.fn(() => false) }));
vi.mock("is-podman", () => ({ default: vi.fn(() => false) }));
vi.mock("../src/lib/macos-helper", () => ({
  findMacosHelper: () => null,
  runMacosHelper: vi.fn(),
}));

const { execAsync } = await import("../src/lib/server-utils");
const runner = await import("../src/lib/iperfRunner");
const runSurveyTests = (settings: PartialHeatmapSettings) =>
  runner.runSurveyTests(settings, {
    emit: (msg) => sse.messages.push(msg),
  });
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
  server.checkIperfServer.mockResolvedValue({ SSIDs: [], reason: "" });
  scanner.getWifi.mockResolvedValue({ SSIDs: [wifi], reason: "" });
  mockExec.mockReset();
  mockExec.mockImplementation(async (file, args = []) => {
    const command = [file, ...args].join(" ");
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
// the last progress event: the job turns it into "done" once saved
const done = () => sse.messages.at(-1)!;

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
      expect(server.checkIperfServer).not.toHaveBeenCalled();
      expect(done()).toMatchObject({
        type: "update",
        fields: { mode: "signal", tcp: "Off", udp: "Off" },
      });
      expect(result.fields).toEqual(done().fields);
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
    expect(server.checkIperfServer).not.toHaveBeenCalled();
    expect(done()).toMatchObject({
      warning: IPERF3_MISSING,
      fields: { mode: "speed", tcp: "Skipped", udp: "Skipped" },
    });
  });

  test("server unreachable: the signal is saved with the scanner's reason", async () => {
    server.checkIperfServer.mockResolvedValue({
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
      expect(server.checkIperfServer).not.toHaveBeenCalled();
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

  test("a server with shell syntax reaches iperf3 as one argument", async () => {
    await runSurveyTests(speed("x; touch /tmp/pwned"));
    const calls = mockExec.mock.calls.filter(([, args]) => args?.[0] === "-c");
    expect(calls).toHaveLength(4);
    for (const [file, args] of calls) {
      expect(file).toBe("iperf3"); // no shell in between
      expect(args?.[1]).toBe("x; touch /tmp/pwned");
    }
  });

  test("iperf3 gets the server as one argument, with the survey's extra options", async () => {
    await runSurveyTests({
      ...speed("nas.local"),
      iperfCommands: { ...defaultIperfCommands, tcpUpload: ["-P", "4"] },
    });
    const calls = mockExec.mock.calls.filter(([, args]) => args?.[0] === "-c");
    expect(calls).toHaveLength(4);
    for (const [file, args] of calls) {
      expect(file).toBe("iperf3");
      expect(args?.[1]).toBe("nas.local");
      expect(args?.at(-1)).toBe("-J");
    }
    expect(calls[1][1]).toEqual([
      "-c",
      "nas.local",
      "-t",
      "1",
      "-P",
      "4",
      "-J",
    ]);
  });

  test("a cancel kills the running iperf3 and stops at once", async () => {
    const controller = new AbortController();
    let signalSeen: AbortSignal | undefined;
    mockExec.mockImplementation(async (file, args = [], options) => {
      const command = [file, ...args].join(" ");
      if (command === "iperf3 --version") {
        return { stdout: "iperf 3.18", stderr: "" };
      }
      // like exec with a signal: the child is killed and the call rejects
      signalSeen = options?.signal;
      return new Promise((_, reject) =>
        options?.signal?.addEventListener("abort", () =>
          reject(Object.assign(new Error("killed"), { name: "AbortError" })),
        ),
      );
    });
    const running = runner.runSurveyTests(speed("10.0.0.2"), {
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(signalSeen).toBeDefined());
    controller.abort();
    await expect(running).rejects.toThrow(/killed/);
    expect(signalSeen).toBe(controller.signal);
    // no further tests or readings after the cancel
    expect(scanner.getWifi).toHaveBeenCalledTimes(1);
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
        mockExec.mockImplementation(async (file, args = []) => {
          const command = [file, ...args].join(" ");
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
          if (file === "sudo") return { stdout: "", stderr: "" };
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
