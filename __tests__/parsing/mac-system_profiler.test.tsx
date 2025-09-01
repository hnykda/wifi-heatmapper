/**
 * Test conversion from `system_profiler -json SPAirPortDeviceType`
 * to WifiResults
 */
import { expect, test } from "vitest";
import fs from "fs";
import path from "path";
import { getCandidateSSIDs } from "../../src/lib/wifiScanner-macos";
import { WifiResults } from "../../src/lib/types";

function checkEachItem(item: WifiResults) {
  // console.log(`checkEachItem: ${JSON.stringify(item)}`);
  expect(item.rssi).not.toBe("");
  expect(item.signalStrength).not.toBe("");
  expect(item.channelWidth).not.toBe("");
  expect(item.ssid).toContain("SSID-");
}

// ========= macOS 10.15.7 ===============

test("Parsing macOS 10.15.7 output", () => {
  const profiler_output = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../data/mac-sp_10.15.7.json"),
      "utf-8",
    ),
  );
  const results = getCandidateSSIDs(profiler_output, "en1", []); // pass empty ignoredSSIDs

  // console.log(`Test routine shows: ${JSON.stringify(results[0], null, 2)}`);

  expect(results.length).toEqual(18);

  expect(results[0]).toStrictEqual({
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
    active: false, // not the one that's in service now
  });

  results.forEach(checkEachItem);
});

// ========= macOS 10.15.7, exclude first ===============

test("Parsing macOS 10.15.7 output - excluding SSID-10", () => {
  const profiler_output = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../data/mac-sp_10.15.7.json"),
      "utf-8",
    ),
  );
  const results = getCandidateSSIDs(profiler_output, "en1", ["SSID-10"]); // ignore SSID-10

  // console.log(`Test routine shows: ${JSON.stringify(results[0], null, 2)}`);

  expect(results.length).toEqual(17);

  expect(results[0]).toStrictEqual({
    ssid: "SSID-5",
    bssid: "fe:dc:ba:09:87:65",
    channel: 11,
    phyMode: "802.11n",
    security: "None",
    rssi: -54,
    signalStrength: 77,
    band: 2.4,
    txRate: 0, // candidates don't give txRate
    channelWidth: 20,
    active: false, // not the one that's in service now
  });

  results.forEach(checkEachItem);
});

// ========= macOS 15.5 ===============
test("Parsing macOS 15.5 output", () => {
  const profiler_output = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../data/mac-sp_15.5.json"), "utf-8"),
  );
  const results = getCandidateSSIDs(profiler_output, "en0", []); // pass empty ignoredSSIDs

  expect(results.length).toEqual(6);

  expect(results[0]).toStrictEqual({
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
    active: false,
  });

  results.forEach(checkEachItem);
});

// ========= macOS 15.5 - wifi disabled ===============
test("Parsing macOS 15.5 output with wifi disabled", () => {
  const profiler_output = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../data/mac-sp_15.5-wifi-disabled.json"),
      "utf-8",
    ),
  );
  const results = getCandidateSSIDs(profiler_output, "en0", []); // pass empty ignoredSSIDs);

  expect(results.length).toEqual(0);

  expect(results[0]).toBeUndefined();
});

// ========= macOS 15.5 - not associated with iPhone, no candidate SSIDs ===============
test("Parsing macOS 15.5 - wifi not associated", () => {
  const profiler_output = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../data/mac-sp_15.5-no-iPhone.json"),
      "utf-8",
    ),
  );
  const results = getCandidateSSIDs(profiler_output, "en0", []); // pass empty ignoredSSIDs);

  expect(results.length).toEqual(0);

  expect(results[0]).toBeUndefined();
});

// ========= macOS 12.7.2 ===============

test("Parsing macOS 12.7.2 output", () => {
  const profiler_output = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../data/mac-sp_12.7.2-AP.json"),
      "utf-8",
    ),
  );
  const results = getCandidateSSIDs(profiler_output, "en0", []); // pass empty ignoredSSIDs);

  expect(results.length).toEqual(4);

  expect(results[0]).toStrictEqual({
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
    active: false,
  });

  results.forEach(checkEachItem);
});
