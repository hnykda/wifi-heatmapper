/**
 * WindowsWifiActions with the WLAN API mocked: there is no fallback, so a
 * failure becomes the reading's error, and the diagnostics keep the method
 * ("Windows WLAN API") with the error as its detail.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import * as wlanApi from "../src/lib/wlan-api";
import { ERROR_ACCESS_DENIED } from "../src/lib/wlan-api-parse";
import {
  LOCATION_PERMISSION_MESSAGE,
  WindowsWifiActions,
} from "../src/lib/wifiScanner-windows";
import {
  lastWifiMethod,
  resetDiagnosticsState,
  WIFI_METHOD,
} from "../src/lib/diagnostics-state";
import { getDefaultWifiResults } from "../src/lib/utils";
import type { PartialHeatmapSettings } from "../src/lib/types";

vi.mock("../src/lib/wlan-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/wlan-api")>()),
  getCurrentConnection: vi.fn(),
  scanNetworks: vi.fn(),
}));
vi.mock("../src/lib/server-utils", () => ({ delay: vi.fn(async () => {}) }));

const getCurrentConnection = vi.mocked(wlanApi.getCurrentConnection);
const scanNetworks = vi.mocked(wlanApi.scanNetworks);
const settings = {} as PartialHeatmapSettings;

beforeEach(() => {
  getCurrentConnection.mockReset();
  scanNetworks.mockReset();
  resetDiagnosticsState();
});

describe("WindowsWifiActions", () => {
  test("a connection is read through the WLAN API", async () => {
    const wifi = {
      ...getDefaultWifiResults(),
      ssid: "Home",
      bssid: "a0b1c2d3e4f5",
    };
    getCurrentConnection.mockResolvedValue(wifi);
    const result = await new WindowsWifiActions().getWifi(settings);
    expect(result).toEqual({ SSIDs: [wifi], reason: "" });
    expect(lastWifiMethod()).toMatchObject({
      method: WIFI_METHOD.wlanApi,
      detail: undefined,
    });
  });

  test("koffi not loading is one clear error, kept in the diagnostics", async () => {
    getCurrentConnection.mockRejectedValue(
      new wlanApi.WlanLoadError(new Error("Cannot find module 'koffi'")),
    );
    const result = await new WindowsWifiActions().getWifi(settings);
    expect(result.SSIDs).toEqual([]);
    expect(result.reason).toContain(
      "Can't read Wi-Fi through the Windows WLAN API (koffi could not load wlanapi.dll: Cannot find module 'koffi')",
    );
    expect(result.reason).toContain("Report a problem");
    expect(lastWifiMethod()).toMatchObject({
      method: WIFI_METHOD.wlanApi,
      detail:
        "connection query failed: koffi could not load wlanapi.dll: Cannot find module 'koffi'",
    });
  });

  test("an API error code fails the scan the same way", async () => {
    scanNetworks.mockRejectedValue(new wlanApi.WlanApiError("WlanScan", 1062));
    const result = await new WindowsWifiActions().scanWifi(settings);
    expect(result.reason).toContain("(WlanScan failed with error 1062)");
    expect(lastWifiMethod()?.detail).toBe(
      "scan failed: WlanScan failed with error 1062",
    );
  });

  test("access denied asks for location permission, not a report", async () => {
    getCurrentConnection.mockRejectedValue(
      new wlanApi.WlanApiError("WlanQueryInterface", ERROR_ACCESS_DENIED),
    );
    const result = await new WindowsWifiActions().getWifi(settings);
    expect(result.reason).toBe(LOCATION_PERMISSION_MESSAGE);
    expect(lastWifiMethod()).toBeNull();
  });

  test("not connected after retrying", async () => {
    getCurrentConnection.mockResolvedValue(null);
    const result = await new WindowsWifiActions().getWifi(settings);
    expect(result.reason).toContain("Wi-Fi is not connected");
    expect(getCurrentConnection).toHaveBeenCalledTimes(10);
  });
});
