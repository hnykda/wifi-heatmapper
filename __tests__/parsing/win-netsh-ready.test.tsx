/**
 * getWifi() polls `netsh wlan show interfaces` until netshInterfacesReady().
 * It used to wait for a "State" line, which only the Chinese table maps, so
 * every other language polled 25 times (about 5 s) on every reading.
 */
import { expect, test } from "vitest";
import fs from "fs";
import path from "path";
import { netshInterfacesReady } from "../../src/lib/wifiScanner-windows";

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, "../data", name), "utf-8");

test.each(["en", "de", "fr", "es", "it"])(
  "connected output is ready at once (%s)",
  (lang) => {
    expect(
      netshInterfacesReady(fixture(`win-netsh-interfaces-${lang}.txt`)),
    ).toBe(true);
  },
);

test("location-permission notice is ready: retrying won't change it", () => {
  expect(
    netshInterfacesReady(
      fixture("win-netsh-interfaces-location-denied-en.txt"),
    ),
  ).toBe(true);
});

test("unlocalized or empty output is not ready", () => {
  expect(
    netshInterfacesReady(fixture("win-netsh-interfaces-unlocalized.txt")),
  ).toBe(false);
  expect(netshInterfacesReady("")).toBe(false);
});
