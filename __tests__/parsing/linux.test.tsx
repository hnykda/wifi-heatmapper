import { describe, expect, test } from "vitest";
import {
  parseIwInterfaces,
  parseIwOutput,
} from "../../src/lib/wifiScanner-linux";
import {
  splitColonDelimited,
  getCandidateSSIDs,
  iwLinkCommands,
} from "../../src/lib/wifiScanner-linux";

import fs from "fs";
import path from "path";

test("parsing netsh output", () => {
  const linkOutput = fs.readFileSync(
    path.join(__dirname, "../data/linux-netsh-output.txt"),
    "utf-8",
  );

  const infoOutput = fs.readFileSync(
    path.join(__dirname, "../data/linux-info-output.txt"),
    "utf-8",
  );

  const output = parseIwOutput(linkOutput, infoOutput);
  expect(output).toStrictEqual({
    ssid: "HomeNetwork_5G",
    bssid: "1234563f197c",
    rssi: -56,
    channel: 36,
    signalStrength: 73,
    band: 5,
    channelWidth: 80,
    txRate: 866.7,
    phyMode: "",
    security: "",
    currentSSID: false,
    strongestSSID: null,
  });
});

test("parsing Ubuntu 24.04", () => {
  const linkOutput = fs.readFileSync(
    path.join(__dirname, "../data/linux-iw-dev-wlp1s0-link.txt"),
    "utf-8",
  );

  const infoOutput = fs.readFileSync(
    path.join(__dirname, "../data/linux-iw-dev-wlp1s0-info.txt"),
    "utf-8",
  );

  const output = parseIwOutput(linkOutput, infoOutput);
  expect(output).toStrictEqual({
    ssid: "SSID-1",
    bssid: "fedcba987602",
    rssi: -51,
    channel: 1,
    signalStrength: 82,
    band: 2.4,
    channelWidth: 0,
    txRate: 26,
    phyMode: "",
    security: "",
    currentSSID: false,
    strongestSSID: null,
  });
});

test("Parsing 'nmlcli -t' output with escaped characters", () => {
  const line = fs.readFileSync(
    path.join(__dirname, "../data/linux-single-line.txt"),
    "utf-8",
  );

  const cols = splitColonDelimited(line);
  // console.log(`cols: ${JSON.stringify(cols)}`);
  expect(cols).toStrictEqual([
    "",
    "E6:95:6E:55:B3:E5",
    "GL-MT300N-V2-3e5-\\foo:Guest",
    "Infra",
    "6",
    "130 Mbit/s",
    "100",
    "▂▄▆█",
    "WPA2",
  ]);
  // cols => [" ", "E6:95:6E:55:B3:E5", "GL-MT300N-V2-3e5-\\foo:Guest", "Infra", "6", "130 Mbit/s", "100", "▂▄▆█", "WPA2"]
});

test("Parsing 'nmlcli -t' output with non-empty first column and no security", () => {
  const line = fs.readFileSync(
    path.join(__dirname, "../data/linux-single-line-2.txt"),
    "utf-8",
  );

  const cols = splitColonDelimited(line);
  // console.log(`cols: ${JSON.stringify(cols)}`);
  expect(cols).toStrictEqual([
    "*",
    "94:83:C4:A7:29:C5",
    "HBTL",
    "Infra",
    "1",
    "260 Mbit/s",
    "87",
    "▂▄▆█",
    "",
  ]);
});

test("Handling 'nmcli dev wifi list'", () => {
  const nmcliOutput = fs.readFileSync(
    path.join(__dirname, "../data/linux-nmcli-dev-wifi-list.txt"),
    "utf-8",
  );
  const candidates = getCandidateSSIDs(nmcliOutput);

  expect(candidates.length).toEqual(11);

  expect(candidates[0]).toStrictEqual({
    ssid: "SSID-1",
    bssid: "FE:DC:BA:09:87:01",
    rssi: -40,
    signalStrength: 100,
    channel: 6,
    band: 2.4,
    channelWidth: 0,
    txRate: 130,
    phyMode: "",
    security: "WPA1 WPA2",
    currentSSID: false,
    strongestSSID: null,
  });

  // checking that the "\" and ":" are escaped properly in the SSID
  expect(candidates[1]).toStrictEqual({
    ssid: "SSID-2-\\foo:bar", // only one "\" in the SSID
    bssid: "FE:DC:BA:09:87:02",
    rssi: -40,
    signalStrength: 100,
    channel: 6,
    band: 2.4,
    channelWidth: 0,
    txRate: 130,
    phyMode: "",
    security: "WPA2",
    currentSSID: false,
    strongestSSID: null,
  });

  expect(candidates[10]).toStrictEqual({
    ssid: "SSID-11",
    bssid: "FE:DC:BA:09:87:0B",
    rssi: -91,
    signalStrength: 15,
    channel: 11,
    band: 2.4,
    channelWidth: 0,
    txRate: 130,
    phyMode: "",
    security: "WPA2 WPA3",
    currentSSID: false,
    strongestSSID: null,
  });
});

const iwFixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, `../data/${name}`), "utf-8");

describe("parseIwInterfaces", () => {
  test("ignores mon0 and unnamed P2P devices before and after the managed interface", () => {
    expect(
      parseIwInterfaces(iwFixture("linux-iw-dev-monitor-first.txt")),
    ).toStrictEqual(["wlp0s20f3"]);
  });

  test("preserves managed interface order across physical devices", () => {
    expect(
      parseIwInterfaces(iwFixture("linux-iw-dev-multiple-managed.txt")),
    ).toStrictEqual(["wlan0", "wlp0s20f3"]);
  });

  test.each([
    "linux-iw-dev-monitor-only.txt",
    "linux-iw-dev-non-client.txt",
    "linux-iw-dev-no-interfaces.txt",
  ])("returns no candidates for %s", (name) => {
    expect(parseIwInterfaces(iwFixture(name))).toStrictEqual([]);
  });

  test("returns no candidates for empty output", () => {
    expect(parseIwInterfaces("")).toStrictEqual([]);
  });
});

describe("parseIwOutput connected-link validation", () => {
  test("parses sanitized channel 149 host output with decimal frequency", () => {
    expect(
      parseIwOutput(
        iwFixture("linux-iw-connected-link.txt"),
        iwFixture("linux-iw-connected-info.txt"),
      ),
    ).toMatchObject({
      ssid: "Example Network",
      bssid: "021122334455",
      rssi: -59,
      signalStrength: 68,
      channel: 149,
      band: 5,
      channelWidth: 80,
      txRate: 432.3,
    });
  });

  test.each([
    "linux-iw-disconnected-link.txt",
    "linux-iw-malformed-link.txt",
    "linux-iw-missing-signal-link.txt",
    "linux-iw-missing-bssid-link.txt",
  ])("rejects %s even when info contains a valid channel", (name) => {
    expect(() =>
      parseIwOutput(iwFixture(name), iwFixture("linux-iw-connected-info.txt")),
    ).toThrow();
  });

  test("rejects empty output rather than returning default metadata", () => {
    expect(() => parseIwOutput("", "")).toThrow();
    expect(() =>
      parseIwOutput("", iwFixture("linux-iw-connected-info.txt")),
    ).toThrow();
  });

  test("rejects a link with no channel available from either output", () => {
    expect(() =>
      parseIwOutput(iwFixture("linux-iw-missing-channel-link.txt"), ""),
    ).toThrow();
  });

  test("allows an empty SSID when BSSID, signal and frequency are valid", () => {
    expect(
      parseIwOutput(iwFixture("linux-iw-empty-ssid-link.txt"), ""),
    ).toMatchObject({
      ssid: "",
      bssid: "021122334455",
      rssi: -59,
      channel: 149,
      band: 5,
    });
  });
});

test("iw link is tried without sudo first, with sudo only given a password", () => {
  expect(iwLinkCommands("wlp1s0", "", false)).toStrictEqual([
    "iw dev wlp1s0 link",
  ]);
  expect(iwLinkCommands("wlp1s0", "secret", false)).toStrictEqual([
    "iw dev wlp1s0 link",
    'echo "secret" | sudo -S iw dev wlp1s0 link',
  ]);
  // Docker and Podman already run as root
  expect(iwLinkCommands("wlp1s0", "secret", true)).toStrictEqual([
    "iw dev wlp1s0 link",
  ]);
});
