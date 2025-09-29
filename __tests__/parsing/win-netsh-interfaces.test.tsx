/**
 * Test parsing for Windows of the `netsh wlan show interfaces` in
 *   several localized languages
 */

import {
  expect,
  test,
  //describe, it, beforeAll
} from "vitest";
import fs from "fs";
import path from "path";
import { parseNetshInterfaces } from "../../src/lib/wifiScanner-windows";

test("parsing netsh output where no labels match", () => {
  const netsh_output = fs.readFileSync(
    path.join(__dirname, "../data/win-netsh-interfaces-no-match.txt"),
    "utf-8",
  );

  expect(() => parseNetshInterfaces(netsh_output)).toThrow(
    `Could not read Wi-Fi info. Perhaps wifi-heatmapper is not localized for your system. See https://github.com/hnykda/wifi-heatmapper/issues/26 for details.`,
  );
});

test("parsing english netsh ... interfaces output", () => {
  const netsh_output = fs.readFileSync(
    path.join(__dirname, "../data/win-netsh-interfaces-en.txt"),
    "utf-8",
  );
  const output = parseNetshInterfaces(netsh_output);
  expect(output).toStrictEqual({
    name: "Wi-Fi",
    ssid: "SSID-1",
    bssid: "fedcba098702",
    rssi: -75,
    signalStrength: 42,
    channel: 44,
    band: 5, // 5GHz since channel is > 14
    channelWidth: 0, // Windows doesn't provide this info
    txRate: 103,
    phyMode: "802.11ax",
    security: "WPA2-Personal",
    active: false,
  });
});

test("parsing italian netsh output", () => {
  const netsh_output = fs.readFileSync(
    path.join(__dirname, "../data/win-netsh-interfaces-it.txt"),
    "utf-8",
  );
  const output = parseNetshInterfaces(netsh_output);
  expect(output).toStrictEqual({
    name: "Wi-Fi",
    ssid: "SSID-1",
    bssid: "fedcba098702",
    rssi: -49,
    signalStrength: 85,
    channel: 4,
    band: 2.4, // 2.4GHz since channel is <= 14
    channelWidth: 0, // Windows doesn't provide this info
    txRate: 130,
    phyMode: "802.11n",
    security: "WPA2-Personal",
    active: false,
  });
});

test("parsing German netsh output", () => {
  const netsh_output = fs.readFileSync(
    path.join(__dirname, "../data/win-netsh-interfaces-de.txt"),
    "utf-8",
  );
  const output = parseNetshInterfaces(netsh_output);
  expect(output).toStrictEqual({
    name: "WLAN",
    ssid: "SSID-1",
    bssid: "fedcba098702",
    rssi: -74,
    signalStrength: 43,
    channel: 116,
    band: 5, // 2.4GHz since channel is <= 14
    channelWidth: 0, // Windows doesn't provide this info
    txRate: 300,
    phyMode: "802.11ac",
    security: "WPA2-Enterprise",
    active: false,
  });
});

test("parsing French netsh output", () => {
  const netsh_output = fs.readFileSync(
    path.join(__dirname, "../data/win-netsh-interfaces-fr.txt"),
    "utf-8",
  );
  const output = parseNetshInterfaces(netsh_output);
  expect(output).toStrictEqual({
    name: "Wi-Fi",
    ssid: "SSID-1",
    bssid: "fedcba098702",
    rssi: -52,
    signalStrength: 80,
    channel: 11,
    band: 2.4, // 2.4GHz since channel is <= 14
    channelWidth: 0, // Windows doesn't provide this info
    txRate: 206,
    phyMode: "802.11ax",
    security: "Ouvrir",
    active: false,
  });
});

test("parsing Spanish netsh output", () => {
  const netsh_output = fs.readFileSync(
    path.join(__dirname, "../data/win-netsh-interfaces-es.txt"),
    "utf-8",
  );
  const output = parseNetshInterfaces(netsh_output);
  expect(output).toStrictEqual({
    name: "Wi-Fi",
    ssid: "SSID-1",
    bssid: "fedcba098702",
    rssi: -51,
    signalStrength: 81,
    channel: 11,
    band: 2.4, // 2.4GHz since channel is <= 14
    channelWidth: 0, // Windows doesn't provide this info
    txRate: 206,
    phyMode: "802.11ax",
    security: "Abierta",
    active: false,
  });
});
