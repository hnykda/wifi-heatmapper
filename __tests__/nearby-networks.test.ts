import { describe, expect, test } from "vitest";
import {
  isScanOnly,
  nearbyBandsHeard,
  nearbyAccessPoints,
  nearbyMapSpecs,
  accessPointKey,
  nearbyValue,
  networkName,
  strongestNearby,
  toNearbyNetworks,
} from "../src/lib/nearby-networks";
import { getDefaultWifiResults } from "../src/lib/utils";
import { emptyWifiResults } from "../src/lib/survey-defaults";
import { heatmapValue } from "../src/lib/heatmap-grid";
import { mockNearbyNetworks } from "../src/lib/wifiScanner-mock";
import type { NearbyNetwork, SurveyPoint, WifiResults } from "../src/lib/types";

const ap = (
  ssid: string,
  bssid: string,
  band: number,
  signalStrength: number,
): NearbyNetwork => ({
  ssid,
  bssid,
  band,
  signalStrength,
  rssi: -100 + Math.round(signalStrength * 0.6),
  channel: band === 2.4 ? 6 : 44,
  channelWidth: 20,
  security: "",
});

const point = (
  nearby: NearbyNetwork[] | undefined,
  wifiData: WifiResults = {
    ...getDefaultWifiResults(),
    signalStrength: 70,
    rssi: -58,
  },
): SurveyPoint => ({
  id: "Point_1",
  x: 10,
  y: 20,
  wifiData,
  iperfData: {
    tcpDownload: null,
    tcpUpload: null,
    udpDownload: null,
    udpUpload: null,
  },
  timestamp: 0,
  isEnabled: true,
  ...(nearby ? { nearby } : {}),
});

describe("toNearbyNetworks", () => {
  test("one entry per access point, the strongest kept, strongest first", () => {
    const w = (bssid: string, signalStrength: number, ssid = "Home") => ({
      ...getDefaultWifiResults(),
      ssid,
      bssid,
      signalStrength,
      band: 5,
      txRate: 866,
    });
    const nearby = toNearbyNetworks([
      w("a", 40),
      w("b", 70),
      w("a", 55),
      w("", 30, ""), // no BSSID (macOS without Location): kept as is
      w("", 35, ""),
      w("c", 0), // not heard
    ]);
    expect(nearby.map((n) => [n.bssid, n.signalStrength])).toEqual([
      ["b", 70],
      ["a", 55],
      ["", 35],
      ["", 30],
    ]);
    expect(nearby[0]).not.toHaveProperty("txRate");
  });
});

describe("scan-only points", () => {
  test("a point with a scan and no reading of its own", () => {
    const scanOnly = point([ap("Home", "a", 5, 60)], emptyWifiResults());
    expect(isScanOnly(scanOnly)).toBe(true);
    expect(strongestNearby(scanOnly)).toBe(60);
    expect(heatmapValue(scanOnly, "signalStrength", "signalStrength")).toBe(
      null,
    );
  });

  test("a connected point, with or without a scan, is not", () => {
    expect(isScanOnly(point([ap("Home", "a", 5, 60)]))).toBe(false);
    expect(isScanOnly(point(undefined))).toBe(false);
    // an old point that somehow has no reading but no scan either
    expect(isScanOnly(point(undefined, emptyWifiResults()))).toBe(false);
  });
});

describe("nearby reports", () => {
  const points = [
    point([
      ap("Home", "a", 2.4, 80),
      ap("Home", "b", 5, 60),
      ap("Home", "b2", 5, 45), // the same router's second 5 GHz radio
      ap("Neighbour", "aabbccddeeff", 5, 75),
      ap("", "001122334455", 5, 20),
    ]),
    point([ap("Home", "B", 5, 70), ap("Home", "e", 6, 30)]),
    point(undefined),
  ];

  test("the access points on a band, grouped by network, unnamed last", () => {
    const groups = nearbyAccessPoints(points, 5);
    expect(groups.map((g) => [g.ssid, g.strongest])).toEqual([
      ["Neighbour", 75],
      ["Home", 70],
      ["", 20],
    ]);
    // the BSSID's case doesn't matter; strongest of all points, heard twice
    expect(groups[1].accessPoints).toMatchObject([
      { key: "b", strongest: 70, heardAt: 2 },
      { key: "b2", strongest: 45, heardAt: 1 },
    ]);
    expect(nearbyAccessPoints(points, 2.4)).toHaveLength(1);
    expect(networkName("")).toBe("(no name)");
  });

  test("without a BSSID, an access point is its network and channel", () => {
    expect(accessPointKey({ ssid: "Home", bssid: "", channel: 44 })).toBe(
      "Home@44",
    );
  });

  test("the bands heard", () => {
    expect(nearbyBandsHeard(points)).toEqual([2.4, 5, 6]);
    expect(nearbyBandsHeard([point(undefined)])).toEqual([]);
  });

  test("the strongest included access point; 0 if none; null without a scan", () => {
    const all = new Set(["a", "b", "b2", "aabbccddeeff", "001122334455"]);
    expect(nearbyValue(points[0], 5, all)).toBe(75);
    expect(nearbyValue(points[0], 5, new Set(["b", "b2"]))).toBe(60);
    expect(nearbyValue(points[0], 2.4, all)).toBe(80);
    expect(nearbyValue(points[0], 6, all)).toBe(0);
    expect(nearbyValue(points[2], 5, all)).toBeNull();
  });

  const groups = nearbyAccessPoints(points, 5);
  const ids = (specs: ReturnType<typeof nearbyMapSpecs>) =>
    specs.map((m) => [m.id, m.label, [...m.include].sort()]);

  test("one map: every included access point together", () => {
    expect(
      ids(
        nearbyMapSpecs(groups, { hidden: ["aabbccddeeff"], split: "combined" }),
      ),
    ).toEqual([["all", "Home, (no name)", ["001122334455", "b", "b2"]]]);
    expect(
      ids(
        nearbyMapSpecs(groups, {
          hidden: ["b", "b2", "aabbccddeeff", "001122334455"],
          split: "combined",
        }),
      ),
    ).toEqual([["all", "no access points", []]]);
  });

  test("per network", () => {
    expect(
      ids(
        nearbyMapSpecs(groups, { hidden: ["001122334455"], split: "network" }),
      ),
    ).toEqual([
      ["net:Neighbour", "Neighbour", ["aabbccddeeff"]],
      ["net:Home", "Home", ["b", "b2"]],
    ]);
  });

  test("per access point: radios with the same name are one map", () => {
    const named = (bssid: string) =>
      bssid.toLowerCase().startsWith("b") ? "Living room" : undefined;
    expect(
      ids(nearbyMapSpecs(groups, { hidden: [], split: "accessPoint" }, named)),
    ).toEqual([
      ["ap:aabbccddeeff", "Neighbour · AA-BB-CC-DD-EE-FF", ["aabbccddeeff"]],
      ["name:Living room", "Living room", ["b", "b2"]],
      ["ap:001122334455", "(no name) · 00-11-22-33-44-55", ["001122334455"]],
    ]);
  });
});

describe("mock neighbourhood", () => {
  test("hears the demo network on every band, plus neighbours", () => {
    const nearby = toNearbyNetworks(mockNearbyNetworks(70));
    const p = point(nearby);
    expect(nearbyBandsHeard([p])).toEqual([2.4, 5, 6]);
    expect(nearbyAccessPoints([p], 5).map((g) => g.ssid)).toEqual([
      "Demo Network",
      "Neighbour 5G",
      "",
    ]);
    expect(nearbyAccessPoints([p], 5)[0].accessPoints).toHaveLength(2);
  });
});
