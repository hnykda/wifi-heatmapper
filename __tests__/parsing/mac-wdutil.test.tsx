import { expect, test } from "vitest";
import fs from "fs";
import path from "path";
import { parseWdutilOutput } from "../../src/lib/wifiScanner-macos";

// ============================

test("parsing macOS 15 (Sequoia) 5GHz wdutil output", () => {
  const input = fs.readFileSync(
    path.join(__dirname, "../data/macOS15-wdutil-5GHz-en.txt"),
    "utf-8",
  );
  const output = parseWdutilOutput(input);
  expect(output).toStrictEqual({
    bssid: "<redacted>",
    channel: 44,
    channelWidth: 40,
    band: 5,
    phyMode: "11ax",
    rssi: -79,
    signalStrength: 35,
    security: "WPA2 Personal",
    ssid: "<redacted>",
    txRate: 103,
  });
});

// ============================

test("parsing macOS 15 (Sequoia) 2.4GHz wdutil output", () => {
  const input = fs.readFileSync(
    path.join(__dirname, "../data/macOS15-wdutil-2.4GHz-en.txt"),
    "utf-8",
  );
  const output = parseWdutilOutput(input);
  expect(output).toStrictEqual({
    bssid: "<redacted>",
    channel: 1,
    channelWidth: 20,
    band: 2.4,
    phyMode: "11ax",
    rssi: -63,
    signalStrength: 62,
    security: "None",
    ssid: "<redacted>",
    txRate: 48,
  });
});

// ============================

test("parsing macOS 12 (Catalina) 2.4GHz wdutil output", () => {
  const input = fs.readFileSync(
    path.join(__dirname, "../data/macOS12-wdutil-2.4GHz-en.txt"),
    "utf-8",
  );
  const output = parseWdutilOutput(input);
  expect(output).toStrictEqual({
    bssid: "fedcba098765",
    channel: 1,
    channelWidth: 20,
    band: 2.4,
    phyMode: "11n",
    rssi: -55,
    signalStrength: 75,
    security: "None",
    ssid: "SomeSSID-2.4",
    txRate: 145.0,
  });
});

// ============================

test("parsing macOS 12 (Catalina) 5GHz wdutil output", () => {
  const input = fs.readFileSync(
    path.join(__dirname, "../data/macOS12-wdutil-5GHz-en.txt"),
    "utf-8",
  );
  const output = parseWdutilOutput(input);
  expect(output).toStrictEqual({
    bssid: "fedcba098765",
    channel: 144,
    channelWidth: 40,
    band: 5,
    phyMode: "11ac",
    rssi: -61,
    signalStrength: 65,
    security: "WPA2 Personal",
    ssid: "SomeSSID-5",
    txRate: 324.0,
  });
});

// ==============================

test("parsing wdutil with no wifi signal", () => {
  const input = fs.readFileSync(
    path.join(__dirname, "../data/mac-wdutil-nosignal-en.txt"),
    "utf-8",
  );
  const output = parseWdutilOutput(input);
  expect(output).toStrictEqual({
    ssid: "None",
    bssid: "none",
    rssi: 0,
    signalStrength: 0,
    channel: 1,
    band: 2.4, // 5GHz since channel is > 14
    channelWidth: 20, // Windows doesn't provide this info
    txRate: 0,
    phyMode: "None",
    security: "None",
  });
});
