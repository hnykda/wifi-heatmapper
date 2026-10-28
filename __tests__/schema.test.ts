import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  addPointSchema,
  deletePointsSchema,
  describeIssues,
  parseSurveyFile,
  pointPatchSchema,
  settingsPatchSchema,
  startTaskSchema,
  surveyImportSchema,
} from "@/lib/schema";
import { defaultSurvey } from "@/lib/survey-defaults";
import {
  addPoint,
  applySettingsPatch,
  deletePoints,
  keepUnchanged,
  SETTINGS_PATCH_KEYS,
  updatePoint,
} from "@/lib/survey-ops";
import { defaultIperfCommands } from "@/lib/iperfUtils";
import { getDefaultIperfResults, getDefaultWifiResults } from "@/lib/utils";
import { clearLogBuffer, recentLogLines } from "@/lib/logger";

const fixture = (name: string) =>
  JSON.parse(
    readFileSync(join(__dirname, "data", "surveys", name), "utf-8"),
  ) as Record<string, unknown>;

const point = (id: string, x = 1, y = 2) => ({
  id,
  x,
  y,
  timestamp: 1,
  isEnabled: true,
  wifiData: getDefaultWifiResults(),
  iperfData: getDefaultIperfResults(),
});

describe("reading survey files (lenient)", () => {
  it("fills a nearly empty file with the defaults", () => {
    expect(parseSurveyFile({}, "Plan.png")).toEqual(defaultSurvey("Plan.png"));
  });

  it("reads a current file back unchanged", () => {
    const current = {
      ...defaultSurvey("Plan.png"),
      surveyPoints: [point("Point_1"), point("Point_2", 5, 6)],
      nextPointNum: 3,
      iperfServerAdrs: "nas.local:5201",
      apMapping: [{ apName: "Hall", macAddress: "aabbccddee01" }],
      heatmapRanges: {
        signalStrength: { min: 10, max: 90, enabled: true },
        "udpUpload-jitterMs": { min: 0, max: 5, enabled: false },
      },
      meta: {
        schemaVersion: 1,
        appVersion: "0.7.0",
        platform: "darwin",
        osName: "macOS 15",
        savedAt: "2026-10-01T00:00:00.000Z",
      },
    };
    const json = JSON.parse(JSON.stringify(current));
    expect(parseSurveyFile(json, "Plan.png")).toEqual(json);
  });

  it("migrates a pre-0.4 file: iperfResults, /media path, password", () => {
    const raw = fixture("v0.3-iperfResults.json");
    const survey = parseSurveyFile(raw, "Home.png");
    expect(survey.surveyPoints).toHaveLength(2);
    for (const [i, p] of survey.surveyPoints.entries()) {
      const old = (raw.surveyPoints as Record<string, unknown>[])[i];
      expect(p.iperfData).toEqual(old.iperfResults);
      expect(p).not.toHaveProperty("iperfResults");
    }
    expect(survey.surveyPoints[1].isEnabled).toBe(false);
    expect(survey.floorplanImagePath).toBe("/api/media/Home.png");
    expect(survey).not.toHaveProperty("sudoerPassword");
    expect(JSON.stringify(survey)).not.toContain("hunter2");
    // missing in the old file: defaults
    expect(survey.heatmapRanges).toEqual({});
    expect(survey.iperfCommands).toEqual(defaultIperfCommands);
    // no measureSpeed in the old file: a real server means signal and speed
    expect(survey.measureSpeed).toBe(true);
    // kept as they were
    expect(survey).toMatchObject({
      iperfServerAdrs: "192.168.1.10",
      testDuration: 2,
      nextPointNum: 3,
      dimensions: { width: 800, height: 600 },
      apMapping: [{ apName: "Hall", macAddress: "9e05d696e830" }],
      gradient: raw.gradient,
    });
  });

  it("loads what it can from a damaged file", () => {
    const survey = parseSurveyFile(fixture("damaged.json"), "Office.png");
    const defaults = defaultSurvey("Office.png");

    // points without a usable position or id are dropped, the rest load
    expect(survey.surveyPoints.map((p) => p.id)).toEqual([
      "Point_1",
      "Point_5",
    ]);
    const [p1, p5] = survey.surveyPoints;
    expect(p1.timestamp).toBe(0);
    expect(p1.isEnabled).toBe(true);
    expect(p1.wifiData).toMatchObject({
      ssid: "Office",
      rssi: -60,
      signalStrength: 66,
      channel: 0, // was "thirty-six"
      security: "",
      currentSSID: false,
      strongestSSID: null,
    });
    expect(p1.wifiData.noise).toBeUndefined();
    expect(p1.iperfData.tcpDownload.bitsPerSecond).toBe(0);
    expect(p5.wifiData.noise).toBe(-92);
    expect(p5.iperfData.tcpDownload.bitsPerSecond).toBe(500e6);
    expect(p5.iperfData.tcpUpload.bitsPerSecond).toBe(0);
    expect(p5.iperfData.udpDownload).toMatchObject({
      bitsPerSecond: 0,
      jitterMs: null,
    });
    expect(p5.iperfData.udpUpload.packetsReceived).toBe(7000);

    // each bad setting falls back on its own
    expect(survey.floorplanImageName).toBe("Office.png");
    expect(survey.iperfServerAdrs).toBe("");
    expect(survey.measureSpeed).toBe(false); // no usable server: signal only
    expect(survey.testDuration).toBe(1);
    expect(survey.nextPointNum).toBe(1);
    expect(survey.dimensions).toEqual(defaults.dimensions);
    expect(survey.radiusDivider).toBeNull();
    expect(survey.maxOpacity).toBe(0.7);
    expect(survey.minOpacity).toBe(0.2); // missing
    expect(survey.blur).toBe(0.99);
    expect(survey.apMapping).toEqual([
      { apName: "Hall", macAddress: "aabbccddee01" },
    ]);
    expect(survey.gradient).toEqual({ 0: "red" });
    expect(survey.heatmapRanges).toEqual({
      "tcpDownload-bitsPerSecond": { min: 0, max: 400, enabled: true },
    });
    // an old command template becomes its extra options
    expect(survey.iperfCommands).toEqual({
      ...defaultIperfCommands,
      tcpDownload: ["-P", "3"],
    });
    expect(survey.meta).toBeUndefined();
    expect(survey).not.toHaveProperty("someFutureField");
  });

  it("falls back to the default gradient when no stop is usable", () => {
    expect(parseSurveyFile({ gradient: { x: 1 } }, "a.png").gradient).toEqual(
      defaultSurvey("a.png").gradient,
    );
  });

  it("keeps the stored spelling of the name when it is the same file", () => {
    const same = (a: string, b: string) =>
      a.replace(/ /g, "_") === b.replace(/ /g, "_");
    expect(
      parseSurveyFile(
        { floorplanImageName: "My plan.png" },
        "My_plan.png",
        same,
      ).floorplanImageName,
    ).toBe("My plan.png");
    expect(
      parseSurveyFile({ floorplanImageName: "Other.png" }, "Mine.png", same)
        .floorplanImageName,
    ).toBe("Mine.png");
  });
});

describe("request bodies (strict)", () => {
  it("accepts a settings patch and refuses unknown or bad fields", () => {
    expect(
      settingsPatchSchema.parse({
        testDuration: 3,
        maxOpacity: 0.5,
        iperfServerAdrs: " 10.0.0.2 ",
        iperfCommands: { tcpUpload: ["-P", "4"] },
        heatmapRanges: {
          signalStrength: null,
          "tcpDownload-bitsPerSecond": { min: 0, max: 600, enabled: true },
        },
        gradient: { 0: "red", 1: "green" },
      }),
    ).toMatchObject({ iperfServerAdrs: "10.0.0.2" });
    expect(settingsPatchSchema.parse({})).toEqual({});

    for (const bad of [
      { sudoerPassword: "x" },
      { surveyPoints: [] },
      { nextPointNum: 5 },
      { testDuration: 0 },
      { testDuration: 1.5 },
      { maxOpacity: 2 },
      { maxOpacity: null },
      { radiusDivider: -1 },
      { dimensions: { width: 0, height: 10 } },
      { gradient: {} },
      { gradient: { 2: "red" } },
      { iperfCommands: { tcpSideways: [] } },
      { iperfCommands: { tcpUpload: 5 } },
      // command templates are not options any more
      { iperfCommands: { tcpUpload: "iperf3 -c {server} -J" } },
      // options the app sets itself
      { iperfCommands: { tcpUpload: ["-c", "evil"] } },
      { iperfCommands: { udpUpload: ["-J"] } },
      { apMapping: [{ apName: "a" }] },
      { heatmapRanges: { bogus: { min: 0, max: 1, enabled: true } } },
      {
        heatmapRanges: { signalStrength: { min: 0, max: 120, enabled: true } },
      },
      { heatmapRanges: { snr: { min: 0, max: 40 } } },
    ]) {
      expect(
        settingsPatchSchema.safeParse(bad).success,
        JSON.stringify(bad),
      ).toBe(false);
    }
  });

  it("names the problems in a 400 answer", () => {
    const r = settingsPatchSchema.safeParse({
      sudoerPassword: "x",
      heatmapRanges: { bogus: {} },
    });
    expect(r.success).toBe(false);
    const text = describeIssues(r.error!);
    expect(text).toMatch(/unknown field sudoerPassword/);
    expect(text).toMatch(/heatmapRanges.bogus: is not a heat map/);
  });

  it("SETTINGS_PATCH_KEYS lists what the patch schema accepts", () => {
    expect([...SETTINGS_PATCH_KEYS].sort()).toEqual(
      Object.keys(settingsPatchSchema.shape).sort(),
    );
  });

  it("checks new points, point patches and deletions", () => {
    const p = point("");
    expect(addPointSchema.parse(p)).toMatchObject({ x: 1, y: 2, id: "" });
    const noId: Partial<typeof p> = { ...p };
    delete noId.id;
    expect(addPointSchema.safeParse(noId).success).toBe(true);
    expect(addPointSchema.safeParse({ ...p, extra: 1 }).success).toBe(false);
    expect(addPointSchema.safeParse({ ...p, x: "1" }).success).toBe(false);
    expect(addPointSchema.safeParse({ ...p, wifiData: "x" }).success).toBe(
      false,
    );
    // a scanner that leaves a field out still gets its point saved
    const partialWifi: Partial<ReturnType<typeof getDefaultWifiResults>> =
      getDefaultWifiResults();
    delete partialWifi.txRate;
    expect(
      addPointSchema.parse({ ...p, wifiData: partialWifi }).wifiData.txRate,
    ).toBe(0);

    expect(pointPatchSchema.parse({ isEnabled: false })).toEqual({
      isEnabled: false,
    });
    expect(pointPatchSchema.safeParse({ id: "Point_9" }).success).toBe(false);
    expect(pointPatchSchema.safeParse({ isEnabled: "no" }).success).toBe(false);

    expect(deletePointsSchema.parse({ ids: ["Point_1"] })).toEqual({
      ids: ["Point_1"],
    });
    expect(deletePointsSchema.safeParse({ ids: "Point_1" }).success).toBe(
      false,
    );
    expect(deletePointsSchema.safeParse({}).success).toBe(false);
  });

  it("needs a floor plan name to import a whole survey", () => {
    expect(surveyImportSchema.safeParse({}).success).toBe(false);
    expect(
      surveyImportSchema.safeParse({ floorplanImageName: "" }).success,
    ).toBe(false);
    expect(
      surveyImportSchema.parse({ floorplanImageName: "a.png", other: 1 }),
    ).toEqual({ floorplanImageName: "a.png", other: 1 });
  });

  it("checks the measurement settings", () => {
    const settings = {
      iperfServerAdrs: "localhost",
      testDuration: 1,
      sudoerPassword: "",
      iperfCommands: defaultIperfCommands,
    };
    const spot = { survey: "a.png", x: 10, y: 20 };
    expect(startTaskSchema.parse({ ...spot, settings })).toEqual({
      ...spot,
      settings,
    });
    expect(startTaskSchema.safeParse({}).success).toBe(false);
    // the spot is required: the server saves the point there
    expect(startTaskSchema.safeParse({ settings }).success).toBe(false);
    expect(
      startTaskSchema.safeParse({ ...spot, survey: " ", settings }).success,
    ).toBe(false);
    expect(
      startTaskSchema.safeParse({ ...spot, x: -1, settings }).success,
    ).toBe(false);
    expect(
      startTaskSchema.safeParse({
        ...spot,
        settings: { ...settings, testDuration: "1" },
      }).success,
    ).toBe(false);
  });
});

describe("survey operations", () => {
  const base = { ...defaultSurvey("a.png"), nextPointNum: 3 };

  it("adds points with the next free id", () => {
    const one = addPoint(base, point(""));
    expect(one.surveyPoints.map((p) => p.id)).toEqual(["Point_3"]);
    expect(one.nextPointNum).toBe(4);
    // an id that is already taken (a damaged nextPointNum) is skipped
    const taken = addPoint(
      { ...base, nextPointNum: 1, surveyPoints: [point("Point_1")] },
      point(""),
    );
    expect(taken.surveyPoints.map((p) => p.id)).toEqual(["Point_1", "Point_2"]);
    expect(taken.nextPointNum).toBe(3);
    // a given free id is kept
    expect(addPoint(base, point("Mine")).surveyPoints[0].id).toBe("Mine");
  });

  it("updates and deletes points by id", () => {
    const two = addPoint(addPoint(base, point("")), point(""));
    const off = updatePoint(two, "Point_4", { isEnabled: false })!;
    expect(off.surveyPoints.map((p) => p.isEnabled)).toEqual([true, false]);
    expect(updatePoint(two, "Point_99", { isEnabled: false })).toBeNull();
    expect(
      deletePoints(two, ["Point_3", "nope"]).surveyPoints.map((p) => p.id),
    ).toEqual(["Point_4"]);
  });

  it("keeps the parts of a survey the server answered unchanged", () => {
    const shown = addPoint(base, point(""));
    const answer = JSON.parse(
      JSON.stringify({ ...shown, testDuration: 2 }),
    ) as typeof shown;
    const merged = keepUnchanged(shown, answer);
    expect(merged).toEqual(answer);
    expect(merged).not.toBe(shown);
    expect(merged.surveyPoints).toBe(shown.surveyPoints);
    expect(merged.gradient).toBe(shown.gradient);
    expect(keepUnchanged(shown, JSON.parse(JSON.stringify(shown)))).toBe(shown);
    const fewer = { ...answer, surveyPoints: [] };
    expect(keepUnchanged(shown, fewer).surveyPoints).toEqual([]);
  });

  it("merges commands and colour scales per key", () => {
    const withRange = {
      ...base,
      heatmapRanges: { snr: { min: 0, max: 40, enabled: true } },
    };
    const next = applySettingsPatch(withRange, {
      testDuration: 5,
      iperfCommands: { tcpUpload: ["-P", "4"] },
      heatmapRanges: {
        snr: null,
        signalStrength: { min: 0, max: 80, enabled: true },
      },
    });
    expect(next.testDuration).toBe(5);
    expect(next.iperfCommands).toEqual({
      ...defaultIperfCommands,
      tcpUpload: ["-P", "4"],
    });
    expect(next.heatmapRanges).toEqual({
      signalStrength: { min: 0, max: 80, enabled: true },
    });
    expect(withRange.heatmapRanges.snr).toBeDefined(); // not mutated
  });
});

describe("iperf3 commands from before 0.8", () => {
  const load = (iperfCommands: Record<string, unknown>) =>
    parseSurveyFile({ floorplanImageName: "old.png", iperfCommands }, "old.png")
      .iperfCommands;

  it("the old default templates become the default options", () => {
    expect(
      load({
        tcpDownload: "iperf3 -c {server} {port} -t {duration} -R -J",
        tcpUpload: "iperf3 -c {server} {port} -t {duration} -J",
        udpDownload: "iperf3 -c {server} {port} -t {duration} -R -u -b 100M -J",
        udpUpload: "iperf3 -c {server} {port} -t {duration} -u -b 100M -J",
      }),
    ).toEqual(defaultIperfCommands);
  });

  it("a changed template keeps its extra options", () => {
    expect(
      load({
        udpUpload: "iperf3 -c {server} {port} -t {duration} -u -b 500M -J",
      }).udpUpload,
    ).toEqual(["-b", "500M"]);
  });

  it("a template with shell syntax falls back to the defaults, with a warning", () => {
    clearLogBuffer();
    const loaded = load({
      tcpDownload: "iperf3 -c {server} -t {duration} -R -J; touch /tmp/pwned",
      udpUpload: "iperf3 -c {server} -t {duration} -u -J | tee /tmp/log",
    });
    expect(loaded).toEqual(defaultIperfCommands);
    const log = recentLogLines().join("\n");
    expect(log).toMatch(/tcpDownload iperf3 command .* contains shell syntax/);
    expect(log).toMatch(/udpUpload iperf3 command/);
  });

  it("options that are already arguments load as they are", () => {
    expect(load({ tcpUpload: ["-P", "4"] }).tcpUpload).toEqual(["-P", "4"]);
    // ...unless they set what the app sets
    expect(load({ tcpUpload: ["-c", "evil"] }).tcpUpload).toEqual([]);
  });
});
