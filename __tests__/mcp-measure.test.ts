import { describe, expect, it } from "vitest";
import {
  pastPreflight,
  plainResult,
  positionProblem,
  SUDO_NEEDED,
  SUDO_WRONG,
  sudoProblem,
} from "@/mcp/measure";
import type { MeasurementJobStatus } from "@/lib/types";
import type { PointRecord } from "@/mcp/survey";

describe("sudoProblem", () => {
  it.each([
    [
      "Please set sudo password. It is required on macOS unless you build the Wi-Fi helper (npm run build:macos-helper).",
      SUDO_NEEDED,
    ],
    [
      "Please set sudo password. The app's Wi-Fi helper did not work, so macOS needs it.",
      SUDO_NEEDED,
    ],
    [
      "Cannot read Wi-Fi link information. Check Wi-Fi permissions or set the sudo password, then try again.",
      SUDO_NEEDED,
    ],
    ["Please enter a valid sudo password.", SUDO_WRONG],
  ])("%s", (error, expected) => {
    expect(sudoProblem(error)).toBe(expected);
  });

  it("leaves other errors alone", () => {
    expect(sudoProblem("No connected Wi-Fi interface found.")).toBeNull();
    expect(sudoProblem(undefined)).toBeNull();
  });
});

describe("positionProblem", () => {
  const plan = { width: 800, height: 500 };
  it("accepts spots on the plan, edges included", () => {
    for (const [x, y] of [
      [0, 0],
      [800, 500],
      [400, 250],
    ]) {
      expect(positionProblem(x, y, plan)).toBeNull();
    }
  });
  it("refuses spots off the plan, and an unknown size", () => {
    expect(positionProblem(801, 10, plan)).toMatch(/outside the floor plan/);
    expect(positionProblem(10, -1, plan)).toMatch(/800 x 500/);
    expect(positionProblem(1, 1, undefined)).toMatch(/size is not known/);
  });
});

describe("pastPreflight", () => {
  const job = (header: string | null) =>
    ({
      progress: header === null ? null : { type: "update", header, status: "" },
    }) as MeasurementJobStatus;
  it("waits while the job says Starting", () => {
    expect(pastPreflight(job(null))).toBe(false);
    expect(pastPreflight(job("Starting"))).toBe(false);
    expect(pastPreflight(job("Measurement beginning"))).toBe(true);
  });
});

describe("plainResult", () => {
  const point = {
    signalPercent: 63,
    rssiDbm: -62,
    apName: null,
    ssid: "Home",
    channel: 44,
    bandGHz: 5,
    tcpDownload: { mbps: 357.2 },
    tcpUpload: null,
  } as unknown as PointRecord;
  it("says signal and speed in one line", () => {
    expect(plainResult(point)).toBe(
      "Signal 63% (-62 dBm) from Home, channel 44 (5 GHz); download 357.2 Mbps, upload not measured.",
    );
    expect(plainResult({ ...point, apName: "Hall", tcpDownload: null })).toBe(
      "Signal 63% (-62 dBm) from Hall, channel 44 (5 GHz).",
    );
  });
});
