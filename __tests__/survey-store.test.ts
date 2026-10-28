import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as store from "@/lib/survey-store";
import { addPoint } from "@/lib/survey-ops";
import { getDefaultIperfResults, getDefaultWifiResults } from "@/lib/utils";

const dataDir = mkdtempSync(join(tmpdir(), "wifi-heatmapper-store-"));
const surveysDir = join(dataDir, "surveys");
const previous = process.env.WIFI_HEATMAPPER_DATA_DIR;
process.env.WIFI_HEATMAPPER_DATA_DIR = dataDir;

afterAll(() => {
  if (previous === undefined) delete process.env.WIFI_HEATMAPPER_DATA_DIR;
  else process.env.WIFI_HEATMAPPER_DATA_DIR = previous;
  rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(() => {
  rmSync(surveysDir, { recursive: true, force: true });
});

const newPoint = (x = 1) => ({
  id: "",
  x,
  y: 2,
  timestamp: 1,
  isEnabled: true,
  wifiData: getDefaultWifiResults(),
  iperfData: getDefaultIperfResults(),
});

const onDisk = (name: string) =>
  JSON.parse(readFileSync(join(surveysDir, `${name}.json`), "utf-8"));

describe("survey-store", () => {
  it("reads null for a missing survey; mutate creates it", async () => {
    expect(await store.read("a.png")).toBeNull();
    const saved = await store.mutate("a.png", (s) => ({
      ...s,
      testDuration: 4,
    }));
    expect(saved.testDuration).toBe(4);
    expect(saved.floorplanImageName).toBe("a.png");
    expect(saved.meta).toMatchObject({ schemaVersion: 1 });
    expect(onDisk("a.png")).toEqual(JSON.parse(JSON.stringify(saved)));
    expect(await store.read("a.png")).toEqual(saved);
    expect(await store.list()).toEqual(["a.png"]);
  });

  it("never writes the sudo password", async () => {
    mkdirSync(surveysDir, { recursive: true });
    writeFileSync(
      join(surveysDir, "old.png.json"),
      JSON.stringify({ floorplanImageName: "old.png", sudoerPassword: "pw" }),
    );
    expect(await store.read("old.png")).not.toHaveProperty("sudoerPassword");
    await store.mutate("old.png", (s) => ({ ...s, sudoerPassword: "pw2" }));
    expect(readFileSync(join(surveysDir, "old.png.json"), "utf-8")).not.toMatch(
      /sudoerPassword|pw/,
    );
  });

  it("loses no update when many changes to one file overlap", async () => {
    const n = 40;
    await Promise.all(
      Array.from({ length: n }, (_, i) =>
        store.mutate("busy.png", async (s) => {
          // yield between read and write, as real I/O would
          await new Promise((r) => setTimeout(r, Math.random() * 3));
          return addPoint(s, newPoint(i));
        }),
      ),
    );
    const survey = onDisk("busy.png");
    expect(survey.surveyPoints).toHaveLength(n);
    const ids = new Set(survey.surveyPoints.map((p: { id: string }) => p.id));
    expect(ids.size).toBe(n);
    expect(survey.nextPointNum).toBe(n + 1);
    // no temp files left behind
    expect(readdirSync(surveysDir)).toEqual(["busy.png.json"]);
  });

  it("serializes names that share a file", async () => {
    // "a b.png" and "a_b.png" are both stored as a_b.png.json
    await Promise.all([
      store.mutate("a b.png", (s) => addPoint(s, newPoint())),
      store.mutate("a_b.png", (s) => addPoint(s, newPoint())),
      store.mutate("a b.png", (s) => addPoint(s, newPoint())),
    ]);
    expect(onDisk("a_b.png").surveyPoints).toHaveLength(3);
  });

  it("a refused change writes nothing and doesn't block the next", async () => {
    await store.mutate("r.png", (s) => s);
    const before = readFileSync(join(surveysDir, "r.png.json"), "utf-8");
    const refused = store.mutate("r.png", () => {
      throw new store.SurveyChangeError("no", 404);
    });
    const next = store.mutate("r.png", (s) => ({ ...s, testDuration: 9 }));
    await expect(refused).rejects.toMatchObject({ status: 404 });
    expect((await next).testDuration).toBe(9);
    expect(before).not.toBe(
      readFileSync(join(surveysDir, "r.png.json"), "utf-8"),
    );

    // a refused change on a missing survey doesn't create it
    await expect(
      store.mutate("none.png", () => {
        throw new store.SurveyChangeError("no");
      }),
    ).rejects.toThrow("no");
    expect(existsSync(join(surveysDir, "none.png.json"))).toBe(false);
  });

  it("leaves a file that isn't JSON alone", async () => {
    mkdirSync(surveysDir, { recursive: true });
    const file = join(surveysDir, "bad.png.json");
    writeFileSync(file, "{ not json");
    await expect(store.read("bad.png")).rejects.toBeInstanceOf(
      store.SurveyFileError,
    );
    await expect(store.mutate("bad.png", (s) => s)).rejects.toBeInstanceOf(
      store.SurveyFileError,
    );
    writeFileSync(join(surveysDir, "arr.png.json"), "[1, 2]");
    await expect(store.read("arr.png")).rejects.toBeInstanceOf(
      store.SurveyFileError,
    );
    expect(readFileSync(file, "utf-8")).toBe("{ not json");
  });

  it("replaces a whole survey and removes it", async () => {
    const saved = await store.replace("w.png", {
      floorplanImageName: "w.png",
      testDuration: 7,
      surveyPoints: [{ ...newPoint(), id: "Point_1" }],
    });
    expect(saved.testDuration).toBe(7);
    expect(saved.surveyPoints).toHaveLength(1);
    await store.remove("w.png");
    expect(await store.read("w.png")).toBeNull();
    await store.remove("w.png"); // already gone: fine
  });
});
