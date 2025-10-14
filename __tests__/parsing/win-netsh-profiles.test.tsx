/**
 * Test parsing for Windows of the `netsh wlan show profiles` in
 *   several localized languages
 */

import {
  expect,
  test,
  describe, // it, beforeAll
} from "vitest";
import fs from "fs";
import path from "path";
import { parseProfiles } from "../../src/lib/wifiScanner-windows";

describe("Checking English profiles code", () => {
  test("parsing netsh wlan show profiles", () => {
    const netsh_output = fs.readFileSync(
      path.join(__dirname, "../data/win-netsh-profiles-en.txt"),
      "utf-8",
    );

    const profileList = parseProfiles(netsh_output);

    expect(profileList.length).toEqual(6);

    expect(profileList).toContain("Profile1 2");
    expect(profileList).toContain("Profile2");
    expect(profileList).toContain("Profile3");
    expect(profileList).toContain("Profile4");
    expect(profileList).toContain("Profile5");
    expect(profileList).toContain("Profile6");
  });
});

describe("Checking French profiles code", () => {
  test("parsing netsh wlan show profiles", () => {
    const netsh_output = fs.readFileSync(
      path.join(__dirname, "../data/win-netsh-profiles-fr.txt"),
      "utf-8",
    );

    const profileList = parseProfiles(netsh_output);

    expect(profileList.length).toEqual(6);

    expect(profileList).toContain("Profile1 2");
    expect(profileList).toContain("Profile2");
    expect(profileList).toContain("Profile3");
    expect(profileList).toContain("Profile4");
    expect(profileList).toContain("Profile5");
    expect(profileList).toContain("Profile6");
  });
});

describe("Checking German profiles code", () => {
  test("parsing netsh wlan show profiles", () => {
    const netsh_output = fs.readFileSync(
      path.join(__dirname, "../data/win-netsh-profiles-de.txt"),
      "utf-8",
    );

    const profileList = parseProfiles(netsh_output);

    expect(profileList.length).toEqual(6);

    expect(profileList).toContain("Profile1 2");
    expect(profileList).toContain("Profile2");
    expect(profileList).toContain("Profile3");
    expect(profileList).toContain("Profile4");
    expect(profileList).toContain("Profile5");
    expect(profileList).toContain("Profile6");
  });
});

describe("Checking Italian profiles code", () => {
  test("parsing netsh wlan show profiles", () => {
    const netsh_output = fs.readFileSync(
      path.join(__dirname, "../data/win-netsh-profiles-it.txt"),
      "utf-8",
    );

    const profileList = parseProfiles(netsh_output);

    expect(profileList.length).toEqual(6);

    expect(profileList).toContain("Profile1 2");
    expect(profileList).toContain("Profile2");
    expect(profileList).toContain("Profile3");
    expect(profileList).toContain("Profile4");
    expect(profileList).toContain("Profile5");
    expect(profileList).toContain("Profile6");
  });
});

describe("Checking Spanish profiles code", () => {
  test("parsing netsh wlan show profiles", () => {
    const netsh_output = fs.readFileSync(
      path.join(__dirname, "../data/win-netsh-profiles-es.txt"),
      "utf-8",
    );

    const profileList = parseProfiles(netsh_output);

    expect(profileList.length).toEqual(6);

    expect(profileList).toContain("Profile1 2");
    expect(profileList).toContain("Profile2");
    expect(profileList).toContain("Profile3");
    expect(profileList).toContain("Profile4");
    expect(profileList).toContain("Profile5");
    expect(profileList).toContain("Profile6");
  });
});
