/**
 * The survey route handlers, called directly with a NextRequest against a
 * temporary data directory.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import * as settingsRoute from "@/app/api/settings/route";
import * as copyRoute from "@/app/api/settings/copy/route";
import * as pointsRoute from "@/app/api/surveys/[name]/points/route";
import * as pointRoute from "@/app/api/surveys/[name]/points/[id]/route";
import * as startTaskRoute from "@/app/api/start-task/route";
import { getDefaultIperfResults, getDefaultWifiResults } from "@/lib/utils";

const dataDir = mkdtempSync(join(tmpdir(), "wifi-heatmapper-api-"));
const surveysDir = join(dataDir, "surveys");
const previous = process.env.WIFI_HEATMAPPER_DATA_DIR;
process.env.WIFI_HEATMAPPER_DATA_DIR = dataDir;

afterAll(() => {
  if (previous === undefined) delete process.env.WIFI_HEATMAPPER_DATA_DIR;
  else process.env.WIFI_HEATMAPPER_DATA_DIR = previous;
  rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(() => rmSync(surveysDir, { recursive: true, force: true }));

function req(path: string, method = "GET", body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    body:
      body === undefined
        ? undefined
        : typeof body === "string"
          ? body
          : JSON.stringify(body),
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
  });
}
const params = <T>(p: T) => ({ params: Promise.resolve(p) });

const NAME = "My plan.png";
const q = `?name=${encodeURIComponent(NAME)}`;
const newPoint = (x: number) => ({
  id: "",
  x,
  y: 10,
  timestamp: 1,
  isEnabled: true,
  wifiData: getDefaultWifiResults(),
  iperfData: getDefaultIperfResults(),
});

async function add(x: number) {
  return pointsRoute.POST(
    req(`/api/surveys/x/points`, "POST", newPoint(x)),
    params({ name: NAME }),
  );
}

describe("/api/settings", () => {
  it("GET is 404 until a PATCH creates the survey", async () => {
    expect((await settingsRoute.GET(req(`/api/settings${q}`))).status).toBe(
      404,
    );
    const res = await settingsRoute.PATCH(
      req(`/api/settings${q}`, "PATCH", {}),
    );
    expect(res.status).toBe(200);
    const survey = await res.json();
    expect(survey).toMatchObject({
      floorplanImageName: NAME,
      floorplanImagePath: `/api/media/${encodeURIComponent(NAME)}`,
      surveyPoints: [],
    });
    expect(survey.meta.savedAt).toEqual(expect.any(String));
    const read = await settingsRoute.GET(req(`/api/settings${q}`));
    expect(await read.json()).toEqual(survey);
    const list = await settingsRoute.GET(req(`/api/settings?list=true`));
    expect(await list.json()).toEqual({ surveys: ["My_plan.png"] });
  });

  it("PATCH changes only the given settings and returns the survey", async () => {
    await add(1);
    const res = await settingsRoute.PATCH(
      req(`/api/settings${q}`, "PATCH", {
        testDuration: 3,
        iperfCommands: { tcpUpload: "iperf3 -c {server} -J" },
      }),
    );
    const survey = await res.json();
    expect(survey.testDuration).toBe(3);
    expect(survey.iperfCommands.tcpUpload).toBe("iperf3 -c {server} -J");
    expect(survey.iperfCommands.tcpDownload).toMatch(/-R/);
    expect(survey.surveyPoints).toHaveLength(1);
  });

  it("PATCH refuses bad bodies and writes nothing", async () => {
    for (const body of [
      { sudoerPassword: "x" },
      { surveyPoints: [] },
      { maxOpacity: 5 },
      "not json",
      [],
    ]) {
      const res = await settingsRoute.PATCH(
        req(`/api/settings${q}`, "PATCH", body),
      );
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect((await res.json()).error).toMatch(/Invalid request|not JSON/);
    }
    expect(
      (await settingsRoute.PATCH(req(`/api/settings`, "PATCH", {}))).status,
    ).toBe(400);
    expect((await settingsRoute.GET(req(`/api/settings${q}`))).status).toBe(
      404,
    );
  });

  it("POST still replaces a whole survey, read like a file", async () => {
    const res = await settingsRoute.POST(
      req(`/api/settings`, "POST", {
        floorplanImageName: NAME,
        sudoerPassword: "pw",
        testDuration: "bad",
        heatmapRanges: { signalStrength: { min: 90, max: 10, enabled: true } },
        surveyPoints: [
          {
            ...newPoint(1),
            id: "Point_1",
            iperfResults: getDefaultIperfResults(),
          },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const text = readFileSync(join(surveysDir, "My_plan.png.json"), "utf-8");
    expect(text).not.toMatch(/sudoerPassword|iperfResults/);
    const saved = JSON.parse(text);
    expect(saved.testDuration).toBe(1);
    expect(saved.heatmapRanges).toEqual({});
    expect(saved.surveyPoints[0].iperfData).toBeDefined();
    expect(
      (await settingsRoute.POST(req(`/api/settings`, "POST", { a: 1 }))).status,
    ).toBe(400);
  });

  it("a damaged file is reported, not overwritten", async () => {
    mkdirSync(surveysDir, { recursive: true });
    const file = join(surveysDir, "My_plan.png.json");
    writeFileSync(file, "{");
    const res = await settingsRoute.GET(req(`/api/settings${q}`));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/not valid JSON/);
    expect(
      (await settingsRoute.PATCH(req(`/api/settings${q}`, "PATCH", {}))).status,
    ).toBe(500);
    expect((await add(1)).status).toBe(500);
    expect(readFileSync(file, "utf-8")).toBe("{");
  });

  it("DELETE removes the survey", async () => {
    await add(1);
    expect(
      (await settingsRoute.DELETE(req(`/api/settings${q}`, "DELETE"))).status,
    ).toBe(200);
    expect((await settingsRoute.GET(req(`/api/settings${q}`))).status).toBe(
      404,
    );
  });

  it("a new survey starts from the last saved survey's speed settings", async () => {
    await settingsRoute.PATCH(
      req(`/api/settings${q}`, "PATCH", {
        measureSpeed: true,
        iperfServerAdrs: "10.0.0.3",
        testDuration: 4,
        apMapping: [{ apName: "Hall", macAddress: "aabbccddeeff" }],
      }),
    );
    const res = await settingsRoute.PATCH(
      req(`/api/settings?name=second.png`, "PATCH", {}),
    );
    const survey = await res.json();
    expect(survey).toMatchObject({
      measureSpeed: true,
      iperfServerAdrs: "10.0.0.3",
      testDuration: 4,
      apMapping: [],
    });
    expect(survey.meta.speedSettingsFrom).toBe(NAME);
  });
});

describe("/api/settings/copy", () => {
  const copy = (query: string) =>
    copyRoute.POST(req(`/api/settings/copy?${query}`, "POST"));

  async function twoSurveys() {
    await settingsRoute.PATCH(
      req(`/api/settings${q}`, "PATCH", {
        measureSpeed: true,
        iperfServerAdrs: "10.0.0.4",
        apMapping: [{ apName: "Hall", macAddress: "aabbccddeeff" }],
        maxOpacity: 0.4,
        dimensions: { width: 900, height: 600 },
      }),
    );
    await add(1);
    await settingsRoute.POST(
      req(`/api/settings`, "POST", { floorplanImageName: "b.png" }),
    );
  }

  it("copies the parts asked for and returns the target", async () => {
    await twoSurveys();
    const from = encodeURIComponent(NAME);
    let res = await copy(`from=${from}&to=b.png&parts=speed`);
    expect(res.status).toBe(200);
    let survey = await res.json();
    expect(survey).toMatchObject({
      floorplanImageName: "b.png",
      measureSpeed: true,
      iperfServerAdrs: "10.0.0.4",
      apMapping: [],
      maxOpacity: 0.7,
      surveyPoints: [],
      dimensions: { width: 100, height: 100 },
    });
    res = await copy(`from=${from}&to=b.png&parts=apNames,heatmapLook`);
    survey = await res.json();
    expect(survey.apMapping).toHaveLength(1);
    expect(survey.maxOpacity).toBe(0.4);
    expect(survey.surveyPoints).toEqual([]);
    expect(survey).not.toHaveProperty("sudoerPassword");
    const onDisk = JSON.parse(
      readFileSync(join(surveysDir, "b.png.json"), "utf-8"),
    );
    expect(onDisk.maxOpacity).toBe(0.4);
  });

  it("refuses bad queries and writes nothing", async () => {
    await twoSurveys();
    const before = readFileSync(join(surveysDir, "b.png.json"), "utf-8");
    const from = encodeURIComponent(NAME);
    for (const [query, status] of [
      [`from=${from}&to=b.png&parts=points`, 400],
      [`from=${from}&to=b.png&parts=`, 400],
      [`from=${from}&to=b.png`, 400],
      [`to=b.png&parts=speed`, 400],
      [`from=${from}&to=b.png&parts=speed&sudoerPassword=x`, 400],
      [`from=b.png&to=b.png&parts=speed`, 400],
      [`from=nope.png&to=b.png&parts=speed`, 404],
    ] as const) {
      const res = await copy(query);
      expect(res.status, query).toBe(status);
      expect((await res.json()).error).toEqual(expect.any(String));
    }
    expect(readFileSync(join(surveysDir, "b.png.json"), "utf-8")).toBe(before);
  });
});

describe("/api/surveys/[name]/points", () => {
  it("POST adds points with server-assigned ids", async () => {
    const first = await (await add(1)).json();
    expect(first.surveyPoints.map((p: { id: string }) => p.id)).toEqual([
      "Point_1",
    ]);
    // two writers at once: both points survive
    const results = await Promise.all([add(2), add(3), add(4)]);
    expect(results.every((r) => r.status === 200)).toBe(true);
    const survey = await (
      await settingsRoute.GET(req(`/api/settings${q}`))
    ).json();
    expect(survey.surveyPoints.map((p: { id: string }) => p.id).sort()).toEqual(
      ["Point_1", "Point_2", "Point_3", "Point_4"],
    );
    expect(survey.nextPointNum).toBe(5);
  });

  it("POST refuses a bad point", async () => {
    const bad = await pointsRoute.POST(
      req(`/api/surveys/x/points`, "POST", { ...newPoint(1), x: "left" }),
      params({ name: NAME }),
    );
    expect(bad.status).toBe(400);
    const extra = await pointsRoute.POST(
      req(`/api/surveys/x/points`, "POST", { ...newPoint(1), colour: "red" }),
      params({ name: NAME }),
    );
    expect(extra.status).toBe(400);
  });

  it("PATCH changes one point; 404 for an unknown one", async () => {
    await add(1);
    await add(2);
    const res = await pointRoute.PATCH(
      req(`/api/surveys/x/points/Point_2`, "PATCH", { isEnabled: false }),
      params({ name: NAME, id: "Point_2" }),
    );
    const survey = await res.json();
    expect(
      survey.surveyPoints.map((p: { isEnabled: boolean }) => p.isEnabled),
    ).toEqual([true, false]);
    const missing = await pointRoute.PATCH(
      req(`/api/surveys/x/points/Point_9`, "PATCH", { isEnabled: false }),
      params({ name: NAME, id: "Point_9" }),
    );
    expect(missing.status).toBe(404);
    const renamed = await pointRoute.PATCH(
      req(`/api/surveys/x/points/Point_1`, "PATCH", { id: "Point_7" }),
      params({ name: NAME, id: "Point_1" }),
    );
    expect(renamed.status).toBe(400);
    const none = await pointRoute.PATCH(
      req(`/api/surveys/x/points/Point_1`, "PATCH", { isEnabled: false }),
      params({ name: "nothing.png", id: "Point_1" }),
    );
    expect(none.status).toBe(404);
    expect(
      (await settingsRoute.GET(req(`/api/settings?name=nothing.png`))).status,
    ).toBe(404);
  });

  it("DELETE removes the listed points", async () => {
    await add(1);
    await add(2);
    await add(3);
    const res = await pointsRoute.DELETE(
      req(`/api/surveys/x/points`, "DELETE", {
        ids: ["Point_1", "Point_3", "nope"],
      }),
      params({ name: NAME }),
    );
    expect(
      (await res.json()).surveyPoints.map((p: { id: string }) => p.id),
    ).toEqual(["Point_2"]);
    const bad = await pointsRoute.DELETE(
      req(`/api/surveys/x/points`, "DELETE", { id: "Point_2" }),
      params({ name: NAME }),
    );
    expect(bad.status).toBe(400);
  });
});

describe("/api/start-task", () => {
  it("refuses a start without measurement settings", async () => {
    const res = await startTaskRoute.POST(
      req(`/api/start-task?action=start`, "POST", {
        settings: { testDuration: 1 },
      }),
    );
    expect(res.status).toBe(400);
  });
});
