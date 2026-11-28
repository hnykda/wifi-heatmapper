/**
 * What the MCP server says about scans of every access point in range
 * (scanNearby): get_survey's summary and points, the scanned-signal grid's
 * choice of access points, and wait_for_measurement's additions.
 */
import { describe, expect, it } from "vitest";
import {
  describePoint,
  describeScannedAccessPoints,
  selectScan,
} from "@/mcp/survey";
import { describeScan, measurementSettings } from "@/mcp/measure";
import {
  pickSafeSettings,
  SAFE_SETTING_KEYS,
  toSettingsPatch,
  validateSettingsPatch,
} from "@/mcp/settings-allowlist";
import type { StoredSurvey } from "@/mcp/app-client";
import { getDefaultIperfResults, getDefaultWifiResults } from "@/lib/utils";
import type {
  MeasurementJobStatus,
  NearbyNetwork,
  SurveyPoint,
} from "@/lib/types";

const heard = (
  ssid: string,
  bssid: string,
  signalStrength: number,
  band = 5,
  channel = 36,
): NearbyNetwork => ({
  ssid,
  bssid,
  signalStrength,
  rssi: -100 + signalStrength * 0.6,
  channel,
  band,
  channelWidth: band === 2.4 ? 20 : 80,
});

function point(
  id: string,
  nearby?: NearbyNetwork[],
  opts: { enabled?: boolean; ssid?: string } = {},
): SurveyPoint {
  return {
    id,
    x: 10,
    y: 20,
    isEnabled: opts.enabled ?? true,
    timestamp: 0,
    wifiData: {
      ...getDefaultWifiResults(),
      ssid: opts.ssid ?? "Home",
      bssid: "aabbccddee01",
      signalStrength: 40,
    },
    iperfData: getDefaultIperfResults(),
    ...(nearby ? { nearby } : {}),
  };
}

const LIVING_5 = "aabbccddee01";
const LIVING_24 = "aabbccddee02";
const OFFICE_5 = "112233445501";
const NEIGHBOUR = "ffeeddccbb01";
const HIDDEN = "ffeeddccbb02";

const mapping = [
  { apName: "Living room", macAddress: "aabbccddee*" },
  { apName: "Office", macAddress: OFFICE_5 },
];

const points: SurveyPoint[] = [
  point("Point_1", [
    heard("Home", LIVING_5, 90),
    heard("Home", LIVING_24, 80, 2.4, 6),
    heard("Home", OFFICE_5, 30, 5, 100),
    heard("Next door", NEIGHBOUR, 95, 2.4, 1),
  ]),
  point("Point_2", [
    heard("Home", OFFICE_5, 85, 5, 100),
    heard("Home", LIVING_24, 35, 2.4, 6),
    heard("", HIDDEN, 20, 5, 149),
  ]),
  point("Point_3"), // measured without a scan
  point("Point_4", []), // scanned, heard nothing
];

describe("settings allow-list: scanNearby", () => {
  it("is read, with false for files without it, and can be changed", () => {
    expect(SAFE_SETTING_KEYS).toContain("scanNearby");
    expect(pickSafeSettings({}).scanNearby).toBe(false);
    expect(pickSafeSettings({ scanNearby: true }).scanNearby).toBe(true);
    expect(toSettingsPatch({ scanNearby: true })).toEqual({ scanNearby: true });
    expect(validateSettingsPatch({ scanNearby: "yes" } as never)).toEqual([
      "scanNearby must be true or false.",
    ]);
  });

  it("goes to the measurement the agent starts", () => {
    const on = { scanNearby: true } as unknown as StoredSurvey;
    expect(measurementSettings(on).scanNearby).toBe(true);
    expect(measurementSettings({} as StoredSurvey).scanNearby).toBe(false);
  });
});

describe("describePoint with scans", () => {
  it("counts the access points in range, null without a scan", () => {
    const [p1, , p3, p4] = points.map((p) => describePoint(p, mapping));
    expect(p1.accessPointsInRange).toBe(4);
    expect(p3.accessPointsInRange).toBeNull();
    expect(p4.accessPointsInRange).toBe(0);
    expect(p1).not.toHaveProperty("scan");
  });

  it("adds the full scan only when asked, strongest first", () => {
    const p1 = describePoint(points[0], mapping, { includeScans: true });
    expect(p1.scan?.map((s) => s.bssid)).toEqual([
      NEIGHBOUR,
      LIVING_5,
      LIVING_24,
      OFFICE_5,
    ]);
    expect(p1.scan?.[1]).toEqual({
      ssid: "Home",
      bssid: LIVING_5,
      apName: "Living room",
      signalPercent: 90,
      rssiDbm: -46,
      channel: 36,
      bandGHz: 5,
      channelWidthMHz: 80,
    });
    expect(
      describePoint(points[2], mapping, { includeScans: true }),
    ).not.toHaveProperty("scan");
  });
});

describe("describeScannedAccessPoints", () => {
  it("lists every radio heard: own network first, then strongest", () => {
    const aps = describeScannedAccessPoints(points, mapping);
    expect(aps.map((a) => [a.bssid, a.own])).toEqual([
      [LIVING_5, true],
      [OFFICE_5, true],
      [LIVING_24, true],
      [NEIGHBOUR, false],
      [HIDDEN, false],
    ]);
    expect(aps[1]).toEqual({
      bssid: OFFICE_5,
      ssid: "Home",
      apName: "Office",
      bandGHz: 5,
      channels: [100],
      pointsHeard: 2,
      strongestSignalPercent: 85,
      strongestAtPointId: "Point_2",
      own: true,
    });
    expect(aps[3]).toMatchObject({ ssid: "Next door", apName: null });
  });

  it("is empty without scans", () => {
    expect(describeScannedAccessPoints([point("Point_1")], mapping)).toEqual(
      [],
    );
  });
});

describe("selectScan", () => {
  const pick = (wanted?: { network?: string; scan?: string }) => {
    const s = selectScan(points, mapping, wanted);
    return { ...s, include: [...s.include].sort() };
  };

  it("defaults to the best of the person's own network", () => {
    expect(pick()).toEqual({
      network: "Home",
      label: "Home",
      include: [OFFICE_5, LIVING_5, LIVING_24].sort(),
    });
    expect(pick({ scan: "best" })).toEqual(pick());
  });

  it("takes a band, with or without GHz", () => {
    expect(pick({ scan: "2.4" })).toEqual({
      network: "Home",
      label: "Home, 2.4 GHz",
      include: [LIVING_24],
    });
    expect(pick({ scan: "5 GHz" }).include).toEqual(
      [OFFICE_5, LIVING_5].sort(),
    );
  });

  it("takes an access point name (all its radios) or one BSSID", () => {
    expect(pick({ scan: "living room" })).toEqual({
      network: "Home",
      label: "Living room",
      include: [LIVING_5, LIVING_24],
    });
    expect(pick({ scan: "AA-BB-CC-DD-EE-02" })).toMatchObject({
      network: "Home",
      include: [LIVING_24],
    });
  });

  it("takes another network, by name or by one of its BSSIDs", () => {
    expect(pick({ network: "Next door" })).toEqual({
      network: "Next door",
      label: "Next door",
      include: [NEIGHBOUR],
    });
    expect(pick({ network: "(no name)" }).include).toEqual([HIDDEN]);
    expect(pick({ scan: NEIGHBOUR }).network).toBe("Next door");
  });

  it("says what is available when nothing matches", () => {
    expect(() => selectScan(points, mapping, { network: "Nope" })).toThrow(
      /No scan heard a network "Nope"\. Networks the scans heard: "Home", "Next door", "\(no name\)"/,
    );
    expect(() => selectScan(points, mapping, { scan: "6" })).toThrow(
      /matches scan "6".*a band \("2\.4", "5"\).*"Living room", "Office".*aabbccddee01/,
    );
    // a BSSID of another network is not looked up when the network is named
    expect(() =>
      selectScan(points, mapping, { network: "Home", scan: NEIGHBOUR }),
    ).toThrow(/Nothing in the scans of "Home"/);
  });

  it("says how to get scans when the survey has none", () => {
    expect(() => selectScan([point("Point_1")], mapping)).toThrow(
      /no scans.*scanNearby/,
    );
  });
});

describe("describeScan (wait_for_measurement)", () => {
  const job = (fields?: Record<string, string>) =>
    ({
      progress: fields
        ? { type: "done", header: "", status: "", fields }
        : null,
    }) as unknown as MeasurementJobStatus;

  it("gives the count and the three strongest", () => {
    expect(describeScan(points[0], job(), mapping)).toEqual({
      accessPointsInRange: 4,
      strongestAccessPoints: [
        { ssid: "Next door", apName: null, bandGHz: 2.4, signalPercent: 95 },
        { ssid: "Home", apName: "Living room", bandGHz: 5, signalPercent: 90 },
        {
          ssid: "Home",
          apName: "Living room",
          bandGHz: 2.4,
          signalPercent: 80,
        },
      ],
    });
  });

  it("says why a scan failed, and nothing when the survey doesn't scan", () => {
    expect(
      describeScan(
        points[2],
        job({ nearby: "Failed", nearbyNote: "The scan found no networks." }),
        mapping,
      ),
    ).toEqual({ scanFailed: "The scan found no networks." });
    expect(describeScan(points[2], job({ strength: "40%" }), mapping)).toEqual(
      {},
    );
    expect(describeScan(undefined, job(), mapping)).toEqual({});
  });
});
