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

  describe("a new survey", () => {
    const speed = {
      measureSpeed: true,
      iperfServerAdrs: "192.168.1.10:5201",
      testDuration: 5,
      iperfCommands: {
        tcpDownload: ["-P", "4"],
        tcpUpload: ["-P", "4"],
        udpDownload: ["-b", "500M"],
        udpUpload: ["-b", "500M"],
      },
    };

    it("starts from the defaults when there is no other survey", async () => {
      const saved = await store.mutate("first.png", (s) => s);
      expect(saved).toMatchObject({
        measureSpeed: false,
        iperfServerAdrs: "",
        testDuration: 1,
      });
      expect(saved.meta?.speedSettingsFrom).toBeUndefined();
    });

    it("copies the speed settings of the most recently saved survey", async () => {
      await store.mutate("older.png", (s) => ({
        ...s,
        ...speed,
        iperfServerAdrs: "10.0.0.1",
      }));
      await new Promise((r) => setTimeout(r, 5));
      await store.mutate("newer.png", (s) => ({
        ...s,
        ...speed,
        apMapping: [{ apName: "Hall", macAddress: "aabbccddeeff" }],
        maxOpacity: 0.9,
        surveyPoints: [{ ...newPoint(), id: "Point_1" }],
      }));
      const saved = await store.mutate("second.png", (s) => s);
      expect(saved).toMatchObject(speed);
      // only the speed settings: not the names, the look or the points
      expect(saved.apMapping).toEqual([]);
      expect(saved.maxOpacity).toBe(0.7);
      expect(saved.surveyPoints).toEqual([]);
      expect(saved.floorplanImageName).toBe("second.png");
      expect(saved.meta?.speedSettingsFrom).toBe("newer.png");
      // said only on the save that created it
      const next = await store.mutate("second.png", (s) => s);
      expect(next.meta?.speedSettingsFrom).toBeUndefined();
      expect(next.iperfServerAdrs).toBe("192.168.1.10:5201");
    });

    it("says nothing when the last survey has the default speed settings", async () => {
      await store.mutate("plain.png", (s) => s);
      const saved = await store.mutate("next.png", (s) => s);
      expect(saved.meta?.speedSettingsFrom).toBeUndefined();
      expect(saved.measureSpeed).toBe(false);
    });

    it("skips files it can't read; files without meta use their date", async () => {
      mkdirSync(surveysDir, { recursive: true });
      writeFileSync(join(surveysDir, "broken.png.json"), "{ not json");
      writeFileSync(
        join(surveysDir, "old.png.json"),
        JSON.stringify({
          floorplanImageName: "old.png",
          iperfServerAdrs: "10.0.0.7",
        }),
      );
      const saved = await store.mutate("new.png", (s) => s);
      expect(saved.iperfServerAdrs).toBe("10.0.0.7");
      expect(saved.measureSpeed).toBe(true); // derived, as for any old file
      expect(saved.meta?.speedSettingsFrom).toBe("old.png");
    });

    it("an import (replace) does not inherit", async () => {
      await store.mutate("set.png", (s) => ({ ...s, ...speed }));
      const saved = await store.replace("imported.png", {
        floorplanImageName: "imported.png",
      });
      expect(saved.measureSpeed).toBe(false);
      expect(saved.meta?.speedSettingsFrom).toBeUndefined();
    });
  });

  describe("copyFrom", () => {
    async function setUp() {
      await store.mutate("from.png", (s) => ({
        ...s,
        measureSpeed: true,
        iperfServerAdrs: "10.0.0.5",
        testDuration: 9,
        apMapping: [{ apName: "Hall", macAddress: "aabbccddeeff" }],
        radiusDivider: 120,
        maxOpacity: 0.5,
        minOpacity: 0.1,
        blur: 0.5,
        gradient: { 0: "red", 1: "blue" },
        heatmapRanges: { signalStrength: { min: 10, max: 90, enabled: true } },
        dimensions: { width: 1000, height: 800 },
        surveyPoints: [{ ...newPoint(), id: "Point_1" }],
        nextPointNum: 2,
      }));
      return store.replace("to.png", {
        floorplanImageName: "to.png",
        dimensions: { width: 300, height: 200 },
        surveyPoints: [{ ...newPoint(5), id: "Point_7" }],
        nextPointNum: 8,
      });
    }

    it("copies only the parts asked for", async () => {
      const before = await setUp();
      const speed = await store.copyFrom("from.png", "to.png", ["speed"]);
      expect(speed).toMatchObject({
        measureSpeed: true,
        iperfServerAdrs: "10.0.0.5",
        testDuration: 9,
        apMapping: [],
        radiusDivider: null,
        gradient: before.gradient,
      });
      const names = await store.copyFrom("from.png", "to.png", ["apNames"]);
      expect(names.apMapping).toEqual([
        { apName: "Hall", macAddress: "aabbccddeeff" },
      ]);
      expect(names.radiusDivider).toBeNull();
      const look = await store.copyFrom("from.png", "to.png", ["heatmapLook"]);
      expect(look).toMatchObject({
        radiusDivider: 120,
        maxOpacity: 0.5,
        minOpacity: 0.1,
        blur: 0.5,
        gradient: { 0: "red", 1: "blue" },
        heatmapRanges: { signalStrength: { min: 10, max: 90, enabled: true } },
      });
      // never the points, the floor plan or its size
      expect(look.surveyPoints.map((p) => p.id)).toEqual(["Point_7"]);
      expect(look.nextPointNum).toBe(8);
      expect(look.dimensions).toEqual({ width: 300, height: 200 });
      expect(look.floorplanImageName).toBe("to.png");
      expect(onDisk("to.png")).toEqual(JSON.parse(JSON.stringify(look)));
    });

    it("refuses a missing source or the same survey", async () => {
      await setUp();
      await expect(
        store.copyFrom("nope.png", "to.png", ["speed"]),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        store.copyFrom("to.png", "to.png", ["speed"]),
      ).rejects.toMatchObject({ status: 400 });
    });
  });
});
