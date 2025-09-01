/**
 * Test parsing for Windows of the `netsh wlan show interfaces` in
 *   several localized languages
 */

import { expect, test, describe, it, beforeAll } from "vitest";
import { initLocalization } from "../../src/lib/localization";
import { splitLine } from "../../src/lib/utils";
import { LocalizerMap } from "@/lib/types";

let localizer: LocalizerMap = {};

// Checking the localizer object with properties that are the localized strings

beforeAll(async () => {
  localizer = await initLocalization();
  // console.log(`localizer: ${JSON.stringify(localizer, null, 2)}`);
});

test("splitLine with 'Canal:11'", () => {
  const line = "Canal:11";
  const [label, key, val] = splitLine(line, localizer);
  expect(label).toEqual("Canal");
  expect(key).toEqual("channel");
  expect(val).toEqual("11");
});

describe("Checking new localization code", () => {
  it("should be an object", () => {
    expect(Object.keys(localizer).length).toBeGreaterThan(20);
  });
});

test("check 'Nom'", () => {
  expect(localizer["Nom"]).toBe("name");
});
test("check 'Kanal'", () => {
  expect(localizer["Kanal"]).toBe("channel");
});
test("check 'Tipo de radio'", () => {
  expect(localizer["Tipo de radio"]).toBe("phyMode");
});
test("check 'Authentification'", () => {
  expect(localizer["Authentification"]).toBe("security");
});
test("check 'Velocità trasmissione (Mbps)'", () => {
  expect(localizer["Velocità trasmissione (Mbps)"]).toBe("txRate");
});
test("check 'Name'", () => {
  expect(localizer["Name"]).toBe("name");
});
test("check 'Nom'", () => {
  expect(localizer["Señal"]).toBe("signalStrength");
});
test("check 'glorph'", () => {
  expect(localizer["glorph"]).toBeUndefined();
});
