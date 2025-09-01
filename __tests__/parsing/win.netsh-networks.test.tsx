/**
 * Test conversion from `netsh wlan show interfaces mode=bssid`
 * to WifiResults
 */
import { expect, test } from "vitest";
import fs from "fs";
import path from "path";
import { parseNetshNetworks } from "../../src/lib/wifiScanner-windows";
import { WifiResults } from "../../src/lib/types";
// import { initLocalization } from "../../src/lib/localization";

function checkEachItem(item: WifiResults) {
  // console.log(`checkEachItem: ${JSON.stringify(item)}`);
  expect(item.rssi).toBeLessThan(0);
  expect(item.signalStrength).toBeGreaterThanOrEqual(0);
  expect(item.signalStrength).toBeLessThanOrEqual(100);
  expect(item.channelWidth).toBeGreaterThanOrEqual(0);
  expect(item.ssid).toContain("SSID-");
}

// ========= English Win11 'netsh wlan show networks mode=bssid' ===============

test("Parsing English Win11 'netsh ... networks'", () => {
  const netsh_output = fs.readFileSync(
    path.join(__dirname, "../data/win-netsh-networks-en.txt"),
    "utf-8",
  );
  const results = parseNetshNetworks(netsh_output);

  // console.log(`Test routine shows: ${JSON.stringify(results, null, 2)}`);

  expect(results.length).toEqual(8);

  expect(results[0]).toStrictEqual({
    ssid: "SSID-1",
    bssid: "fe:dc:ba:09:87:03",
    channel: 6,
    phyMode: "802.11n",
    security: "Open",
    rssi: -47,
    signalStrength: 88,
    band: 2.4,
    txRate: 0, // candidates don't give txRate
    channelWidth: 0,
    active: false, // not the one that's in service now
  });

  results.forEach(checkEachItem);
});

// ========= English Win11 'netsh wlan show networks' with blank SSID ===============

test("Parsing English Win11 'netsh ... networks'-Blank SSID", () => {
  const netsh_output = fs.readFileSync(
    path.join(__dirname, "../data/win-netsh-networks-blank-ssid-en.txt"),
    "utf-8",
  );
  const results = parseNetshNetworks(netsh_output);

  // console.log(`Test routine shows: ${JSON.stringify(results, null, 2)}`);

  expect(results.length).toEqual(14);

  expect(results[0]).toStrictEqual({
    ssid: "SSID-2",
    bssid: "fe:dc:ba:09:87:03",
    channel: 11,
    phyMode: "802.11ax",
    security: "Open",
    rssi: -51,
    signalStrength: 81,
    band: 2.4,
    txRate: 0, // candidates don't give txRate
    channelWidth: 0,
    active: false, // not the one that's in service now
  });

  results.forEach(checkEachItem);
});

// ========= French Win11 'netsh wlan show networks mode=bssid' ===============

test("Parsing French Win11 'netsh ... networks'", () => {
  const netsh_output = fs.readFileSync(
    path.join(__dirname, "../data/win-netsh-networks-fr.txt"),
    "utf-8",
  );
  const results = parseNetshNetworks(netsh_output);

  // console.log(`Test routine shows: ${JSON.stringify(results, null, 2)}`);

  expect(results.length).toEqual(8);

  expect(results[0]).toStrictEqual({
    ssid: "SSID-3",
    bssid: "fe:dc:ba:09:87:07",
    channel: 1,
    phyMode: "802.11ax",
    security: "Ouvrir",
    rssi: -51,
    signalStrength: 81,
    band: 2.4,
    txRate: 0, // candidates don't give txRate
    channelWidth: 0,
    active: false, // not the one that's in service now
  });

  results.forEach(checkEachItem);
});

// ========= German Win11 'netsh wlan show networks mode=bssid' ===============

test("Parsing German Win11 'netsh ... networks'", () => {
  const netsh_output = fs.readFileSync(
    path.join(__dirname, "../data/win-netsh-networks-de.txt"),
    "utf-8",
  );
  const results = parseNetshNetworks(netsh_output);

  // console.log(`Test routine shows: ${JSON.stringify(results, null, 2)}`);

  expect(results.length).toEqual(9);

  expect(results[0]).toStrictEqual({
    ssid: "SSID-4",
    bssid: "fe:dc:ba:09:87:06",
    channel: 6,
    phyMode: "802.11n",
    security: "Offen",
    rssi: -47,
    signalStrength: 88,
    band: 2.4,
    txRate: 0, // candidates don't give txRate
    channelWidth: 0,
    active: false, // not the one that's in service now
  });

  results.forEach(checkEachItem);
});

// ========= Italian Win11 'netsh wlan show networks mode=bssid' ===============

test("Parsing Italian Win11 'netsh ... networks'", () => {
  const netsh_output = fs.readFileSync(
    path.join(__dirname, "../data/win-netsh-networks-it.txt"),
    "utf-8",
  );
  const results = parseNetshNetworks(netsh_output);

  // console.log(`Test routine shows: ${JSON.stringify(results, null, 2)}`);

  expect(results.length).toEqual(10);

  expect(results[0]).toStrictEqual({
    ssid: "SSID-6",
    bssid: "fe:dc:ba:09:87:09",
    channel: 6,
    phyMode: "802.11n",
    security: "Aperta",
    rssi: -45,
    signalStrength: 92,
    band: 2.4,
    txRate: 0, // candidates don't give txRate
    channelWidth: 0,
    active: false, // not the one that's in service now
  });

  results.forEach(checkEachItem);
});

// ========= Spanish Win11 'netsh wlan show networks mode=bssid' ===============

test("Parsing Spanish Win11 'netsh ... networks'", () => {
  const netsh_output = fs.readFileSync(
    path.join(__dirname, "../data/win-netsh-networks-es.txt"),
    "utf-8",
  );
  const results = parseNetshNetworks(netsh_output);

  // console.log(`Test routine shows: ${JSON.stringify(results, null, 2)}`);

  expect(results.length).toEqual(7);

  expect(results[0]).toStrictEqual({
    ssid: "SSID-3",
    bssid: "fe:dc:ba:09:87:06",
    channel: 6,
    phyMode: "802.11n",
    security: "Abierta",
    rssi: -46,
    signalStrength: 90,
    band: 2.4,
    txRate: 0, // candidates don't give txRate
    channelWidth: 0,
    active: false, // not the one that's in service now
  });

  results.forEach(checkEachItem);
});
