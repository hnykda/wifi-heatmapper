/**
 * Windows 11 24H2+: netsh refuses Wi-Fi details until the user allows
 * desktop apps to use location. The output is localized but always contains
 * the settings URI; the parsers turn it into an actionable message.
 *
 * Fixtures: English output as reported on Microsoft Q&A
 * (learn.microsoft.com/en-us/answers/questions/3898504).
 */
import { expect, test } from "vitest";
import fs from "fs";
import path from "path";
import {
  LOCATION_PERMISSION_MESSAGE,
  needsLocationPermission,
  parseNetshInterfaces,
  parseNetshNetworks,
} from "../../src/lib/wifiScanner-windows";

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, "../data", name), "utf-8");

test("`show interfaces` without location permission", () => {
  const output = fixture("win-netsh-interfaces-location-denied-en.txt");
  expect(needsLocationPermission(output)).toBe(true);
  expect(() => parseNetshInterfaces(output)).toThrow(
    LOCATION_PERMISSION_MESSAGE,
  );
});

test("`show networks` without location permission", () => {
  const output = fixture("win-netsh-networks-location-denied-en.txt");
  expect(needsLocationPermission(output)).toBe(true);
  expect(() => parseNetshNetworks(output)).toThrow(LOCATION_PERMISSION_MESSAGE);
});

test("normal output is not mistaken for a permission problem", () => {
  for (const name of [
    "win-netsh-interfaces-en.txt",
    "win-netsh-interfaces-de.txt",
    "win-netsh-networks-en.txt",
  ]) {
    expect(needsLocationPermission(fixture(name))).toBe(false);
  }
});

test("the message tells the user where to go", () => {
  expect(LOCATION_PERMISSION_MESSAGE).toContain("Privacy & security");
  expect(LOCATION_PERMISSION_MESSAGE).toContain(
    "Let desktop apps access your location",
  );
});
