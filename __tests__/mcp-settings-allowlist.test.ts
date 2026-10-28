import { describe, expect, it } from "vitest";
import {
  iperfCommandProblem,
  isSafeIperfServer,
  pickSafeSettings,
  SAFE_SETTING_KEYS,
  SettingsPatchError,
  toSettingsPatch,
  validateSettingsPatch,
} from "@/mcp/settings-allowlist";
import { applySettingsPatch as applyPatch } from "@/lib/survey-ops";
import { parseSurveyFile } from "@/lib/schema";
import { isLoopbackHost, resolveAppUrl, stripSecrets } from "@/mcp/app-client";
import { defaultIperfCommands } from "@/lib/iperfUtils";
import type { StoredSurvey } from "@/mcp/app-client";

const survey = {
  surveyPoints: [{ id: "Point_1" }],
  floorplanImageName: "Home.png",
  floorplanImagePath: "/api/media/Home.png",
  iperfServerAdrs: "localhost",
  testDuration: 1,
  sudoerPassword: "hunter2",
  apMapping: [{ apName: "Hall", macAddress: "aabbccddee01" }],
  nextPointNum: 2,
  dimensions: { width: 800, height: 600 },
  radiusDivider: null,
  maxOpacity: 0.7,
  minOpacity: 0.2,
  blur: 0.99,
  gradient: { 0: "red", 1: "green" },
  iperfCommands: {
    ...defaultIperfCommands,
    tcpUpload: "iperf3 -c {server} -J",
  },
  heatmapRanges: {
    signalStrength: { min: 0, max: 100, enabled: true },
    "tcpDownload-bitsPerSecond": { min: 0, max: 500, enabled: true },
  },
  meta: { savedAt: "2026-10-01T00:00:00Z" },
} as unknown as StoredSurvey;

describe("pickSafeSettings", () => {
  it("returns only the allow-list, never the sudo password", () => {
    const safe = pickSafeSettings(survey);
    expect(Object.keys(safe).sort()).toEqual([...SAFE_SETTING_KEYS].sort());
    expect(JSON.stringify(safe)).not.toContain("hunter2");
    expect(safe.iperfCommands.tcpUpload).toBe("iperf3 -c {server} -J");
  });

  it("fills in the app's defaults for old files", () => {
    const safe = pickSafeSettings({ floorplanImageName: "x.png" });
    expect(safe).toMatchObject({
      measureSpeed: false,
      iperfServerAdrs: "",
      testDuration: 1,
      iperfCommands: defaultIperfCommands,
      apMapping: [],
      radiusDivider: null,
      heatmapRanges: {},
    });
  });
});

describe("validateSettingsPatch", () => {
  it("accepts a valid patch", () => {
    expect(
      validateSettingsPatch({
        iperfServerAdrs: "192.168.1.10:5201",
        testDuration: 3,
        iperfCommands: {
          udpUpload: "iperf3 -c {server} {port} -t {duration} -u -b 50M -J",
        },
        apMapping: [
          { apName: "Office", macAddress: "AA-BB-CC-DD-EE-02" },
          { apName: "Mesh", macAddress: "11:22:33:44:55:*" },
        ],
        radiusDivider: 120,
        maxOpacity: 0.8,
        minOpacity: 0,
        heatmapRanges: {
          "udpDownload-jitterMs": { min: 0, max: 5, enabled: true },
          signalStrength: null,
        },
      }),
    ).toEqual([]);
  });

  it("refuses the sudo password and fields outside the allow-list", () => {
    const errors = validateSettingsPatch({
      sudoerPassword: "x",
      surveyPoints: [],
    } as never);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/sudo password can't be set/);
    expect(errors[1]).toMatch(/surveyPoints can't be changed/);
  });

  it("refuses shell syntax in the iperf3 server and commands", () => {
    for (const bad of [
      "a;b",
      "$(id)",
      "host name",
      "a|b",
      "x:0",
      "x:70000",
      "",
    ]) {
      expect(isSafeIperfServer(bad), bad).toBe(false);
    }
    for (const good of ["localhost", "192.168.1.10", "nas.local:5201", "a"]) {
      expect(isSafeIperfServer(good), good).toBe(true);
    }
    expect(iperfCommandProblem("iperf3 -c {server} -J; rm -rf ~")).toMatch(
      /not allowed/,
    );
    expect(iperfCommandProblem("iperf3 -c {server} -J > /tmp/x")).toMatch(
      /not allowed/,
    );
    expect(iperfCommandProblem("iperf3 -c `id` -J")).toMatch(/not allowed/);
    expect(iperfCommandProblem("sh -c {server} -J")).toMatch(
      /start with iperf3/,
    );
    expect(iperfCommandProblem("iperf3 -c 10.0.0.1 -J")).toMatch(/\{server\}/);
    expect(iperfCommandProblem("iperf3 -c {server}")).toMatch(/-J/);
    for (const cmd of Object.values(defaultIperfCommands)) {
      expect(iperfCommandProblem(cmd), cmd).toBeNull();
    }
  });

  it("checks ranges, MAC addresses and colour scales", () => {
    const errors = validateSettingsPatch({
      testDuration: 0,
      radiusDivider: -5,
      maxOpacity: 2,
      apMapping: [{ apName: " ", macAddress: "nope" }],
      iperfCommands: { tcpSideways: "iperf3 -c {server} -J" } as never,
      heatmapRanges: {
        bogus: { min: 0, max: 1, enabled: true },
        signalStrength: { min: 0, max: 120, enabled: true },
        "tcpUpload-bitsPerSecond": { min: 5, max: 5, enabled: true },
      },
    });
    expect(errors.join("\n")).toMatch(/testDuration/);
    expect(errors.join("\n")).toMatch(/radiusDivider/);
    expect(errors.join("\n")).toMatch(/maxOpacity/);
    expect(errors.join("\n")).toMatch(/apName must not be empty/);
    expect(errors.join("\n")).toMatch(/macAddress must be a MAC address/);
    expect(errors.join("\n")).toMatch(/tcpSideways is not a command/);
    expect(errors.join("\n")).toMatch(/heatmapRanges.bogus is not a heat map/);
    expect(errors.join("\n")).toMatch(/heatmapRanges.signalStrength/);
    expect(errors.join("\n")).toMatch(/heatmapRanges.tcpUpload-bitsPerSecond/);
    expect(errors).toHaveLength(9);
  });
});

/** What the app does with the patch: survey-ops on the stored survey. */
function applySettingsPatch(survey: StoredSurvey, patch: unknown) {
  const stored = parseSurveyFile(
    survey as unknown as Record<string, unknown>,
    survey.floorplanImageName,
  );
  return applyPatch(stored, toSettingsPatch(patch));
}

describe("toSettingsPatch + the app's merge", () => {
  it("merges only the given fields and keeps everything else", () => {
    const patch = toSettingsPatch({
      iperfServerAdrs: " 10.0.0.5 ",
      iperfCommands: { tcpDownload: "iperf3  -c {server}  -R -J" },
      heatmapRanges: {
        signalStrength: null,
        "udpUpload-bitsPerSecond": { min: 0, max: 100, enabled: false },
      },
    });
    // only what was given goes to the app
    expect(Object.keys(patch).sort()).toEqual([
      "heatmapRanges",
      "iperfCommands",
      "iperfServerAdrs",
      "measureSpeed", // follows the server when not given
    ]);
    expect(patch.iperfCommands).toEqual({
      tcpDownload: "iperf3 -c {server} -R -J",
    });
    const next = applySettingsPatch(survey, patch);
    expect(next.iperfServerAdrs).toBe("10.0.0.5");
    expect(next.iperfCommands).toEqual({
      ...defaultIperfCommands,
      tcpUpload: "iperf3 -c {server} -J", // untouched
      tcpDownload: "iperf3 -c {server} -R -J",
    });
    expect(next.heatmapRanges).toEqual({
      "tcpDownload-bitsPerSecond": { min: 0, max: 500, enabled: true },
      "udpUpload-bitsPerSecond": { min: 0, max: 100, enabled: false },
    });
    // not in the patch: unchanged
    expect(next.apMapping).toEqual(survey.apMapping);
    expect(next.gradient).toEqual(survey.gradient);
    expect(next.testDuration).toBe(1);
    expect(next.floorplanImageName).toBe("Home.png");
    expect("sudoerPassword" in next).toBe(false);
  });

  it("replaces the AP list with normalized addresses", () => {
    const next = applySettingsPatch(survey, {
      apMapping: [
        { apName: " Office ", macAddress: "AA:BB:CC:DD:EE:02" },
        { apName: "Mesh", macAddress: "11-22-33-44-55-*" },
      ],
      radiusDivider: 99.6,
    });
    expect(next.apMapping).toEqual([
      { apName: "Office", macAddress: "aabbccddee02" },
      { apName: "Mesh", macAddress: "1122334455*" },
    ]);
    expect(next.radiusDivider).toBe(100);
    expect(toSettingsPatch({ radiusDivider: null }).radiusDivider).toBe(null);
  });

  it("sets what to measure explicitly, or from the server like the app's migration", () => {
    // the fixture is an old file: localhost, no measureSpeed
    expect(pickSafeSettings(survey).measureSpeed).toBe(false);
    expect(applySettingsPatch(survey, { radiusDivider: 50 }).measureSpeed).toBe(
      false,
    );
    expect(
      applySettingsPatch(survey, { iperfServerAdrs: "10.0.0.5" }).measureSpeed,
    ).toBe(true);
    const on = applySettingsPatch(survey, { measureSpeed: true });
    expect(on.measureSpeed).toBe(true);
    expect(on.iperfServerAdrs).toBe("localhost");
    expect(
      applySettingsPatch(on, { iperfServerAdrs: "localhost" }).measureSpeed,
    ).toBe(false);
    expect(
      applySettingsPatch(survey, {
        iperfServerAdrs: "10.0.0.5",
        measureSpeed: false,
      }).measureSpeed,
    ).toBe(false);
    expect(
      validateSettingsPatch({ measureSpeed: "yes" as unknown as boolean }),
    ).toEqual([
      "measureSpeed must be true (signal and speed) or false (signal only).",
    ]);
  });

  it("throws with every problem", () => {
    expect(() =>
      toSettingsPatch({ testDuration: 99, iperfServerAdrs: "a;b" }),
    ).toThrow(SettingsPatchError);
    try {
      toSettingsPatch({ testDuration: 99, iperfServerAdrs: "a;b" });
    } catch (err) {
      expect((err as SettingsPatchError).problems).toHaveLength(2);
    }
  });
});

describe("app URL and secrets", () => {
  it("only accepts loopback hosts unless allowed", () => {
    expect(resolveAppUrl({}).href).toBe("http://localhost:3000/");
    expect(
      resolveAppUrl({ WIFI_HEATMAPPER_URL: "http://127.0.0.1:4123" }).href,
    ).toBe("http://127.0.0.1:4123/");
    expect(
      resolveAppUrl({ WIFI_HEATMAPPER_URL: "http://[::1]:3000/" }).host,
    ).toBe("[::1]:3000");
    expect(() =>
      resolveAppUrl({ WIFI_HEATMAPPER_URL: "http://192.168.1.20:3000" }),
    ).toThrow(/Refusing/);
    expect(() =>
      resolveAppUrl({ WIFI_HEATMAPPER_URL: "http://localhost.evil.com:3000" }),
    ).toThrow(/Refusing/);
    expect(
      resolveAppUrl({
        WIFI_HEATMAPPER_URL: "http://192.168.1.20:3000",
        WIFI_HEATMAPPER_MCP_ALLOW_REMOTE: "1",
      }).host,
    ).toBe("192.168.1.20:3000");
    expect(() =>
      resolveAppUrl({ WIFI_HEATMAPPER_URL: "ftp://localhost" }),
    ).toThrow(/http/);
    expect(isLoopbackHost("127.8.9.10")).toBe(true);
    expect(isLoopbackHost("128.0.0.1")).toBe(false);
  });

  it("strips the sudo password", () => {
    expect(stripSecrets({ a: 1, sudoerPassword: "x" })).toEqual({ a: 1 });
  });
});
