/**
 * wifiScanner-windows.ts - Windows WiFi scanner using Win32 WLAN API
 *
 * Uses koffi to call wlanapi.dll directly, avoiding the need to parse
 * localized netsh command output.
 */

import {
  PartialHeatmapSettings,
  WifiResults,
  WifiScanResults,
  WifiActions,
} from "./types";
import { execAsync, delay } from "./server-utils";
import * as wlanApi from "./wlan-api";

export class WindowsWifiActions implements WifiActions {
  nameOfWifi: string = "";
  currentSSIDName: string = "";
  strongestSSID: WifiResults | null = null;

  /**
   * preflightSettings - check whether the settings are "primed" to run a test
   * Tests:
   *   * iperfServerAdrs - non-empty
   *   * testDuration - greater than zero
   *
   * @param settings
   * @returns string - empty, or error message to display
   */
  async preflightSettings(
    settings: PartialHeatmapSettings
  ): Promise<WifiScanResults> {
    const response: WifiScanResults = {
      SSIDs: [],
      reason: "",
    };
    let reason: string = "";

    // test duration must be > 0 - otherwise iperf3 runs forever
    if (settings.testDuration <= 0) {
      reason = "Test duration must be greater than zero.";
    }
    // iperfServerAddress must not be empty or ""
    else if (!settings.iperfServerAdrs) {
      reason = "Please set iperf3 server address";
    }

    response.reason = reason;
    return response;
  }

  /**
   * checkIperfServer() - test if an iperf3 server is available at the address
   * @param settings includes the iperfServerAddress
   * @returns "" or error string
   */
  async checkIperfServer(
    settings: PartialHeatmapSettings
  ): Promise<WifiScanResults> {
    const response: WifiScanResults = {
      SSIDs: [],
      reason: "",
    };
    let reason: string = "";

    const cmd = `powershell -NoProfile -Command "$r=[System.Net.Sockets.TcpClient]::new(); $r.ConnectAsync('${settings.iperfServerAdrs}',5201).Wait(2000) | Out-Null; $ok=$r.Connected; $r.Close(); if (-not $ok) { Write-Output 'Failed to connect to ${settings.iperfServerAdrs}:5201' }"`;

    try {
      await execAsync(cmd);
    } catch {
      reason = "Cannot connect to iperf3 server.";
    }
    response.reason = reason;
    return response;
  }

  /**
   * findWifi() - find the name of the wifi interface
   * @returns name of (the first) wifi interface (string)
   */
  async findWifi(): Promise<string> {
    this.nameOfWifi = await wlanApi.getInterfaceName();
    return this.nameOfWifi;
  }

  /**
   * scanWifi() - return an array of available wifi SSIDs plus a reason string
   * These are sorted by the strongest RSSI
   */
  async scanWifi(_settings: PartialHeatmapSettings): Promise<WifiScanResults> {
    const response: WifiScanResults = {
      SSIDs: [],
      reason: "",
    };

    try {
      // Get all visible networks
      const networks = await wlanApi.scanNetworks();

      // Get current connection to mark it
      const current = await wlanApi.getCurrentConnection();

      if (current) {
        // Find matching network in scan results and mark as current
        const match = networks.find((n) => n.bssid === current.bssid);
        if (match) {
          match.currentSSID = true;
          // Fill in channel/band from scan (not available in connection attributes)
          current.channel = match.channel;
          current.band = match.band;
        }
        this.currentSSIDName = current.ssid;
      }

      response.SSIDs = networks;
    } catch (err) {
      response.reason = `Cannot get wifi info: ${err}`;
    }

    return response;
  }

  /**
   * setWifi(settings, newSSID) - associate with the named SSID
   *
   * @param _settings - same as always
   * @param _wifiSettings - new SSID to associate with
   * @returns WifiScanResults - empty array of results, only the reason
   */
  async setWifi(
    _settings: PartialHeatmapSettings,
    _wifiSettings: WifiResults
  ): Promise<WifiScanResults> {
    // NOT IMPLEMENTED - wifi-heatmapper doesn't switch networks
    throw new Error("wifi-heatmapper does not implement setWifi()");
  }

  /**
   * getWifi - return the WifiResults for the currently-associated SSID
   * @param _settings (the leading "_" tells Typescript that it is not used)
   * @returns WifiScanResults with current connection info
   */
  async getWifi(_settings: PartialHeatmapSettings): Promise<WifiScanResults> {
    const response: WifiScanResults = {
      SSIDs: [],
      reason: "",
    };

    // Poll until connected (matches original behavior)
    const maxAttempts = 50; // 10 seconds at 200ms intervals
    for (let i = 0; i < maxAttempts; i++) {
      const current = await wlanApi.getCurrentConnection();

      if (current && current.txRate > 0) {
        // Get channel info from a scan
        try {
          const networks = await wlanApi.scanNetworks();
          const match = networks.find((n) => n.bssid === current.bssid);
          if (match) {
            current.channel = match.channel;
            current.band = match.band;
          }
        } catch {
          // Scan failed, proceed without channel info
        }

        response.SSIDs.push(current);
        return response;
      }

      await delay(200);
    }

    response.reason = "Not connected to WiFi or connection not ready";
    return response;
  }
}
