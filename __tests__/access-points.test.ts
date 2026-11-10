import { describe, expect, it } from "vitest";
import {
  describeIssues,
  parseSurveyFile,
  settingsPatchSchema,
} from "@/lib/schema";
import {
  ACCESS_POINT_NAME_MAX,
  ACCESS_POINT_NOTE_MAX,
  accessPointName,
  newAccessPoint,
} from "@/lib/access-points";
import { defaultSurvey } from "@/lib/survey-defaults";
import { applySettingsPatch } from "@/lib/survey-ops";

const load = (accessPoints: unknown) =>
  parseSurveyFile({ accessPoints }, "Plan.png").accessPoints;

describe("access point markers in a survey file (lenient)", () => {
  it("a file without them has none", () => {
    expect(parseSurveyFile({}, "Plan.png").accessPoints).toEqual([]);
    expect(load("nope")).toEqual([]);
  });

  it("keeps usable markers, drops ones without an id or position", () => {
    expect(
      load([
        { id: "AP_1", x: 10, y: 20, name: " Hall ", note: " on the shelf " },
        { id: "AP_2", x: 5, y: 6, name: 7, note: "   " },
        { id: "", x: 1, y: 1, name: "no id" },
        { id: "AP_3", x: "far", y: 1, name: "no x" },
        "junk",
      ]),
    ).toEqual([
      { id: "AP_1", x: 10, y: 20, name: "Hall", note: "on the shelf" },
      { id: "AP_2", x: 5, y: 6, name: "" },
    ]);
  });

  it("cuts a long name and note", () => {
    const [ap] = load([
      {
        id: "AP_1",
        x: 0,
        y: 0,
        name: "x".repeat(100),
        note: "y".repeat(1000),
      },
    ]);
    expect(ap.name).toHaveLength(ACCESS_POINT_NAME_MAX);
    expect(ap.note).toHaveLength(ACCESS_POINT_NOTE_MAX);
  });
});

describe("access point markers in PATCH /api/settings (strict)", () => {
  it("replaces the whole list, trimmed, an empty note left out", () => {
    const patch = settingsPatchSchema.parse({
      accessPoints: [
        { id: "AP_1", x: 1, y: 2, name: " Router ", note: "" },
        { id: "AP_2", x: 3, y: 4, name: "Upstairs", note: " ceiling " },
      ],
    });
    expect(patch.accessPoints).toEqual([
      { id: "AP_1", x: 1, y: 2, name: "Router" },
      { id: "AP_2", x: 3, y: 4, name: "Upstairs", note: "ceiling" },
    ]);
    const survey = {
      ...defaultSurvey("Plan.png"),
      accessPoints: [{ id: "AP_9", x: 0, y: 0, name: "Old" }],
    };
    expect(applySettingsPatch(survey, patch).accessPoints).toEqual(
      patch.accessPoints,
    );
    expect(
      settingsPatchSchema.parse({ accessPoints: [] }).accessPoints,
    ).toEqual([]);
  });

  it("refuses bad markers", () => {
    const problem = (accessPoints: unknown) => {
      const parsed = settingsPatchSchema.safeParse({ accessPoints });
      return parsed.success ? null : describeIssues(parsed.error);
    };
    expect(problem([{ id: "AP_1", x: 1, y: 2 }])).toMatch(/name/);
    expect(problem([{ id: "", x: 1, y: 2, name: "a" }])).toMatch(/id/);
    expect(
      problem([{ id: "AP_1", x: 1, y: 2, name: "a", bssid: "aa" }]),
    ).toMatch(/unknown bssid/);
    expect(
      problem([
        { id: "AP_1", x: 1, y: 2, name: "a" },
        { id: "AP_1", x: 3, y: 4, name: "b" },
      ]),
    ).toBe('accessPoints.1.id: "AP_1" is used twice');
    expect(
      problem([
        { id: "AP_1", x: 1, y: 2, name: "x".repeat(ACCESS_POINT_NAME_MAX + 1) },
      ]),
    ).toBe("accessPoints.0.name: a name is at most 60 characters");
  });
});

describe("newAccessPoint()", () => {
  it("takes the first free id and a rounded position", () => {
    const first = newAccessPoint([], 10.4, 20.6);
    expect(first).toEqual({ id: "AP_1", x: 10, y: 21, name: "Access point" });
    const others = [
      { id: "AP_1", x: 0, y: 0, name: "" },
      { id: "AP_3", x: 0, y: 0, name: "" },
    ];
    expect(newAccessPoint(others, 0, 0)).toMatchObject({
      id: "AP_2",
      name: "Access point 2",
    });
  });

  it("names a marker without a name 'Access point'", () => {
    expect(accessPointName({ name: " " })).toBe("Access point");
    expect(accessPointName({ name: "Hall" })).toBe("Hall");
  });
});
