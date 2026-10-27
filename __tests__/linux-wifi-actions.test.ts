import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import fs from "fs";
import path from "path";
import { execAsync } from "../src/lib/server-utils";
import { LinuxWifiActions } from "../src/lib/wifiScanner-linux";
import { defaultIperfCommands } from "../src/lib/iperfUtils";
import type { PartialHeatmapSettings, WifiScanResults } from "../src/lib/types";

vi.mock("../src/lib/server-utils", () => ({ execAsync: vi.fn() }));
vi.mock("is-docker", () => ({ default: vi.fn(() => false) }));
vi.mock("is-podman", () => ({ default: vi.fn(() => false) }));

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, "data", name), "utf-8");
const connectedLink = fixture("linux-iw-connected-link.txt");
const connectedInfo = fixture("linux-iw-connected-info.txt");
const disconnectedLink = fixture("linux-iw-disconnected-link.txt");
const monitorFirst = fixture("linux-iw-dev-monitor-first.txt");
const multipleManaged = fixture("linux-iw-dev-multiple-managed.txt");
const linkCommand = "iw dev wlp0s20f3 link";
const infoCommand = "iw dev wlp0s20f3 info";
const sudoLinkCommand = 'echo "test-password" | sudo -S iw dev wlp0s20f3 link';
const settings: PartialHeatmapSettings = {
  iperfServerAdrs: "localhost",
  testDuration: 5,
  sudoerPassword: "",
  iperfCommands: defaultIperfCommands,
};
const withPassword = { ...settings, sudoerPassword: "test-password" };
const mockExec = vi.mocked(execAsync);
let commands: Map<string, string | Error>;
let unexpectedCommands: string[];

beforeEach(() => {
  mockExec.mockReset();
  unexpectedCommands = [];
  commands = new Map([
    ["which iw", "/usr/sbin/iw"],
    ["which nmcli", "/usr/bin/nmcli"],
    ["iw dev", monitorFirst],
    [linkCommand, connectedLink],
    [infoCommand, connectedInfo],
  ]);
  mockExec.mockImplementation(async (command) => {
    if (!commands.has(command)) {
      unexpectedCommands.push(command);
      throw new Error(`Unexpected command: ${command}`);
    }
    const output = commands.get(command)!;
    if (output instanceof Error) throw output;
    return { stdout: output, stderr: "" };
  });
});

afterEach(() => {
  // Scanner errors are returned as reasons, so an unexpected mock call must
  // fail independently instead of accidentally satisfying an error-path test.
  expect(unexpectedCommands).toStrictEqual([]);
});

function calledCommands() {
  return mockExec.mock.calls.map(([command]) => command);
}

function expectConnected(result: WifiScanResults) {
  expect(result.reason).toBe("");
  expect(result.SSIDs).toHaveLength(1);
  expect(result.SSIDs[0]).toMatchObject({
    ssid: "Example Network",
    bssid: "021122334455",
    rssi: -59,
    channel: 149,
    band: 5,
    channelWidth: 80,
    txRate: 432.3,
  });
}

function expectFailure(result: WifiScanResults, reason: RegExp) {
  expect(result.SSIDs).toStrictEqual([]);
  expect(result.reason).toMatch(reason);
}

describe("LinuxWifiActions.getWifi", () => {
  test("ignores mon0 and unnamed P2P devices and reads the connected managed interface", async () => {
    expectConnected(await new LinuxWifiActions().getWifi(settings));
    expect(calledCommands()).toStrictEqual([
      "iw dev",
      linkCommand,
      infoCommand,
    ]);
  });

  test("skips a disconnected managed adapter before reading connected adapter info", async () => {
    commands.set("iw dev", multipleManaged);
    commands.set("iw dev wlan0 link", disconnectedLink);

    expectConnected(await new LinuxWifiActions().getWifi(settings));
    expect(calledCommands()).toStrictEqual([
      "iw dev",
      "iw dev wlan0 link",
      linkCommand,
      infoCommand,
    ]);
  });

  test("continues to the second adapter when the first link command fails", async () => {
    commands.set("iw dev", multipleManaged);
    commands.set("iw dev wlan0 link", new Error("adapter vanished"));

    expectConnected(await new LinuxWifiActions().getWifi(settings));
    expect(calledCommands()).toStrictEqual([
      "iw dev",
      "iw dev wlan0 link",
      linkCommand,
      infoCommand,
    ]);
  });

  test("stops at the first connected adapter without probing later candidates", async () => {
    commands.set("iw dev", multipleManaged);
    commands.set(
      "iw dev wlan0 link",
      connectedLink.replace("wlp0s20f3", "wlan0"),
    );
    commands.set(
      "iw dev wlan0 info",
      connectedInfo.replace("wlp0s20f3", "wlan0"),
    );

    expectConnected(await new LinuxWifiActions().getWifi(settings));
    expect(calledCommands()).toStrictEqual([
      "iw dev",
      "iw dev wlan0 link",
      "iw dev wlan0 info",
    ]);
  });

  test.each([
    "linux-iw-dev-monitor-only.txt",
    "linux-iw-dev-non-client.txt",
    "linux-iw-dev-no-interfaces.txt",
  ])(
    "reports no managed interfaces for %s without probing link or info",
    async (name) => {
      commands.set("iw dev", fixture(name));

      expectFailure(
        await new LinuxWifiActions().getWifi(settings),
        /interface|device/i,
      );
      expect(calledCommands()).toStrictEqual(["iw dev"]);
    },
  );

  test("reports disconnected networks without returning default metadata or reading info", async () => {
    commands.set("iw dev", multipleManaged);
    commands.set("iw dev wlan0 link", disconnectedLink);
    commands.set(linkCommand, disconnectedLink);

    expectFailure(await new LinuxWifiActions().getWifi(settings), /connect/i);
    expect(calledCommands()).toStrictEqual([
      "iw dev",
      "iw dev wlan0 link",
      linkCommand,
    ]);
  });

  test("reports enumeration failures rather than returning an empty valid result", async () => {
    commands.set("iw dev", new Error("iw enumeration failed"));

    expectFailure(
      await new LinuxWifiActions().getWifi(settings),
      /iw enumeration failed/i,
    );
    expect(calledCommands()).toStrictEqual(["iw dev"]);
  });

  test("reports link permission errors when no password is available", async () => {
    commands.set(linkCommand, new Error("Operation not permitted"));

    expectFailure(
      await new LinuxWifiActions().getWifi(settings),
      /permitted|permission|sudo/i,
    );
    expect(calledCommands()).toStrictEqual(["iw dev", linkCommand]);
  });

  test("reports info command failure without returning partial metadata", async () => {
    commands.set(infoCommand, new Error("iw info failed"));

    expectFailure(
      await new LinuxWifiActions().getWifi(settings),
      /info failed/i,
    );
    expect(calledCommands()).toStrictEqual([
      "iw dev",
      linkCommand,
      infoCommand,
    ]);
  });

  test.each([
    "linux-iw-malformed-link.txt",
    "linux-iw-missing-signal-link.txt",
    "linux-iw-missing-bssid-link.txt",
  ])(
    "reports invalid metadata in %s instead of a default-filled result",
    async (name) => {
      commands.set(linkCommand, fixture(name));

      const result = await new LinuxWifiActions().getWifi(settings);
      expect(result.SSIDs).toStrictEqual([]);
      expect(result.reason.trim()).not.toBe("");
    },
  );

  test("reports empty link output rather than returning default metadata", async () => {
    commands.set(linkCommand, "");

    const result = await new LinuxWifiActions().getWifi(settings);
    expect(result.SSIDs).toStrictEqual([]);
    expect(result.reason.trim()).not.toBe("");
  });

  test("reports missing channel metadata rather than returning a channel of zero", async () => {
    commands.set(linkCommand, fixture("linux-iw-missing-channel-link.txt"));
    commands.set(infoCommand, "");

    const result = await new LinuxWifiActions().getWifi(settings);
    expect(result.SSIDs).toStrictEqual([]);
    expect(result.reason.trim()).not.toBe("");
  });

  test("returns a connected hidden network with valid metadata and an empty SSID", async () => {
    commands.set(linkCommand, fixture("linux-iw-empty-ssid-link.txt"));

    const result = await new LinuxWifiActions().getWifi(settings);
    expect(result.reason).toBe("");
    expect(result.SSIDs).toHaveLength(1);
    expect(result.SSIDs[0]).toMatchObject({
      ssid: "",
      bssid: "021122334455",
      rssi: -59,
      channel: 149,
    });
  });

  test("does not use sudo when the unprivileged link works, even with credentials", async () => {
    expectConnected(await new LinuxWifiActions().getWifi(withPassword));
    expect(calledCommands()).toStrictEqual([
      "iw dev",
      linkCommand,
      infoCommand,
    ]);
  });

  test("retries a failed unprivileged link with sudo when credentials are available", async () => {
    commands.set(linkCommand, new Error("Operation not permitted"));
    commands.set(sudoLinkCommand, connectedLink);

    expectConnected(await new LinuxWifiActions().getWifi(withPassword));
    expect(calledCommands()).toStrictEqual([
      "iw dev",
      linkCommand,
      sudoLinkCommand,
      infoCommand,
    ]);
  });

  test("does not retry a successful but disconnected link with sudo", async () => {
    commands.set(linkCommand, disconnectedLink);

    expectFailure(
      await new LinuxWifiActions().getWifi(withPassword),
      /connect/i,
    );
    expect(calledCommands()).toStrictEqual(["iw dev", linkCommand]);
  });

  test("does not retry successfully read malformed metadata with sudo", async () => {
    commands.set(linkCommand, fixture("linux-iw-missing-signal-link.txt"));

    const result = await new LinuxWifiActions().getWifi(withPassword);
    expect(result.SSIDs).toStrictEqual([]);
    expect(result.reason.trim()).not.toBe("");
    expect(calledCommands().some((command) => command.includes("sudo"))).toBe(
      false,
    );
  });

  test("reports a failed sudo fallback rather than returning default metadata", async () => {
    commands.set(linkCommand, new Error("Operation not permitted"));
    commands.set(sudoLinkCommand, new Error("sudo authentication failed"));

    expectFailure(
      await new LinuxWifiActions().getWifi(withPassword),
      /sudo|authentication|permitted/i,
    );
    expect(calledCommands()).toStrictEqual([
      "iw dev",
      linkCommand,
      sudoLinkCommand,
    ]);
  });

  test("rescans interfaces on the next read instead of using a stale adapter", async () => {
    const actions = new LinuxWifiActions();
    expectConnected(await actions.getWifi(settings));
    const firstReadCallCount = mockExec.mock.calls.length;
    commands.set("iw dev", multipleManaged);
    commands.set(
      "iw dev wlan0 link",
      connectedLink.replace("wlp0s20f3", "wlan0"),
    );
    commands.set(
      "iw dev wlan0 info",
      connectedInfo.replace("wlp0s20f3", "wlan0"),
    );
    commands.delete(linkCommand);
    commands.delete(infoCommand);

    expectConnected(await actions.getWifi(settings));
    expect(calledCommands().slice(firstReadCallCount)).toStrictEqual([
      "iw dev",
      "iw dev wlan0 link",
      "iw dev wlan0 info",
    ]);
  });
});

describe("LinuxWifiActions.preflightSettings without a password", () => {
  test("checks the connected managed link rather than mon0 without requesting sudo", async () => {
    const result = await new LinuxWifiActions().preflightSettings(settings);

    expect(result).toStrictEqual({ SSIDs: [], reason: "" });
    expect(calledCommands()).toContain("iw dev");
    expect(calledCommands()).toContain(linkCommand);
    expect(calledCommands().some((command) => /mon0|sudo/.test(command))).toBe(
      false,
    );
  });

  test("skips a disconnected managed adapter to find a connected link", async () => {
    commands.set("iw dev", multipleManaged);
    commands.set("iw dev wlan0 link", disconnectedLink);

    const result = await new LinuxWifiActions().preflightSettings(settings);
    expect(result).toStrictEqual({ SSIDs: [], reason: "" });
    expect(calledCommands().indexOf("iw dev wlan0 link")).toBeGreaterThan(-1);
    expect(calledCommands().indexOf(linkCommand)).toBeGreaterThan(
      calledCommands().indexOf("iw dev wlan0 link"),
    );
  });

  test("reports all managed adapters disconnected instead of requesting a sudo password", async () => {
    commands.set("iw dev", multipleManaged);
    commands.set("iw dev wlan0 link", disconnectedLink);
    commands.set(linkCommand, disconnectedLink);

    const result = await new LinuxWifiActions().preflightSettings(settings);
    expectFailure(result, /connect/i);
    expect(result.reason).not.toMatch(/sudo|password/i);
    expect(calledCommands()).toContain("iw dev wlan0 link");
    expect(calledCommands()).toContain(linkCommand);
    expect(calledCommands().some((command) => command.includes("sudo"))).toBe(
      false,
    );
  });

  test("reports missing managed interfaces instead of requesting a sudo password", async () => {
    commands.set("iw dev", fixture("linux-iw-dev-monitor-only.txt"));

    const result = await new LinuxWifiActions().preflightSettings(settings);
    expectFailure(result, /interface|device/i);
    expect(result.reason).not.toMatch(/sudo|password/i);
  });

  test("requests permission help only when the managed link command fails", async () => {
    commands.set(linkCommand, new Error("Operation not permitted"));

    expectFailure(
      await new LinuxWifiActions().preflightSettings(settings),
      /sudo|password|permission|permitted/i,
    );
    expect(calledCommands()).toContain(linkCommand);
    expect(calledCommands().some((command) => command.includes("sudo"))).toBe(
      false,
    );
  });
});
