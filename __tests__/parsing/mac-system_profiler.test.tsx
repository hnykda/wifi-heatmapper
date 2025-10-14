/**
 * Test conversion from `system_profiler -json SPAirPortDeviceType`
 * to WifiResults
 */
import { expect, test } from "vitest";
import fs from "fs";
import path from "path";
import {
  getNeighborSSIDs,
  getCurrentSSID,
  mergeSSIDs,
} from "../../src/lib/wifiScanner-macos";
import { WifiResults } from "../../src/lib/types";

function checkEachItem(item: WifiResults) {
  // console.log(`checkEachItem: ${JSON.stringify(item)}`);
  expect(item.rssi).not.toBe("");
  expect(item.signalStrength).not.toBe("");
  expect(item.channelWidth).not.toBe("");
  expect(item.ssid).toContain("SSID-");
}

// ========= macOS 10.15.7 ===============
// Current (SSID-6) -55dBm & Neighbor -59dBm should be merged
test("Parsing macOS 10.15.7 output", () => {
  const profiler_output = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../data/mac-sp_10.15.7.json"),
      "utf-8",
    ),
  );
  const neighbors = getNeighborSSIDs(profiler_output, "en1"); // pass empty ignoredSSIDs
  expect(neighbors.length).toEqual(17);
  const current = getCurrentSSID(profiler_output, "en1");
  expect(current.length).toEqual(1);

  neighbors.forEach(checkEachItem);
  current.forEach(checkEachItem);

  expect(neighbors[0]).toStrictEqual({
    ssid: "SSID-10",
    bssid: "fe:dc:ba:09:87:65",
    channel: 44,
    phyMode: "802.11n",
    security: "None",
    rssi: -51,
    signalStrength: 82,
    band: 5,
    txRate: 0, // candidates don't give txRate
    channelWidth: 20,
    currentSSID: false,
    strongestSSID: null,
  });

  expect(current[0]).toStrictEqual({
    ssid: "SSID-6",
    bssid: "fe:dc:ba:09:87:65",
    channel: 6,
    phyMode: "802.11n",
    security: "None",
    rssi: -55,
    signalStrength: 75,
    band: 2.4,
    txRate: 145, // candidates don't give txRate
    channelWidth: 20,
    currentSSID: true,
    strongestSSID: null,
  });

  const result = mergeSSIDs(neighbors, current);
  expect(result).toStrictEqual({ added: false, index: 3 });
  expect(neighbors.length).toEqual(17);
});

// ========= macOS 15.5 ===============
test("Parsing macOS 15.5 output", () => {
  const profiler_output = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../data/mac-sp_15.5.json"), "utf-8"),
  );
  const neighbors = getNeighborSSIDs(profiler_output, "en0"); // pass empty ignoredSSIDs
  expect(neighbors.length).toEqual(5);
  const current = getCurrentSSID(profiler_output, "en0");
  expect(current.length).toEqual(1);

  expect(neighbors[0]).toStrictEqual({
    band: 2.4,
    bssid: "",
    channel: 6,
    channelWidth: 20,
    phyMode: "802.11g/n",
    rssi: -39,
    security: "None",
    signalStrength: 100,
    ssid: "SSID-2",
    txRate: 0,
    currentSSID: false,
    strongestSSID: null,
  });

  expect(current[0]).toStrictEqual({
    ssid: "SSID-2",
    bssid: "",
    channel: 6,
    phyMode: "802.11n",
    security: "None",
    rssi: -40,
    signalStrength: 100,
    band: 2.4,
    txRate: 144, // candidates don't give txRate
    channelWidth: 20,
    currentSSID: true,
    strongestSSID: null,
  });

  neighbors.forEach(checkEachItem);
  current.forEach(checkEachItem);
  const result = mergeSSIDs(neighbors, current);
  expect(result).toStrictEqual({ added: false, index: 0 });
  expect(neighbors.length).toEqual(5);
});

// ========= macOS 15.5 - wifi disabled ===============
test("Parsing macOS 15.5 output with wifi disabled", () => {
  const profiler_output = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../data/mac-sp_15.5-wifi-disabled.json"),
      "utf-8",
    ),
  );
  const neighbors = getNeighborSSIDs(profiler_output, "en0"); // pass empty ignoredSSIDs);
  expect(neighbors.length).toEqual(0);
  const current = getCurrentSSID(profiler_output, "en0");
  expect(current.length).toEqual(0);
  const result = mergeSSIDs(neighbors, current);
  expect(result).toStrictEqual({ added: false, index: -1 });
  expect(neighbors[0]).toBeUndefined();
});

// ========= macOS 15.5 - not associated with iPhone, no candidate SSIDs ===============
test("Parsing macOS 15.5 - wifi not associated", () => {
  const profiler_output = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../data/mac-sp_15.5-no-iPhone.json"),
      "utf-8",
    ),
  );
  const neighbors = getNeighborSSIDs(profiler_output, "en0"); // pass empty ignoredSSIDs);
  expect(neighbors.length).toEqual(0);
  const current = getCurrentSSID(profiler_output, "en0");
  expect(current.length).toEqual(0);
  const result = mergeSSIDs(neighbors, current);
  expect(result).toStrictEqual({ added: false, index: -1 });

  expect(neighbors[0]).toBeUndefined();
});

// ========= macOS 12.7.2 ===============

test("Parsing macOS 12.7.2 output", () => {
  const profiler_output = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../data/mac-sp_12.7.2-AP.json"),
      "utf-8",
    ),
  );
  const neighbors = getNeighborSSIDs(profiler_output, "en0"); // pass empty ignoredSSIDs);
  expect(neighbors.length).toEqual(3);
  const current = getCurrentSSID(profiler_output, "en0");
  expect(current.length).toEqual(1);

  expect(neighbors[0]).toStrictEqual({
    ssid: "SSID-3",
    bssid: "",
    channel: 149,
    phyMode: "802.11",
    security: "WPA2 Personal",
    rssi: -67,
    signalStrength: 55,
    band: 5,
    txRate: 0, // candidates don't give txRate
    channelWidth: 20,
    currentSSID: false,
    strongestSSID: null,
  });

  expect(current[0]).toStrictEqual({
    ssid: "SSID-4",
    bssid: "",
    channel: 149,
    phyMode: "802.11ax",
    security: "WPA2 Personal",
    rssi: -68,
    signalStrength: 53,
    band: 5,
    txRate: 324, // candidates don't give txRate
    channelWidth: 20,
    currentSSID: true,
    strongestSSID: null,
  });
  neighbors.forEach(checkEachItem);

  const result = mergeSSIDs(neighbors, current);
  expect(result).toStrictEqual({ added: true, index: 3 });
  expect(neighbors.length).toEqual(4);
});
