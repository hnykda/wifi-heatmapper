/**
 * Tests for the Win32 WLAN API module
 *
 * Integration tests only run on Windows and are skipped on other platforms.
 */

import { describe, test, expect } from "vitest";

const isWindows = process.platform === "win32";

// Windows-only integration tests
const describeWindows = isWindows ? describe : describe.skip;

describeWindows("WLAN API Integration (Windows only)", () => {
  test("scanNetworks returns array of WifiResults", async () => {
    const { scanNetworks } = await import("../src/lib/wlan-api");
    const networks = await scanNetworks();

    expect(Array.isArray(networks)).toBe(true);

    if (networks.length > 0) {
      const network = networks[0];

      // Check required fields have correct types
      expect(typeof network.ssid).toBe("string");
      expect(typeof network.bssid).toBe("string");
      expect(typeof network.rssi).toBe("number");
      expect(typeof network.signalStrength).toBe("number");
      expect(typeof network.channel).toBe("number");
      expect(typeof network.band).toBe("number");
      expect(typeof network.phyMode).toBe("string");

      // Validate BSSID format (12 hex chars, lowercase, no separators)
      expect(network.bssid).toMatch(/^[0-9a-f]{12}$/);

      // RSSI should be negative dBm
      expect(network.rssi).toBeLessThan(0);
      expect(network.rssi).toBeGreaterThan(-100);

      // Signal strength should be percentage
      expect(network.signalStrength).toBeGreaterThanOrEqual(0);
      expect(network.signalStrength).toBeLessThanOrEqual(100);

      // Channel should be valid
      expect(network.channel).toBeGreaterThan(0);

      // Band should be 2.4 or 5 (or 6 for WiFi 6E)
      expect([2.4, 5, 6]).toContain(network.band);
    }
  });

  test("getCurrentConnection returns WifiResults or null", async () => {
    const { getCurrentConnection } = await import("../src/lib/wlan-api");
    const current = await getCurrentConnection();

    // null is valid if not connected
    if (current === null) {
      return;
    }

    // If connected, verify the structure
    expect(typeof current.ssid).toBe("string");
    expect(current.ssid.length).toBeGreaterThan(0);

    expect(typeof current.bssid).toBe("string");
    expect(current.bssid).toMatch(/^[0-9a-f]{12}$/);

    expect(typeof current.txRate).toBe("number");
    expect(current.txRate).toBeGreaterThan(0); // Connected means has tx rate

    expect(typeof current.signalStrength).toBe("number");
    expect(current.signalStrength).toBeGreaterThanOrEqual(0);
    expect(current.signalStrength).toBeLessThanOrEqual(100);

    expect(current.currentSSID).toBe(true);
  });

  test("getInterfaceName returns non-empty string", async () => {
    const { getInterfaceName } = await import("../src/lib/wlan-api");
    const name = await getInterfaceName();

    expect(typeof name).toBe("string");
    expect(name.length).toBeGreaterThan(0);
  });

  test("networks are sorted by signal strength (strongest first)", async () => {
    const { scanNetworks } = await import("../src/lib/wlan-api");
    const networks = await scanNetworks();

    if (networks.length > 1) {
      for (let i = 1; i < networks.length; i++) {
        // Higher signal strength (closer to 0) should come first
        expect(networks[i - 1].signalStrength).toBeGreaterThanOrEqual(
          networks[i].signalStrength,
        );
      }
    }
  });
});

// These tests run on ALL platforms
describe("WLAN API module loading", () => {
  test("module loads without error on any platform", async () => {
    await expect(import("../src/lib/wlan-api")).resolves.toBeDefined();
  });

  test("isWindows export reflects platform", async () => {
    const { isWindows: apiIsWindows } = await import("../src/lib/wlan-api");
    expect(apiIsWindows).toBe(process.platform === "win32");
  });

  test("functions throw on non-Windows platforms", async () => {
    if (isWindows) {
      // Skip this test on Windows
      return;
    }

    const { scanNetworks, getCurrentConnection, getInterfaceName } =
      await import("../src/lib/wlan-api");

    await expect(scanNetworks()).rejects.toThrow(
      "WLAN API is only available on Windows",
    );
    await expect(getCurrentConnection()).rejects.toThrow(
      "WLAN API is only available on Windows",
    );
    await expect(getInterfaceName()).rejects.toThrow(
      "WLAN API is only available on Windows",
    );
  });
});
