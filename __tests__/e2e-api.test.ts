/**
 * The e2e control API (/api/e2e/scenario, /api/e2e/data) and the mock
 * scenarios behind it. The API must not exist outside an e2e server: these
 * call the route handlers directly with the environment of each way the
 * app runs.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import * as scenarioRoute from "@/app/api/e2e/scenario/route";
import * as dataRoute from "@/app/api/e2e/data/route";
import {
  isTestApiEnabled,
  mockScenario,
  resetMockScenario,
  setMockScenario,
} from "@/lib/mock-scenario";
import { MockWifiActions, mockIperf3 } from "@/lib/wifiScanner-mock";
import { extractIperfResults } from "@/lib/utils";
import { speedTestFailedWarning } from "@/lib/speed-test";
import { defaultIperfCommands } from "@/lib/iperfUtils";

const KEYS = [
  "WIFI_HEATMAPPER_MOCK",
  "WIFI_HEATMAPPER_E2E",
  "WIFI_HEATMAPPER_DATA_DIR",
  "WIFI_HEATMAPPER_RESOURCES_DIR",
] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
const dataDir = mkdtempSync(join(tmpdir(), "wifi-heatmapper-e2e-api-"));

function setEnv(env: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const k of KEYS) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
}

const E2E_SERVER = {
  WIFI_HEATMAPPER_MOCK: "1",
  WIFI_HEATMAPPER_E2E: "1",
  WIFI_HEATMAPPER_DATA_DIR: dataDir,
};

afterEach(() => resetMockScenario());
afterAll(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(dataDir, { recursive: true, force: true });
});

const put = (body: unknown) =>
  scenarioRoute.PUT(
    new NextRequest("http://localhost/api/e2e/scenario", {
      method: "PUT",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );

describe("outside an e2e server the API does not exist", () => {
  const cases: [string, Partial<Record<(typeof KEYS)[number], string>>][] = [
    ["npm run dev / next start", {}],
    ["Docker", { WIFI_HEATMAPPER_DATA_DIR: "/data" }],
    ["npm run dev:mock", { WIFI_HEATMAPPER_MOCK: "1" }],
    [
      "the desktop app in mock mode (its smoke tests)",
      {
        WIFI_HEATMAPPER_MOCK: "1",
        WIFI_HEATMAPPER_DATA_DIR: dataDir,
        WIFI_HEATMAPPER_RESOURCES_DIR: "/Applications/x/server",
      },
    ],
    [
      "the desktop app with the e2e flag",
      { ...E2E_SERVER, WIFI_HEATMAPPER_RESOURCES_DIR: "/opt/x/server" },
    ],
    [
      "e2e flag without mock mode",
      { ...E2E_SERVER, WIFI_HEATMAPPER_MOCK: "0" },
    ],
    [
      "e2e flag without a data dir of its own",
      { WIFI_HEATMAPPER_MOCK: "1", WIFI_HEATMAPPER_E2E: "1" },
    ],
    ["e2e flag off", { ...E2E_SERVER, WIFI_HEATMAPPER_E2E: "false" }],
  ];
  it.each(cases)("%s: 404 for every method", async (_name, env) => {
    setEnv(env);
    expect(isTestApiEnabled()).toBe(false);
    expect((await scenarioRoute.GET()).status).toBe(404);
    expect((await put({ iperf: "missing" })).status).toBe(404);
    expect((await scenarioRoute.DELETE()).status).toBe(404);
    expect((await dataRoute.DELETE()).status).toBe(404);
    // and nothing changed
    expect(mockScenario()).toEqual({});
  });

  it("route files export only HTTP methods and dynamic", () => {
    for (const route of [scenarioRoute, dataRoute]) {
      for (const key of Object.keys(route)) {
        expect(["GET", "PUT", "DELETE", "dynamic"]).toContain(key);
      }
    }
  });
});

describe("on the e2e server", () => {
  beforeEach(() => setEnv(E2E_SERVER));

  it("sets, reads and resets the scenario", async () => {
    const res = await put({ iperf: "missing", noise: null, delayMs: 0 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      iperf: "missing",
      noise: null,
      delayMs: 0,
    });
    expect(await (await scenarioRoute.GET()).json()).toEqual({
      iperf: "missing",
      noise: null,
      delayMs: 0,
    });
    // a PUT replaces it
    await put({ wifi: "needs-sudo" });
    expect(mockScenario()).toEqual({ wifi: "needs-sudo" });
    expect((await scenarioRoute.DELETE()).status).toBe(200);
    expect(mockScenario()).toEqual({});
  });

  it("refuses unknown fields and values", async () => {
    expect((await put({ wifi: "broken" })).status).toBe(400);
    expect((await put({ delayMs: -1 })).status).toBe(400);
    expect((await put({ sudoerPassword: "x" })).status).toBe(400);
    expect((await put([])).status).toBe(400);
    expect(mockScenario()).toEqual({});
  });

  it("DELETE /api/e2e/data leaves only the bundled floor plans", async () => {
    mkdirSync(join(dataDir, "surveys"), { recursive: true });
    mkdirSync(join(dataDir, "media"), { recursive: true });
    writeFileSync(join(dataDir, "surveys", "mine.png.json"), "{}");
    writeFileSync(join(dataDir, "media", "mine.png"), "png");
    writeFileSync(join(dataDir, "usage-counts.json"), "{}");
    setMockScenario({ iperf: "missing" });

    const res = await dataRoute.DELETE();
    expect(res.status).toBe(200);
    expect(readdirSync(join(dataDir, "surveys"))).toEqual([]);
    expect(readdirSync(join(dataDir, "media")).sort()).toEqual([
      "EmptyFloorPlan.png",
      "House & Garage.jpg",
    ]);
    expect(mockScenario()).toEqual({});
    // not part of a survey: kept
    expect(existsSync(join(dataDir, "usage-counts.json"))).toBe(true);
  });
});

describe("the mock follows the scenario", () => {
  const settings = {
    measureSpeed: true,
    iperfServerAdrs: "10.0.0.2",
    testDuration: 1,
    sudoerPassword: "",
    iperfCommands: defaultIperfCommands,
  };
  const args = ["-c", "10.0.0.2", "-t", "1", "-R", "-J"];

  it("asks for a sudo password, and refuses a wrong one", async () => {
    const wifi = new MockWifiActions();
    setMockScenario({ wifi: "needs-sudo", sudoPassword: "pw" });
    expect((await wifi.preflightSettings(settings)).reason).toMatch(
      /Please set sudo password/,
    );
    expect(
      (await wifi.preflightSettings({ ...settings, sudoerPassword: "no" }))
        .reason,
    ).toBe("Please enter a valid sudo password.");
    expect(
      (await wifi.preflightSettings({ ...settings, sudoerPassword: "pw" }))
        .reason,
    ).toBe("");
    setMockScenario({ wifi: "wrong-sudo" });
    expect(
      (await wifi.preflightSettings({ ...settings, sudoerPassword: "pw" }))
        .reason,
    ).toBe("Please enter a valid sudo password.");
  });

  it("reports a fixed signal and no noise", async () => {
    setMockScenario({ signal: 42, noise: null, delayMs: 0 });
    const [reading] = (await new MockWifiActions().getWifi(settings)).SSIDs;
    expect(reading.signalStrength).toBe(42);
    expect(reading.noise).toBeNull();
  });

  it("answers like iperf3 -J, and fails the second run when told to", async () => {
    setMockScenario({ iperf: "fails-midway", delayMs: 0 });
    await new MockWifiActions().preflightSettings(settings);
    const { stdout } = await mockIperf3(args);
    expect(
      extractIperfResults(JSON.parse(stdout), false).bitsPerSecond,
    ).toBeGreaterThan(0);
    const error = await mockIperf3(args).catch((e: unknown) => e);
    expect(speedTestFailedWarning(error)).toBe(
      "The speed test failed (the server is busy running a test. try again later). The signal reading was saved without speed.",
    );
  });
});
