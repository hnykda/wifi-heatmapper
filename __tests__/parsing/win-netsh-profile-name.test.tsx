/**
 * Test parsing for Windows of the `netsh wlan show profile name=...` in
 *   several localized languages
 */

import {
  expect,
  test,
  // describe, it, beforeAll
} from "vitest";
import fs from "fs";
import path from "path";
import { findProfileFromSSID } from "../../src/lib/wifiScanner-windows";

test("parsing English netsh profile name output", () => {
  const netsh_output = fs.readFileSync(
    path.join(__dirname, "../data/win-netsh-profile-name-en.txt"),
    "utf-8",
  );
  let output = findProfileFromSSID(netsh_output, "SSID-1");
  expect(output).toEqual("Profile1 2");

  output = findProfileFromSSID(netsh_output, "SSID-2"); // bogus second SSID works, too
  expect(output).toEqual("Profile1 2");

  output = findProfileFromSSID(netsh_output, "SSID-3");
  expect(output).toBe(null);

  // create a bad profile with no "Name" for the profile
  const noProfile = netsh_output
    .split("\n")
    .filter((line) => !line.includes("Name"))
    .join("\n");
  expect(() => findProfileFromSSID(noProfile, "SSID-1")).toThrowError(
    "No profile name found",
  );

  // create a bad profile stripping out "SSID Name" lines
  const noSSID = netsh_output
    .split("\n")
    .filter((line) => !line.includes("SSID name"))
    .join("\n");
  expect(() => findProfileFromSSID(noSSID, "SSID-1")).toThrowError(
    /^Can't find an SSID/,
  );
});

// Remove multiple SSID tests; bad profile test; no SSID test
// that are present in the English tests for other languages

test("parsing French netsh profile name output", () => {
  const netsh_output = fs.readFileSync(
    path.join(__dirname, "../data/win-netsh-profile-name-fr.txt"),
    "utf-8",
  );
  let output = findProfileFromSSID(netsh_output, "SSID-1");
  expect(output).toEqual("Profile1 2");

  output = findProfileFromSSID(netsh_output, "SSID-2");
  expect(output).toBe(null);
});

// Remove multiple SSID tests; bad profile test; no SSID test
// that are present in the English tests for other languages

test("parsing German netsh profile name output", () => {
  const netsh_output = fs.readFileSync(
    path.join(__dirname, "../data/win-netsh-profile-name-de.txt"),
    "utf-8",
  );
  let output = findProfileFromSSID(netsh_output, "SSID-1");
  expect(output).toEqual("Profile1 2");

  output = findProfileFromSSID(netsh_output, "SSID-2");
  expect(output).toBe(null);
});

// Remove multiple SSID tests; bad profile test; no SSID test
// that are present in the English tests for other languages

test("parsing Spanish netsh profile name output", () => {
  const netsh_output = fs.readFileSync(
    path.join(__dirname, "../data/win-netsh-profile-name-es.txt"),
    "utf-8",
  );
  let output = findProfileFromSSID(netsh_output, "SSID-1");
  expect(output).toEqual("Profile1 2");

  output = findProfileFromSSID(netsh_output, "SSID-2");
  expect(output).toBe(null);
});

// Remove multiple SSID tests; bad profile test; no SSID test
// that are present in the English tests for other languages

test("parsing Italian netsh profile name output", () => {
  const netsh_output = fs.readFileSync(
    path.join(__dirname, "../data/win-netsh-profile-name-it.txt"),
    "utf-8",
  );
  let output = findProfileFromSSID(netsh_output, "SSID-1");
  expect(output).toEqual("Profile1 2");

  output = findProfileFromSSID(netsh_output, "SSID-2");
  expect(output).toBe(null);
});
