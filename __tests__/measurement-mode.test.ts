import { describe, expect, it } from "vitest";
import {
  formatServerAddress,
  hasSpeedData,
  measuresSpeed,
  migrateMeasurementMode,
  parseServerAddress,
} from "../src/lib/measurement-mode";
import { getDefaultIperfResults } from "../src/lib/utils";
import { parseSurveyFile, settingsPatchSchema } from "../src/lib/schema";
import { applySettingsPatch } from "../src/lib/survey-ops";
import { defaultSurvey } from "../src/lib/survey-defaults";

describe("parseServerAddress", () => {
  it.each([
    ["192.168.1.10", { host: "192.168.1.10", port: null }],
    ["192.168.1.10:5201", { host: "192.168.1.10", port: 5201 }],
    [" nas.local:5300 ", { host: "nas.local", port: 5300 }],
    ["nas.local", { host: "nas.local", port: null }],
    ["[fe80::1]:5202", { host: "fe80::1", port: 5202 }],
    ["[::1]", { host: "::1", port: null }],
    ["fe80::1", { host: "fe80::1", port: null }],
    ["fe80::1%en0", { host: "fe80::1%en0", port: null }],
    ["2001:db8::42", { host: "2001:db8::42", port: null }],
    ["::ffff:192.0.2.1", { host: "::ffff:192.0.2.1", port: null }],
    ["[::1]:5201", { host: "::1", port: 5201 }],
    ["1:2:3:4:5:6:7:8", { host: "1:2:3:4:5:6:7:8", port: null }],
    ["localhost", { host: "localhost", port: null }],
    ["nas", { host: "nas", port: null }],
    ["my-nas.home.arpa.", { host: "my-nas.home.arpa.", port: null }],
    ["10.0.0.2:65535", { host: "10.0.0.2", port: 65535 }],
    ["0.0.0.0", { host: "0.0.0.0", port: null }],
  ])("%s", (address, expected) => {
    expect(parseServerAddress(address)).toEqual(expected);
  });

  it.each([
    "",
    "   ",
    "host:",
    ":5201",
    "host:0",
    "host:70000",
    "host:abc",
    "[fe80::1",
    "fe80::1]",
    "[fe80::1]:x",
    "[fe80::1]5201",
    // not a host name, IPv4 or IPv6 address
    "x; touch /tmp/pwned",
    "x;touch",
    "$(reboot)",
    "`id`",
    "a b",
    "host name:5201",
    "-c",
    "--help",
    "nas.local -R",
    "host_name",
    "-nas.local",
    "nas-.local",
    "nas..local",
    ".nas",
    "a".repeat(64) + ".local",
    "999.1.1.1",
    "1.2.3",
    "1.2.3.4.5",
    "01.2.3.4",
    "1.2.3.4:5201:1",
    "fe80::1::2",
    "fe80::g",
    "12345::1",
    "1:2:3:4:5:6:7:8:9",
    "1:2:3:4:5:6:7",
    "fe80::1%",
    "fe80::1%en0;id",
    "[nas.local]:5201",
    "[]",
    "http://nas.local",
    "nas.local/",
  ])("rejects %j", (address) => {
    expect(parseServerAddress(address)).toBeNull();
  });

  it("formats with brackets around IPv6 and the default port", () => {
    expect(formatServerAddress({ host: "fe80::1", port: 5202 })).toBe(
      "[fe80::1]:5202",
    );
    expect(formatServerAddress({ host: "nas.local", port: null })).toBe(
      "nas.local:5201",
    );
  });
});

describe("migrateMeasurementMode", () => {
  it.each([
    ["localhost", false],
    ["LOCALHOST", false],
    ["", false],
    ["  ", false],
    [undefined, false],
    ["192.168.1.10", true],
    ["nas.local:5201", true],
  ])("server %j -> measureSpeed %s", (iperfServerAdrs, measureSpeed) => {
    expect(migrateMeasurementMode({ iperfServerAdrs })).toEqual({
      iperfServerAdrs,
      measureSpeed,
    });
  });

  it("keeps an explicit choice and doesn't modify its input", () => {
    const explicit = { iperfServerAdrs: "localhost", measureSpeed: true };
    expect(migrateMeasurementMode(explicit)).toBe(explicit);
    const old = { iperfServerAdrs: "10.0.0.2" };
    migrateMeasurementMode(old);
    expect(old).toEqual({ iperfServerAdrs: "10.0.0.2" });
  });

  it("measuresSpeed() falls back to the server for settings without the field", () => {
    expect(measuresSpeed({ iperfServerAdrs: "localhost" })).toBe(false);
    expect(measuresSpeed({ iperfServerAdrs: "10.0.0.2" })).toBe(true);
    expect(
      measuresSpeed({ iperfServerAdrs: "10.0.0.2", measureSpeed: false }),
    ).toBe(false);
  });

  it("is applied when a survey file is loaded", () => {
    // an old file with a real server measures speed
    expect(
      parseSurveyFile({ iperfServerAdrs: "10.0.0.2" }, "a.png").measureSpeed,
    ).toBe(true);
    // an old file with localhost (the old "signal only") or no server
    expect(
      parseSurveyFile({ iperfServerAdrs: "localhost" }, "a.png").measureSpeed,
    ).toBe(false);
    expect(parseSurveyFile({ iperfServerAdrs: "" }, "a.png").measureSpeed).toBe(
      false,
    );
    expect(parseSurveyFile({}, "a.png").measureSpeed).toBe(false);
    // a damaged server address counts as none
    expect(parseSurveyFile({ iperfServerAdrs: 42 }, "a.png").measureSpeed).toBe(
      false,
    );
    // an explicit choice is kept, whatever the server
    expect(
      parseSurveyFile(
        { iperfServerAdrs: "localhost", measureSpeed: true },
        "a.png",
      ).measureSpeed,
    ).toBe(true);
    expect(
      parseSurveyFile(
        { iperfServerAdrs: "10.0.0.2", measureSpeed: false },
        "a.png",
      ).measureSpeed,
    ).toBe(false);
    // a damaged value falls back to the server rule
    expect(
      parseSurveyFile(
        { iperfServerAdrs: "10.0.0.2", measureSpeed: "yes" },
        "a.png",
      ).measureSpeed,
    ).toBe(true);
  });

  it("new surveys measure signal only, with no server", () => {
    const survey = defaultSurvey("a.png");
    expect(survey.measureSpeed).toBe(false);
    expect(survey.iperfServerAdrs).toBe("");
  });
});

describe("measureSpeed in PATCH /api/settings", () => {
  it("is accepted as a boolean and applied", () => {
    const patch = settingsPatchSchema.parse({ measureSpeed: true });
    expect(patch).toEqual({ measureSpeed: true });
    const survey = parseSurveyFile({}, "a.png");
    expect(applySettingsPatch(survey, patch).measureSpeed).toBe(true);
    expect(
      applySettingsPatch(survey, { measureSpeed: false }).measureSpeed,
    ).toBe(false);
  });

  it("refuses anything else", () => {
    expect(settingsPatchSchema.safeParse({ measureSpeed: "yes" }).success).toBe(
      false,
    );
    expect(settingsPatchSchema.safeParse({ measureSpeed: null }).success).toBe(
      false,
    );
  });
});

describe("hasSpeedData", () => {
  it("is false for the zeros stored when speed was not measured", () => {
    expect(hasSpeedData({ iperfData: getDefaultIperfResults() })).toBe(false);
  });

  it("is true when any test ran", () => {
    const iperfData = getDefaultIperfResults();
    iperfData.udpUpload = { ...iperfData.udpUpload, bitsPerSecond: 1e6 };
    expect(hasSpeedData({ iperfData })).toBe(true);
  });
});
