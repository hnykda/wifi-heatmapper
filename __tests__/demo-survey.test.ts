import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSurveyFile } from "@/lib/schema";
import { DEFAULT_FLOORPLAN } from "@/components/GlobalSettings";

// The demo survey new users open on (assets/surveys, seeded at start)
const file = `assets/surveys/${DEFAULT_FLOORPLAN}.json`;
const raw = JSON.parse(readFileSync(file, "utf-8"));

/** Width and height from a PNG's IHDR chunk. */
function pngSize(path: string) {
  const png = readFileSync(path);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

describe("the bundled demo survey", () => {
  it("loads as a survey of the default floor plan", () => {
    const survey = parseSurveyFile(raw, DEFAULT_FLOORPLAN);
    expect(survey.floorplanImageName).toBe(DEFAULT_FLOORPLAN);
    expect(survey.surveyPoints.length).toBeGreaterThanOrEqual(12);
  });

  it("fits its floor plan image", () => {
    const size = pngSize(`assets/floorplans/${DEFAULT_FLOORPLAN}`);
    expect(raw.dimensions).toEqual(size);
    for (const p of raw.surveyPoints) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(size.width);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(size.height);
    }
  });

  it("measures signal only, so a new survey needs no setup", () => {
    expect(raw.measureSpeed).toBe(false);
    expect(raw.iperfServerAdrs).toBe("");
  });
});
