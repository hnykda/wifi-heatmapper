/**
 * Scans of every access point in range (nearby-networks.ts): what a point
 * stores, the networks a survey heard, and the scanned heat maps.
 */
import { describe, expect, it } from "vitest";
import {
  hasScans,
  ownNetwork,
  scanMapSpecs,
  scannedNetworks,
  scanValue,
  toNearbyNetworks,
} from "@/lib/nearby-networks";
import type { NearbyNetwork, SurveyPoint, WifiResults } from "@/lib/types";
import { getDefaultIperfResults, getDefaultWifiResults } from "@/lib/utils";

const heard = (
  ssid: string,
  bssid: string,
  band: number,
  signalStrength: number,
  channel = band === 2.4 ? 6 : 44,
): NearbyNetwork => ({
  ssid,
  bssid,
  rssi: -100 + signalStrength * 0.6,
  signalStrength,
  channel,
  band,
  channelWidth: 0,
});

const point = (
  id: string,
  nearby?: NearbyNetwork[],
  ssid = "Home",
): SurveyPoint =>
  ({
    id,
    x: 0,
    y: 0,
    timestamp: 1,
    isEnabled: true,
    wifiData: { ...getDefaultWifiResults(), ssid, signalStrength: 50 },
    iperfData: getDefaultIperfResults(),
    ...(nearby ? { nearby } : {}),
  }) as SurveyPoint;

const LIVING_5 = "aa0000000001";
const LIVING_24 = "aa0000000002";
const OFFICE_5 = "aa0000000003";
const NEIGHBOUR = "bb0000000001";
const HIDDEN = "cc0000000001";

const points = [
  point("Point_1", [
    heard("Home", LIVING_5, 5, 90),
    heard("Home", LIVING_24, 2.4, 95),
    heard("Home", OFFICE_5, 5, 30, 149),
    heard("Neighbour", NEIGHBOUR, 2.4, 40),
  ]),
  point("Point_2", [
    heard("Home", LIVING_5, 5, 35),
    heard("Home", OFFICE_5, 5, 85, 149),
    heard("", HIDDEN, 5, 99),
  ]),
  point("Point_3"), // measured before scanning was switched on
  point("Point_4", []), // scanned, heard nothing
];

describe("what a point stores of a scan", () => {
  const wifi = (extra: Partial<WifiResults>): WifiResults => ({
    ...getDefaultWifiResults(),
    ssid: "Home",
    signalStrength: 50,
    rssi: -70,
    channel: 44,
    band: 5,
    txRate: 866,
    ...extra,
  });

  it("keeps one entry per BSSID, the stronger one, strongest first", () => {
    const stored = toNearbyNetworks([
      wifi({ bssid: "AA-00-00-00-00-01", signalStrength: 40 }),
      wifi({ bssid: "aa0000000001", signalStrength: 60 }),
      wifi({ bssid: "aa:00:00:00:00:02", signalStrength: 80 }),
    ]);
    expect(stored.map((n) => [n.bssid, n.signalStrength])).toEqual([
      ["aa0000000002", 80],
      ["aa0000000001", 60],
    ]);
    expect(stored[0]).not.toHaveProperty("txRate");
    expect(stored[0]).not.toHaveProperty("security");
  });

  it("leaves out entries it can't tell apart or that have no signal", () => {
    expect(
      toNearbyNetworks([
        wifi({ bssid: "" }), // macOS without Location access
        wifi({ bssid: "<redacted>" }),
        wifi({ bssid: "aa0000000001", signalStrength: 0 }),
      ]),
    ).toEqual([]);
  });
});

describe("the networks a survey heard", () => {
  const networks = scannedNetworks(points);

  it("groups radios by network, strongest first, unnamed last", () => {
    expect(networks.map((n) => n.ssid)).toEqual(["Home", "Neighbour", ""]);
    expect(
      networks[0].accessPoints.map((ap) => [
        ap.bssid,
        ap.strongest,
        ap.strongestPointId,
        ap.heardAt,
        ap.channels,
      ]),
    ).toEqual([
      [LIVING_24, 95, "Point_1", 1, [6]],
      [LIVING_5, 90, "Point_1", 2, [44]],
      [OFFICE_5, 85, "Point_2", 2, [149]],
    ]);
  });

  it("knows whether there are scans at all", () => {
    expect(hasScans(points)).toBe(true);
    expect(hasScans([point("Point_1")])).toBe(false);
    expect(scannedNetworks([point("Point_1")])).toEqual([]);
  });

  it("starts with the network the survey was connected to", () => {
    expect(ownNetwork(points, networks)).toBe("Home");
    // connected to a network no scan heard: the strongest one instead
    const elsewhere = points.map((p) => ({
      ...p,
      wifiData: { ...p.wifiData, ssid: "Other" },
    }));
    expect(ownNetwork(elsewhere, networks)).toBe("Home");
    expect(ownNetwork([], [])).toBeUndefined();
  });
});

describe("scanned heat maps", () => {
  const home = scannedNetworks(points)[0];

  it("best signal: one map of all the network's access points", () => {
    const [best, ...rest] = scanMapSpecs(home, "best");
    expect(rest).toEqual([]);
    expect(best.label).toBe("Home");
    expect([...best.include].sort()).toEqual([LIVING_5, LIVING_24, OFFICE_5]);
  });

  it("per band: one map per band, lowest band first", () => {
    expect(
      scanMapSpecs(home, "band").map((s) => [s.label, [...s.include].sort()]),
    ).toEqual([
      ["Home, 2.4 GHz", [LIVING_24]],
      ["Home, 5 GHz", [LIVING_5, OFFICE_5]],
    ]);
  });

  it("per access point: radios with the same name are one map", () => {
    const names: Record<string, string> = {
      [LIVING_5]: "Living room",
      [LIVING_24]: "Living room",
    };
    const specs = scanMapSpecs(home, "accessPoint", (bssid) => names[bssid]);
    expect(specs.map((s) => [s.label, [...s.include].sort()])).toEqual([
      ["Living room", [LIVING_5, LIVING_24]],
      ["5 GHz AA-00-00-00-00-03", [OFFICE_5]],
    ]);
    expect(new Set(specs.map((s) => s.id)).size).toBe(specs.length);
  });

  it("has no maps without a network", () => {
    expect(scanMapSpecs(undefined, "best")).toEqual([]);
  });

  it("a point gives the strongest of the included access points", () => {
    const include = new Set([LIVING_5, OFFICE_5]);
    expect(scanValue(points[0], include)).toBe(90);
    expect(scanValue(points[1], include)).toBe(85);
    // scanned and heard none of them: 0, a real "nothing here"
    expect(scanValue(points[3], include)).toBe(0);
    expect(scanValue(points[1], new Set([LIVING_24]))).toBe(0);
    // no scan: left out of the map
    expect(scanValue(points[2], include)).toBeNull();
  });
});
