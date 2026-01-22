# Plan: Replace Windows netsh with Win32 WLAN API via koffi

## Overview

Replace the localized `netsh wlan` command parsing with direct Win32 Native Wifi API calls using koffi. This eliminates localization issues since the API returns structured binary data.

## Files to Create/Modify

### New Files
- `src/lib/wlan-api.ts` - koffi bindings for wlanapi.dll
- `__tests__/wlan-api.test.ts` - Windows-only integration tests (skipped on other platforms)

### Modified Files
- `src/lib/wifiScanner-windows.ts` - Use WLAN API instead of netsh
- `package.json` - Add koffi dependency

### Files to Delete
- `src/lib/localization.ts` - Only used by Windows netsh parsing
- `data/localization/` - Entire directory (macOS doesn't use it)
  - de-DE.json, en-mac-14.json, en-us-win11.json, es.json, fr-FR.json, it.json, README.md
- `__tests__/parsing/win-localization.test.tsx` - Tests for removed localization
- `__tests__/parsing/win-netsh-*.test.tsx` - Tests for removed netsh parsing
- `__tests__/data/win-netsh-*.txt` - Test fixtures for netsh output

### Code to Remove from wifiScanner-windows.ts
- `parseNetshNetworks()` function and export
- `parseNetshInterfaces()` function and export
- `splitLine()` function and export
- `parseProfiles()` function and export
- `findProfileFromSSID()` function and export
- `getProfiles()` function
- `getProfileFromSSID()` function
- `assignWindowsNetworkInfoValue()` function
- `localizer` import and top-level await

### Code to Remove from other files
- `src/lib/server-init.ts` - Remove `initLocalization()` import and call (line 8, 75)
- `src/lib/utils.ts` - Remove `splitLine()` function (lines 252-280) - only used by Windows tests

## Implementation Details

### 1. Create `src/lib/wlan-api.ts`

Define koffi struct bindings for Win32 WLAN API:

```typescript
import koffi from 'koffi';

// Only load on Windows
const isWindows = process.platform === 'win32';
let wlanapi: koffi.IKoffiLib | null = null;

if (isWindows) {
  wlanapi = koffi.load('wlanapi.dll');
}

// Struct definitions
const GUID = koffi.struct('GUID', {
  Data1: 'uint32',
  Data2: 'uint16',
  Data3: 'uint16',
  Data4: koffi.array('uint8', 8)
});

const DOT11_SSID = koffi.struct('DOT11_SSID', {
  uSSIDLength: 'uint32',
  ucSSID: koffi.array('uint8', 32)
});

const WLAN_RATE_SET = koffi.struct('WLAN_RATE_SET', {
  uRateSetLength: 'uint32',
  usRateSet: koffi.array('uint16', 126)
});

const WLAN_BSS_ENTRY = koffi.struct('WLAN_BSS_ENTRY', {
  dot11Ssid: DOT11_SSID,
  uPhyId: 'uint32',
  dot11Bssid: koffi.array('uint8', 6),
  dot11BssType: 'int32',
  dot11BssPhyType: 'int32',
  lRssi: 'int32',
  uLinkQuality: 'uint32',
  bInRegDomain: 'uint8',
  usBeaconPeriod: 'uint16',
  ullTimestamp: 'uint64',
  ullHostTimestamp: 'uint64',
  usCapabilityInformation: 'uint16',
  ulChCenterFrequency: 'uint32',
  wlanRateSet: WLAN_RATE_SET,
  ulIeOffset: 'uint32',
  ulIeSize: 'uint32'
});

// ... additional structs for interface info, connection attributes, etc.

// Function declarations
const WlanOpenHandle = wlanapi?.func('__stdcall', 'WlanOpenHandle', 'uint32', [...]);
const WlanCloseHandle = wlanapi?.func('__stdcall', 'WlanCloseHandle', 'uint32', [...]);
const WlanEnumInterfaces = wlanapi?.func('__stdcall', 'WlanEnumInterfaces', 'uint32', [...]);
const WlanGetNetworkBssList = wlanapi?.func('__stdcall', 'WlanGetNetworkBssList', 'uint32', [...]);
const WlanQueryInterface = wlanapi?.func('__stdcall', 'WlanQueryInterface', 'uint32', [...]);
const WlanFreeMemory = wlanapi?.func('__stdcall', 'WlanFreeMemory', 'void', [...]);

// Platform check
export const isWindows = process.platform === 'win32';

// High-level functions that return WifiResults[]
export async function scanNetworks(): Promise<WifiResults[]> { ... }
export async function getCurrentConnection(): Promise<WifiResults | null> { ... }
export async function getInterfaceName(): Promise<string> { ... }
```

### 2. Modify `src/lib/wifiScanner-windows.ts`

Replace netsh calls with WLAN API calls. No fallback needed because:
- koffi ships prebuilt binaries for Windows x64/arm64 (no compilation)
- wlanapi.dll is present on all Windows since Vista (2007)
- No admin permissions needed for scanning (only for connecting/settings)

```typescript
import * as wlanApi from './wlan-api';

export class WindowsWifiActions implements WifiActions {
  nameOfWifi: string = "";
  currentSSIDName: string = "";
  strongestSSID: WifiResults | null = null;

  async findWifi(): Promise<string> {
    this.nameOfWifi = await wlanApi.getInterfaceName();
    return this.nameOfWifi;
  }

  async scanWifi(_settings: PartialHeatmapSettings): Promise<WifiScanResults> {
    const networks = await wlanApi.scanNetworks();
    const current = await wlanApi.getCurrentConnection();

    // Mark current SSID
    if (current) {
      const match = networks.find(n => n.bssid === current.bssid);
      if (match) match.currentSSID = true;
    }

    return { SSIDs: networks, reason: '' };
  }

  async getWifi(_settings: PartialHeatmapSettings): Promise<WifiScanResults> {
    const current = await wlanApi.getCurrentConnection();
    if (current) {
      return { SSIDs: [current], reason: '' };
    }
    return { SSIDs: [], reason: 'Not connected' };
  }

  // preflightSettings and checkIperfServer stay the same (no netsh usage)
}
```

### 3. Data Mapping

Map Win32 API values to WifiResults:

| Win32 Field | WifiResults Field | Conversion |
|-------------|-------------------|------------|
| `dot11Ssid.ucSSID` | `ssid` | Decode UTF-8 bytes, length from uSSIDLength |
| `dot11Bssid` | `bssid` | 6 bytes → lowercase hex string "a1b2c3d4e5f6" |
| `lRssi` | `rssi` | Direct (already in dBm) |
| `lRssi` | `signalStrength` | `rssiToPercentage(lRssi)` |
| `ulChCenterFrequency` | `channel` | `frequencyToChannel(freq)` helper |
| `ulChCenterFrequency` | `band` | freq < 3000000 ? 2.4 : 5 (kHz) |
| `dot11BssPhyType` | `phyMode` | Map enum to "802.11ax", "802.11ac", etc. |
| Connection attributes | `security` | Map auth/cipher enums to string |
| Connection attributes | `txRate` | From WLAN_ASSOCIATION_ATTRIBUTES |

### 4. PHY Type Mapping

```typescript
const PHY_TYPE_MAP: Record<number, string> = {
  1: '802.11a',    // dot11_phy_type_ofdm
  2: '802.11b',    // dot11_phy_type_hrdsss
  3: '802.11g',    // dot11_phy_type_erp
  5: '802.11n',    // dot11_phy_type_ht
  6: '802.11ac',   // dot11_phy_type_vht
  8: '802.11ax',   // dot11_phy_type_he
};
```

### 5. Frequency to Channel Conversion

```typescript
function frequencyToChannel(freqKHz: number): number {
  const freqMHz = freqKHz / 1000;

  // 2.4 GHz band
  if (freqMHz >= 2412 && freqMHz <= 2484) {
    if (freqMHz === 2484) return 14;
    return Math.round((freqMHz - 2412) / 5) + 1;
  }

  // 5 GHz band
  if (freqMHz >= 5170 && freqMHz <= 5825) {
    return Math.round((freqMHz - 5000) / 5);
  }

  // 6 GHz band (Wi-Fi 6E)
  if (freqMHz >= 5955 && freqMHz <= 7115) {
    return Math.round((freqMHz - 5950) / 5);
  }

  return 0;
}
```

## Additional Structs Needed

For `WlanQueryInterface` to get current connection details:

```typescript
const WLAN_ASSOCIATION_ATTRIBUTES = koffi.struct('WLAN_ASSOCIATION_ATTRIBUTES', {
  dot11Ssid: DOT11_SSID,
  dot11BssType: 'int32',
  dot11Bssid: koffi.array('uint8', 6),
  dot11PhyType: 'int32',
  uDot11PhyIndex: 'uint32',
  wlanSignalQuality: 'uint32',   // 0-100, like percentage
  ulRxRate: 'uint32',            // in kbps
  ulTxRate: 'uint32',            // in kbps - this is txRate!
});

const WLAN_SECURITY_ATTRIBUTES = koffi.struct('WLAN_SECURITY_ATTRIBUTES', {
  bSecurityEnabled: 'int32',
  bOneXEnabled: 'int32',
  dot11AuthAlgorithm: 'int32',   // Map to security string
  dot11CipherAlgorithm: 'int32',
});

const WLAN_CONNECTION_ATTRIBUTES = koffi.struct('WLAN_CONNECTION_ATTRIBUTES', {
  isState: 'int32',
  wlanConnectionMode: 'int32',
  strProfileName: koffi.array('uint16', 256),
  wlanAssociationAttributes: WLAN_ASSOCIATION_ATTRIBUTES,
  wlanSecurityAttributes: WLAN_SECURITY_ATTRIBUTES,
});

const WLAN_INTERFACE_INFO = koffi.struct('WLAN_INTERFACE_INFO', {
  InterfaceGuid: GUID,
  strInterfaceDescription: koffi.array('uint16', 256),
  isState: 'int32',
});

const WLAN_INTERFACE_INFO_LIST = koffi.struct('WLAN_INTERFACE_INFO_LIST', {
  dwNumberOfItems: 'uint32',
  dwIndex: 'uint32',
  InterfaceInfo: koffi.array(WLAN_INTERFACE_INFO, 1), // Variable length
});
```

## Security Algorithm Mapping

```typescript
const AUTH_ALGORITHM_MAP: Record<number, string> = {
  1: 'Open',           // DOT11_AUTH_ALGO_80211_OPEN
  2: 'Shared Key',     // DOT11_AUTH_ALGO_80211_SHARED_KEY
  3: 'WPA',            // DOT11_AUTH_ALGO_WPA
  4: 'WPA-PSK',        // DOT11_AUTH_ALGO_WPA_PSK
  6: 'WPA2',           // DOT11_AUTH_ALGO_RSNA
  7: 'WPA2-Personal',  // DOT11_AUTH_ALGO_RSNA_PSK
  8: 'WPA3',           // DOT11_AUTH_ALGO_WPA3
  9: 'WPA3-Personal',  // DOT11_AUTH_ALGO_WPA3_SAE
};
```

## Verification

1. **Compile check**: Ensure TypeScript compiles without errors
2. **Non-Windows handling**: wlan-api.ts should export no-op or throw clear error on non-Windows
3. **Windows-only tests**: New test file that skips on non-Windows platforms

### New Test File: `__tests__/wlan-api.test.ts`

```typescript
import { describe, test, expect } from '@jest/globals';

const isWindows = process.platform === 'win32';

// Skip entire test suite on non-Windows
(isWindows ? describe : describe.skip)('WLAN API Integration', () => {

  test('scanNetworks returns array of WifiResults', async () => {
    const { scanNetworks } = await import('../src/lib/wlan-api');
    const networks = await scanNetworks();

    expect(Array.isArray(networks)).toBe(true);

    if (networks.length > 0) {
      const network = networks[0];
      expect(typeof network.ssid).toBe('string');
      expect(typeof network.bssid).toBe('string');
      expect(network.bssid).toMatch(/^[0-9a-f]{12}$/); // normalized MAC
      expect(typeof network.rssi).toBe('number');
      expect(network.rssi).toBeLessThan(0); // dBm is negative
      expect(network.rssi).toBeGreaterThan(-100);
      expect(typeof network.channel).toBe('number');
      expect(network.channel).toBeGreaterThan(0);
    }
  });

  test('getCurrentConnection returns WifiResults or null', async () => {
    const { getCurrentConnection } = await import('../src/lib/wlan-api');
    const current = await getCurrentConnection();

    if (current) {
      expect(typeof current.ssid).toBe('string');
      expect(typeof current.txRate).toBe('number');
      expect(current.txRate).toBeGreaterThan(0); // connected means has tx rate
    }
    // null is valid if not connected
  });

  test('getInterfaceName returns non-empty string', async () => {
    const { getInterfaceName } = await import('../src/lib/wlan-api');
    const name = await getInterfaceName();

    expect(typeof name).toBe('string');
    expect(name.length).toBeGreaterThan(0);
  });
});

// This test runs on ALL platforms
describe('WLAN API module loading', () => {
  test('module loads without error on any platform', async () => {
    await expect(import('../src/lib/wlan-api')).resolves.toBeDefined();
  });

  test('isWindows export reflects platform', async () => {
    const { isWindows: apiIsWindows } = await import('../src/lib/wlan-api');
    expect(apiIsWindows).toBe(process.platform === 'win32');
  });
});
```

### Manual testing on Windows:
- Install: `npm install`
- Run: `npm test` (Windows-only tests will execute)
- Run app, check WiFi scanning works
- Compare results with `netsh wlan show networks mode=bssid`

## Dependencies

Add to package.json:
```json
{
  "dependencies": {
    "koffi": "^2.8.0"
  }
}
```

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Struct alignment issues | Test on real Windows, compare output with netsh |
| Missing fields from API | Some fields may need different API calls |
| 32-bit Windows | koffi supports it, but less common - verify if needed |

## Implementation Order

1. Add koffi to package.json
2. Create `src/lib/wlan-api.ts` with all struct definitions and functions
3. Rewrite `wifiScanner-windows.ts` to use WLAN API (remove all netsh code)
4. Create `__tests__/wlan-api.test.ts` with Windows-only tests
5. Remove localization files and code (localization.ts, data/localization/, server-init.ts import)
6. Remove old netsh test files (__tests__/parsing/win-*.test.tsx, __tests__/data/win-*.txt)
7. Remove splitLine from utils.ts
8. Test compilation: `npm run build`
9. Run tests: `npm test` (Windows tests will skip on macOS/Linux)
10. Update issue #78 with implementation status
