/**
 * macOS command output that used to go through grep/sed/awk in a shell and
 * is now parsed in JavaScript.
 */
import { describe, expect, test } from "vitest";
import fs from "fs";
import path from "path";
import {
  parseIoregBssid,
  parseIoregSsid,
  parseWifiDevice,
} from "../../src/lib/wifiScanner-macos";

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, "../data", name), "utf-8");

describe("parseWifiDevice (networksetup -listallhardwareports)", () => {
  test("finds the Wi-Fi device after other ports", () => {
    expect(parseWifiDevice(fixture("mac-networksetup-hardwareports.txt"))).toBe(
      "en0",
    );
  });

  test("older systems call it AirPort", () => {
    expect(
      parseWifiDevice(
        "Hardware Port: AirPort\nDevice: en1\nEthernet Address: x\n",
      ),
    ).toBe("en1");
  });

  test("no Wi-Fi port: empty", () => {
    expect(parseWifiDevice("Hardware Port: Ethernet\nDevice: en4\n")).toBe("");
  });
});

describe("ioreg", () => {
  const ssidOutput = [
    '    | |   "IO80211CountryCode" = "CZ"',
    '    | |   "IO80211SSID" = "My Home Net"',
    '    | |   "IO80211Channel" = 36',
  ].join("\n");
  const bssidOutput = [
    '    | |   "IO80211SSID" = "My Home Net"',
    '    | |   "IO80211BSSID" = <9e05d696e830>',
  ].join("\n");

  test("the SSID, spaces as underscores (like the old sed)", () => {
    expect(parseIoregSsid(ssidOutput)).toBe("My_Home_Net");
    expect(parseIoregSsid("nothing here")).toBe("");
  });

  test("the BSSID without <>", () => {
    expect(parseIoregBssid(bssidOutput)).toBe("9e05d696e830");
    expect(parseIoregBssid("nothing here")).toBe("");
  });
});
