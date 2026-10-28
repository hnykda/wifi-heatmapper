/**
 * Usage counts (lib/telemetry.ts, lib/usage-counts.ts): every off switch,
 * the install id lifecycle, Install once and App start once a day, that an
 * event never carries anything from a survey, and that a failed send never
 * throws. fetch is always mocked: no real event is ever sent.
 */
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildEvent,
  envOffReason,
  eventEndpoint,
  Facts,
  reportAppStart,
  reportMeasurement,
  resetUsageCountsCache,
  runtimeFacts,
  send,
  setEnabled,
  usageCountsInfo,
  usageCountsSummary,
  userAgent,
} from "@/lib/telemetry";
import {
  describeOffReason,
  isLockedOff,
  UsageCountsOffReason,
} from "@/lib/usage-counts";
import { getUsageCountsPath } from "@/lib/server-paths";
import {
  resetMeasurementJobs,
  Runner,
  startMeasurement,
} from "@/lib/measurement-job";
import * as store from "@/lib/survey-store";
import { defaultIperfCommands } from "@/lib/iperfUtils";
import { getDefaultIperfResults, getDefaultWifiResults } from "@/lib/utils";

const dataDir = mkdtempSync(join(tmpdir(), "wifi-heatmapper-usage-"));
const previousDataDir = process.env.WIFI_HEATMAPPER_DATA_DIR;
process.env.WIFI_HEATMAPPER_DATA_DIR = dataDir;

afterAll(() => {
  if (previousDataDir === undefined)
    delete process.env.WIFI_HEATMAPPER_DATA_DIR;
  else process.env.WIFI_HEATMAPPER_DATA_DIR = previousDataDir;
  rmSync(dataDir, { recursive: true, force: true });
});

/** An environment where usage counts are on (like `next start`). */
const ON = { NODE_ENV: "production" };
const FAKE_URL = "http://127.0.0.1:9/fake-plausible";

type Call = { url: string; init: RequestInit };
let calls: Call[];
let answer: () => Promise<Response>;

beforeEach(() => {
  rmSync(getUsageCountsPath(), { force: true });
  resetUsageCountsCache();
  calls = [];
  answer = async () => new Response("{}", { status: 202 });
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return answer();
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const bodies = () => calls.map((c) => JSON.parse(String(c.init.body)));
const names = () => bodies().map((b) => b.name);
const headers = (c: Call) => c.init.headers as Record<string, string>;
const fileState = () =>
  existsSync(getUsageCountsPath())
    ? JSON.parse(readFileSync(getUsageCountsPath(), "utf-8"))
    : null;

describe("off switches", () => {
  const cases: [Record<string, string>, UsageCountsOffReason | null][] = [
    [{ NODE_ENV: "production" }, null],
    [{}, null],
    [{ WIFI_HEATMAPPER_TELEMETRY: "0" }, "env"],
    [{ WIFI_HEATMAPPER_TELEMETRY: "false" }, "env"],
    [{ WIFI_HEATMAPPER_TELEMETRY: "OFF" }, "env"],
    [{ WIFI_HEATMAPPER_TELEMETRY: "no" }, "env"],
    [{ DO_NOT_TRACK: "1" }, "dnt"],
    [{ DO_NOT_TRACK: "true" }, "dnt"],
    [{ DO_NOT_TRACK: "0" }, null],
    [{ WIFI_HEATMAPPER_MOCK: "1" }, "mock"],
    [{ WIFI_HEATMAPPER_MOCK: "1", WIFI_HEATMAPPER_TELEMETRY: "1" }, "mock"],
    [{ CI: "true" }, "ci"],
    [{ CI: "1", WIFI_HEATMAPPER_TELEMETRY: "1" }, "ci"],
    [{ NODE_ENV: "development" }, "dev"],
    [{ NODE_ENV: "development", WIFI_HEATMAPPER_TELEMETRY: "1" }, null],
    [{ NODE_ENV: "development", WIFI_HEATMAPPER_TELEMETRY: "true" }, null],
    [{ NODE_ENV: "test" }, "test"],
    [{ VITEST: "true" }, "test"],
    [{ DO_NOT_TRACK: "1", WIFI_HEATMAPPER_TELEMETRY: "1" }, "dnt"],
  ];
  it.each(cases)("%j -> %s", (env, reason) => {
    expect(envOffReason(env)).toBe(reason);
  });

  it("is off in this test process unless told otherwise", () => {
    expect(envOffReason()).not.toBeNull();
  });

  it.each(["env", "dnt", "mock", "ci", "dev"] as const)(
    "sends nothing and makes no install id when off by %s",
    async (reason) => {
      const env = {
        env: { WIFI_HEATMAPPER_TELEMETRY: "0" },
        dnt: { DO_NOT_TRACK: "1" },
        mock: { WIFI_HEATMAPPER_MOCK: "1" },
        ci: { CI: "true" },
        dev: { NODE_ENV: "development" },
      }[reason];
      await reportAppStart(env);
      expect(await send("Measurement", undefined, env)).toBe(false);
      reportMeasurement({ speedTests: true }, env);
      await new Promise((r) => setTimeout(r, 20));
      expect(calls).toHaveLength(0);
      expect(existsSync(getUsageCountsPath())).toBe(false);
      const info = await usageCountsInfo(env);
      expect(info).toMatchObject({
        enabled: false,
        offReason: reason,
      });
      expect(isLockedOff(info.offReason)).toBe(true);
      expect(existsSync(getUsageCountsPath())).toBe(false);
    },
  );

  it("the Settings toggle turns it off, deletes the id and can turn it back on", async () => {
    await reportAppStart(ON);
    const firstId = fileState().installId;
    expect(firstId).toMatch(/^[0-9a-f-]{36}$/);

    await setEnabled(false);
    expect(fileState()).toMatchObject({ enabled: false });
    expect(fileState().installId).toBeUndefined();
    const info = await usageCountsInfo(ON);
    expect(info).toMatchObject({
      enabled: false,
      setting: false,
      offReason: "setting",
    });
    expect(isLockedOff("setting")).toBe(false);
    calls = [];
    expect(await send("Measurement", undefined, ON)).toBe(false);
    expect(calls).toHaveLength(0);

    // back on: a new random id, and Install is not sent again
    await setEnabled(true);
    resetUsageCountsCache(); // as after a restart
    await reportAppStart(ON, new Date("2031-01-01T12:00:00Z"));
    expect(names()).toEqual(["App start"]);
    expect(fileState().installId).toMatch(/^[0-9a-f-]{36}$/);
    expect(fileState().installId).not.toBe(firstId);
  });

  it("every reason has a plain explanation", () => {
    for (const r of [
      "env",
      "dnt",
      "mock",
      "ci",
      "dev",
      "test",
      "setting",
    ] as const) {
      expect(describeOffReason(r)).toMatch(/^Off/);
    }
    expect(describeOffReason("env")).toContain("WIFI_HEATMAPPER_TELEMETRY");
    expect(describeOffReason("dev")).toContain("WIFI_HEATMAPPER_TELEMETRY=1");
  });
});

describe("install id and the events at start", () => {
  it("first run: makes one id, sends Install then App start, with the id only in the User-Agent", async () => {
    expect(existsSync(getUsageCountsPath())).toBe(false);
    await reportAppStart(
      { ...ON, WIFI_HEATMAPPER_TELEMETRY_URL: FAKE_URL },
      new Date("2030-05-01T08:00:00Z"),
    );
    expect(names()).toEqual(["Install", "App start"]);
    const { installId } = fileState();
    expect(installId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    for (const c of calls) {
      expect(c.url).toBe(FAKE_URL);
      expect(c.init.method).toBe("POST");
      expect(headers(c)["User-Agent"]).toBe(
        userAgent(runtimeFacts(ON).version, installId),
      );
      expect(headers(c)["Content-Type"]).toBe("application/json");
      expect(String(c.init.body)).not.toContain(installId);
      expect(c.init.signal).toBeInstanceOf(AbortSignal);
    }
    expect(fileState()).toMatchObject({
      installReported: true,
      lastAppStartDay: "2030-05-01",
      lastSent: { event: "App start" },
    });

    // the id is not in what the API shows, nor in a bug report
    const info = await usageCountsInfo(ON);
    expect(JSON.stringify(info)).not.toContain(installId);
    expect(info.sample.headers["User-Agent"]).toContain("<random install id>");
    expect(await usageCountsSummary(ON)).toBe("on");
  });

  it("App start goes out at most once a day; Install only once", async () => {
    const day1 = new Date("2030-05-01T08:00:00Z");
    await reportAppStart(ON, day1);
    resetUsageCountsCache(); // a restart reads the file again
    await reportAppStart(ON, new Date("2030-05-01T23:59:00Z"));
    await reportAppStart(ON, day1);
    expect(names()).toEqual(["Install", "App start"]);
    await reportAppStart(ON, new Date("2030-05-02T00:01:00Z"));
    expect(names()).toEqual(["Install", "App start", "App start"]);
    const ids = new Set(calls.map((c) => headers(c)["User-Agent"]));
    expect(ids.size).toBe(1); // the same install every time
  });

  it("an event that did not get through is tried again at the next start", async () => {
    answer = async () => {
      throw new TypeError("fetch failed");
    };
    await reportAppStart(ON, new Date("2030-05-01T08:00:00Z"));
    expect(fileState().installReported).toBeUndefined();
    expect(fileState().lastSent).toBeUndefined();
    answer = async () => new Response("{}", { status: 202 });
    calls = [];
    await reportAppStart(ON, new Date("2030-05-01T09:00:00Z"));
    expect(names()).toEqual(["Install", "App start"]);
  });
});

describe("sending never fails anything", () => {
  const failures: [string, () => Promise<Response>][] = [
    [
      "offline",
      async () => {
        throw new TypeError("fetch failed");
      },
    ],
    [
      "timeout",
      async () => {
        throw new DOMException("timed out", "TimeoutError");
      },
    ],
    ["server error", async () => new Response("no", { status: 500 })],
    ["refused", async () => new Response("no", { status: 400 })],
  ];
  it.each(failures)("%s: resolves false, records nothing", async (_n, fail) => {
    answer = fail;
    await expect(send("Measurement", undefined, ON)).resolves.toBe(false);
    await expect(reportAppStart(ON)).resolves.toBeUndefined();
    expect(() => reportMeasurement({ speedTests: false }, ON)).not.toThrow();
    await new Promise((r) => setTimeout(r, 20));
    expect(fileState()?.lastSent).toBeUndefined();
  });

  it("a fetch that throws synchronously is swallowed too", async () => {
    vi.stubGlobal("fetch", () => {
      throw new Error("boom");
    });
    await expect(send("App start", undefined, ON)).resolves.toBe(false);
  });

  it("an event Plausible drops still counts as sent (it answers 202)", async () => {
    answer = async () =>
      new Response("{}", {
        status: 202,
        headers: { "x-plausible-dropped": "1" },
      });
    await expect(send("App start", undefined, ON)).resolves.toBe(true);
  });
});

describe("the event", () => {
  const ALLOWED = ["version", "os", "arch", "runs_as"];
  const facts: Facts = {
    version: "0.7.0",
    os: "macos",
    arch: "arm64",
    runs_as: "desktop",
  };

  it("has the documented shape", () => {
    expect(buildEvent("App start", facts, "example.test")).toEqual({
      name: "App start",
      url: "app://wifi-heatmapper/app-start",
      domain: "example.test",
      props: facts,
    });
    expect(buildEvent("Measurement", facts, "d", { speed_test: "on" })).toEqual(
      {
        name: "Measurement",
        url: "app://wifi-heatmapper/measurement",
        domain: "d",
        props: { ...facts, speed_test: "on" },
      },
    );
    expect(buildEvent("Install", facts, "d").url).toBe(
      "app://wifi-heatmapper/install",
    );
  });

  it("drops anything extra that is passed in by mistake (random fuzz)", () => {
    const junk = () =>
      Object.fromEntries(
        Array.from({ length: 8 }, (_, i) => [
          `k${i}${Math.random().toString(36).slice(2, 6)}`,
          Math.random().toString(36),
        ]),
      );
    for (let i = 0; i < 200; i++) {
      const dirty = {
        ...junk(),
        ...facts,
        ssid: "HomeNet",
        bssid: "aa:bb:cc:dd:ee:ff",
        sudoerPassword: "hunter2",
      } as unknown as Facts;
      const measurement = {
        ...junk(),
        speed_test: "off",
        mode: "signal",
        speed_ok: "skipped",
        rssi: -55,
        bitsPerSecond: 123e6,
      } as unknown as Parameters<typeof buildEvent>[3];
      const name = (["Install", "App start", "Measurement"] as const)[i % 3];
      const event = buildEvent(name, dirty, "d", measurement);
      expect(Object.keys(event).sort()).toEqual(
        ["domain", "name", "props", "url"].sort(),
      );
      expect(Object.keys(event.props).sort()).toEqual(
        (name === "Measurement" ? [...ALLOWED, "speed_test"] : ALLOWED).sort(),
      );
      const text = JSON.stringify(event);
      for (const bad of ["HomeNet", "aa:bb", "hunter2", "-55"]) {
        expect(text).not.toContain(bad);
      }
    }
  });

  it("describes this computer with fixed values only", () => {
    const f = runtimeFacts({});
    expect(["macos", "windows", "linux", "other"]).toContain(f.os);
    expect(["desktop", "docker", "podman", "browser"]).toContain(f.runs_as);
    expect(runtimeFacts({ WIFI_HEATMAPPER_RESOURCES_DIR: "/x" }).runs_as).toBe(
      "desktop",
    );
    expect(Object.keys(f).sort()).toEqual([...ALLOWED].sort());
  });

  it("accepts the Plausible base URL or the full event URL", () => {
    expect(eventEndpoint({})).toBe("https://plan.danielhnyk.cz/api/event");
    expect(
      eventEndpoint({ WIFI_HEATMAPPER_TELEMETRY_URL: "http://localhost:8000" }),
    ).toBe("http://localhost:8000/api/event");
    expect(
      eventEndpoint({ WIFI_HEATMAPPER_TELEMETRY_URL: "http://x:1/api/event" }),
    ).toBe("http://x:1/api/event");
  });
});

describe("a real measurement sends only counts", () => {
  // Names and addresses that look real, so a leak would show
  const SSIDS = ["Vodafone-7F3A", "FRITZ!Box 7590 KL", "eduroam", "Café Žluť"];
  const BSSIDS = ["3c:a6:2f:11:22:33", "F0-9F-C2-AB-CD-EF", "001122334455"];
  const SECRET = "s3cr3t-sudo";
  const SERVER = "192.168.1.42";
  const PLAN = "Home 2nd floor (private).png";

  const saved = { ...process.env };
  beforeEach(() => {
    // the job reads process.env; make it look like `next start`
    for (const k of ["CI", "DO_NOT_TRACK", "WIFI_HEATMAPPER_MOCK"]) {
      delete process.env[k];
    }
    process.env.WIFI_HEATMAPPER_TELEMETRY = "1";
    rmSync(join(dataDir, "surveys"), { recursive: true, force: true });
    resetMeasurementJobs();
  });
  afterEach(() => {
    process.env = { ...saved };
    resetMeasurementJobs();
  });

  const runner =
    (speed: boolean, warning?: string): Runner =>
    async () => ({
      wifiData: {
        ...getDefaultWifiResults(),
        ssid: SSIDS[1],
        bssid: BSSIDS[0],
        rssi: -61,
        signalStrength: 66,
        channel: 44,
      },
      iperfData: getDefaultIperfResults(),
      status: "",
      ...(warning ? { warning } : {}),
      fields: { strength: "66%", tcp: speed ? "100" : "Off", udp: "Off" },
    });

  it.each([
    [false, undefined, { speed_test: "off" }],
    [true, undefined, { speed_test: "on" }],
    [true, "iperf3 server not reachable", { speed_test: "on" }],
  ] as const)(
    "speed %s, warning %s -> %j",
    async (speed, warning, expected) => {
      // a survey full of real-looking data
      await store.mutate(PLAN, (s) => ({
        ...s,
        iperfServerAdrs: SERVER,
        apMapping: BSSIDS.map((macAddress, i) => ({
          apName: `AP ${SSIDS[i]}`,
          macAddress,
        })),
      }));
      const started = await startMeasurement(
        {
          survey: PLAN,
          x: 10,
          y: 20,
          settings: {
            measureSpeed: speed,
            iperfServerAdrs: SERVER,
            testDuration: 1,
            sudoerPassword: SECRET,
            iperfCommands: defaultIperfCommands,
          },
        },
        runner(speed, warning),
      );
      expect(started.ok).toBe(true);
      await vi.waitFor(() =>
        expect(names().filter((n) => n === "Measurement")).toHaveLength(1),
      );
      const call = calls.find(
        (c) => JSON.parse(String(c.init.body)).name === "Measurement",
      )!;
      const body = JSON.parse(String(call.init.body));
      expect(body.props).toEqual({
        ...runtimeFacts(process.env),
        ...expected,
      });
      const everything = JSON.stringify({
        url: call.url,
        headers: call.init.headers,
        body,
      });
      for (const bad of [
        ...SSIDS,
        ...BSSIDS,
        SERVER,
        SECRET,
        PLAN,
        "Home 2nd",
        dataDir,
      ]) {
        expect(everything).not.toContain(bad);
      }
      // the readings (the random id in the header may contain any digits)
      for (const value of ["-61", "66", "44"]) {
        expect(JSON.stringify(body)).not.toContain(value);
      }
      expect((await store.read(PLAN))!.surveyPoints).toHaveLength(1);
    },
  );
});

describe("Settings info", () => {
  it("the sample is the real Measurement event from this computer", async () => {
    const info = await usageCountsInfo(ON);
    expect(info.sample.body).toEqual(
      buildEvent(
        "Measurement",
        runtimeFacts(ON),
        "app.wifi-heatmapper.danielalder.cz",
        { speed_test: "on" },
      ),
    );
    expect(info.sample.endpoint).toBe("https://plan.danielhnyk.cz/api/event");
  });
});
