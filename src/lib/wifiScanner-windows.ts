import { PartialHeatmapSettings, WifiScanResults, WifiActions } from "./types";
import { delay } from "./server-utils";
import * as wlanApi from "./wlan-api";
import { ERROR_ACCESS_DENIED } from "./wlan-api-parse";
import { getLogger } from "./logger";
import { recordWifiMethod, WIFI_METHOD } from "./diagnostics-state";

/**
 * Windows 11 24H2 and later answer ERROR_ACCESS_DENIED for the connection
 * and the network lists until the user lets desktop apps use their location.
 * Windows never shows its one-time location prompt for an unpackaged desktop
 * app, so the user has to switch it on in Settings.
 */
export const LOCATION_PERMISSION_MESSAGE =
  "Windows needs location access to share Wi-Fi details. Open Settings → Privacy & security → Location, turn on Location services and “Let desktop apps access your location”, then try again.";

const NOT_CONNECTED_MESSAGE =
  "Wi-Fi is not connected. Connect to a Wi-Fi network and try again.";

/**
 * What failed, in a few words: koffi or wlanapi.dll not loading, a WLAN API
 * call returning an error code, or anything else the API code threw.
 */
export function describeWlanApiError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * The error to show when reading Wi-Fi through the WLAN API fails for a
 * reason the user cannot fix themselves. There is no other way to read
 * Wi-Fi on Windows, so ask for a report: the diagnostics include this error.
 */
export function wlanApiErrorMessage(err: unknown): string {
  return (
    `Can't read Wi-Fi through the Windows WLAN API (${describeWlanApiError(err)}). ` +
    "This is a bug in wifi-heatmapper. Please report it with Report a problem in the help menu (?), " +
    "which includes this error."
  );
}

/**
 * The failures the user can fix themselves, or null for a bug. Access
 * denied means Windows location permission is off (see
 * LOCATION_PERMISSION_MESSAGE); no Wi-Fi adapter means nothing to read.
 */
function userFixableMessage(err: unknown): string | null {
  if (err instanceof wlanApi.WlanApiError && err.code === ERROR_ACCESS_DENIED) {
    return LOCATION_PERMISSION_MESSAGE;
  }
  if (err instanceof Error && err.message === wlanApi.NO_WIFI_ADAPTER_MESSAGE) {
    return wlanApi.NO_WIFI_ADAPTER_MESSAGE;
  }
  return null;
}

/**
 * wlanApiFailureMessage - what to tell the user when a WLAN API call fails:
 * what to change, or (koffi not loading, another error code) a bug to report.
 */
export function wlanApiFailureMessage(err: unknown): string {
  return userFixableMessage(err) ?? wlanApiErrorMessage(err);
}

/**
 * wlanApiFailure - the result of a failed WLAN API reading. A reportable
 * failure is kept in the diagnostics: the method stays "Windows WLAN API",
 * with what failed as its detail. (Also used by the mock's "wlan-api-error"
 * e2e scenario.)
 */
export function wlanApiFailure(what: string, err: unknown): WifiScanResults {
  if (userFixableMessage(err) === null) {
    recordWifiMethod(
      WIFI_METHOD.wlanApi,
      `${what} failed: ${describeWlanApiError(err)}`,
    );
  }
  return { SSIDs: [], reason: wlanApiFailureMessage(err) };
}

/**
 * WindowsWifiActions - reads Wi-Fi details from wlanapi.dll (see wlan-api.ts),
 * so nothing depends on the display language. There is no fallback: if koffi
 * cannot be loaded or the API fails, the reading fails with an error that
 * says what failed and asks for a report.
 */
export class WindowsWifiActions implements WifiActions {
  private logger = getLogger("wifi-Windows");
  private warned = new Set<string>();

  /**
   * Windows needs no sudo, so there is nothing to check here; the speed
   * test (iperf3 installed, server address, duration) is checked for every
   * OS in speed-test.ts.
   */
  async preflightSettings(
    _settings: PartialHeatmapSettings,
  ): Promise<WifiScanResults> {
    return { SSIDs: [], reason: "" };
  }

  /** Log the first failure of each kind, not one per measurement */
  private failed(what: string, err: unknown): WifiScanResults {
    const key = `${what}: ${err}`;
    if (!this.warned.has(key)) {
      this.warned.add(key);
      this.logger.warn(`WLAN API ${what} failed:`, err);
    }
    return wlanApiFailure(what, err);
  }

  /** nearby networks, strongest first */
  async scanWifi(_settings: PartialHeatmapSettings): Promise<WifiScanResults> {
    try {
      const SSIDs = await wlanApi.scanNetworks();
      return { SSIDs, reason: "" };
    } catch (err) {
      return this.failed("scan", err);
    }
  }

  /** the current connection */
  async getWifi(_settings: PartialHeatmapSettings): Promise<WifiScanResults> {
    try {
      // Right after (re)association the connection can briefly be missing:
      // give it a few seconds
      for (let attempt = 0; attempt < 10; attempt++) {
        const current = await wlanApi.getCurrentConnection();
        if (current) {
          recordWifiMethod(WIFI_METHOD.wlanApi);
          return { SSIDs: [current], reason: "" };
        }
        await delay(300);
      }
      return { SSIDs: [], reason: NOT_CONNECTED_MESSAGE };
    } catch (err) {
      return this.failed("connection query", err);
    }
  }
}
