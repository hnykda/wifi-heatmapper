import { describe, expect, test } from "vitest";
import fs from "fs";
import path from "path";
import {
  parseHelperDocument,
  parseHelperInfo,
  parseHelperLocation,
  parseHelperScan,
} from "../../src/lib/macos-helper-parse";

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, "../data", name), "utf-8");

describe("macOS Wi-Fi helper: info", () => {
  test("macOS 27 without Location permission: readings, no SSID/BSSID", () => {
    const info = parseHelperInfo(
      fixture("mac-helper-info-27-no-location.json"),
    );
    expect(info.locationAuthorized).toBe(false);
    expect(info.locationStatus).toBe("notDetermined");
    expect(info.associated).toBe(true);
    expect(info.interfaceName).toBe("en0");
    expect(info.noise).toBe(-78);
    expect(info.wifi).toStrictEqual({
      ssid: "",
      bssid: "",
      rssi: -60,
      signalStrength: 67,
      channel: 44,
      band: 5,
      channelWidth: 80,
      txRate: 816,
      phyMode: "802.11ax",
      security: "WPA2 Personal",
      currentSSID: true,
      strongestSSID: null,
    });
  });

  test("with Location permission: SSID and normalized BSSID", () => {
    const info = parseHelperInfo(fixture("mac-helper-info-authorized.json"));
    expect(info.locationAuthorized).toBe(true);
    expect(info.locationStatus).toBe("authorized");
    expect(info.wifi.ssid).toBe("Demo Network");
    expect(info.wifi.bssid).toBe("9e05d696e830");
  });

  test("Wi-Fi turned off: not associated, zero readings", () => {
    const info = parseHelperInfo(fixture("mac-helper-info-wifi-off.json"));
    expect(info.associated).toBe(false);
    expect(info.locationStatus).toBe("denied");
    expect(info.noise).toBeNull();
    expect(info.wifi.rssi).toBe(0);
    expect(info.wifi.signalStrength).toBe(0);
    expect(info.wifi.channel).toBe(0);
    expect(info.wifi.band).toBe(0);
    expect(info.wifi.phyMode).toBe("");
  });

  test("accepts an already-parsed object", () => {
    const obj = JSON.parse(fixture("mac-helper-info-authorized.json"));
    expect(parseHelperInfo(obj).wifi.ssid).toBe("Demo Network");
  });

  test("missing interface is an error", () => {
    expect(() => parseHelperInfo({ locationAuthorized: false })).toThrow(
      /did not report a Wi-Fi interface/,
    );
  });
});

describe("macOS Wi-Fi helper: scan", () => {
  test("without Location permission the joined network is matched by channel and RSSI", () => {
    const scan = parseHelperScan(
      fixture("mac-helper-scan-27-no-location.json"),
    );
    expect(scan.locationAuthorized).toBe(false);
    expect(scan.networks).toHaveLength(2);
    const [first, second] = scan.networks;
    // the -58 dBm scan entry on channel 44 is the joined network (-59 dBm)
    expect(first.currentSSID).toBe(true);
    expect(first.rssi).toBe(-59);
    expect(first.txRate).toBe(864);
    expect(first.ssid).toBe("");
    expect(second).toMatchObject({
      currentSSID: false,
      channel: 3,
      band: 2.4,
      channelWidth: 40,
      rssi: -75,
      security: "WPA3 Transition",
    });
  });

  test("with Location permission the joined network is matched by BSSID", () => {
    const scan = parseHelperScan(fixture("mac-helper-scan-authorized.json"));
    expect(scan.networks.map((n) => [n.ssid, n.bssid, n.currentSSID])).toEqual([
      ["Demo Network", "9e05d696e82f", false], // -48 dBm, 2.4 GHz
      ["Demo Network", "9e05d696e830", true], // -59 dBm (interface reading)
      ["Neighbour", "aabbcc001122", false], // -81 dBm, 6 GHz
    ]);
    expect(scan.networks[2].band).toBe(6);
    expect(scan.networks[2].channelWidth).toBe(160);
  });

  test("joined network missing from the scan is added", () => {
    const doc = JSON.parse(fixture("mac-helper-scan-authorized.json"));
    doc.networks = doc.networks.filter(
      (n: { bssid: string }) => n.bssid !== "9e:05:d6:96:e8:30",
    );
    const scan = parseHelperScan(doc);
    expect(scan.networks).toHaveLength(3);
    expect(scan.networks.filter((n) => n.currentSSID)).toHaveLength(1);
  });

  test("Wi-Fi off: no current network", () => {
    const doc = JSON.parse(fixture("mac-helper-info-wifi-off.json"));
    doc.networks = [];
    expect(parseHelperScan(doc).networks).toEqual([]);
  });
});

describe("macOS Wi-Fi helper: errors and status", () => {
  test("helper error is thrown with its message", () => {
    expect(() =>
      parseHelperDocument(fixture("mac-helper-usage-error.json")),
    ).toThrow(/Wi-Fi helper: usage/);
  });

  test("non-JSON output is an error", () => {
    expect(() => parseHelperDocument("dyld: Library not loaded")).toThrow(
      /not JSON/,
    );
    expect(() => parseHelperDocument("[]")).toThrow(/unexpected/);
  });

  test("status documents", () => {
    expect(
      parseHelperLocation({
        locationAuthorized: false,
        locationStatus: "denied",
        locationServicesEnabled: false,
      }),
    ).toEqual({
      locationAuthorized: false,
      locationStatus: "denied",
      locationServicesEnabled: false,
    });
    expect(parseHelperLocation({})).toEqual({
      locationAuthorized: false,
      locationStatus: "unknown",
      locationServicesEnabled: true,
    });
  });
});
