/**
 * wlan-api.ts - Win32 Native Wifi API bindings via koffi
 *
 * This module provides direct access to wlanapi.dll on Windows,
 * eliminating the need to parse localized netsh command output.
 *
 * Only loads on Windows - other platforms get no-op functions.
 *
 * @see https://learn.microsoft.com/en-us/windows/win32/nativewifi/native-wifi-api
 */

import { WifiResults } from "./types";
import {
  getDefaultWifiResults,
  rssiToPercentage,
  channelToBand,
  bySignalStrength,
} from "./utils";

export const isWindows = process.platform === "win32";

// Type definitions for koffi - only import on Windows

type KoffiLib = {
  func: (
    convention: string,
    name: string,
    returnType: string,

    argTypes: any[],
  ) => (...args: unknown[]) => unknown;
};

type KoffiModule = {
  load: (name: string) => KoffiLib;

  struct: (name: string, definition: Record<string, any>) => unknown;

  array: (type: any, length: number) => unknown;
  pointer: (type: unknown) => unknown;
  out: (type: unknown) => unknown;
  decode: (
    buffer: unknown,
    type: unknown,
    offset?: number,
  ) => Record<string, unknown>;
};

let koffi: KoffiModule | null = null;
let wlanapi: KoffiLib | null = null;

// Struct type references
let GUID: unknown;
let DOT11_SSID: unknown;
let WLAN_INTERFACE_INFO: unknown;
let WLAN_INTERFACE_INFO_LIST: unknown;
let WLAN_BSS_ENTRY: unknown;
let WLAN_BSS_LIST: unknown;
let WLAN_ASSOCIATION_ATTRIBUTES: unknown;
let WLAN_SECURITY_ATTRIBUTES: unknown;
let WLAN_CONNECTION_ATTRIBUTES: unknown;
let WLAN_RATE_SET: unknown;

// Function references
let WlanOpenHandle: ((...args: unknown[]) => number) | null = null;
let WlanCloseHandle: ((...args: unknown[]) => number) | null = null;
let WlanEnumInterfaces: ((...args: unknown[]) => number) | null = null;
let WlanGetNetworkBssList: ((...args: unknown[]) => number) | null = null;
let WlanQueryInterface: ((...args: unknown[]) => number) | null = null;
let WlanFreeMemory: ((...args: unknown[]) => void) | null = null;

// Error codes
const ERROR_SUCCESS = 0;

// WLAN interface state enum
const WLAN_INTERFACE_STATE = {
  wlan_interface_state_connected: 1,
};

// BSS type enum
const DOT11_BSS_TYPE = {
  dot11_BSS_type_infrastructure: 1,
  dot11_BSS_type_independent: 2,
  dot11_BSS_type_any: 3,
};

// PHY type enum to string mapping
const PHY_TYPE_MAP: Record<number, string> = {
  0: "Unknown",
  1: "FHSS", // dot11_phy_type_fhss
  2: "DSSS", // dot11_phy_type_dsss
  3: "IR", // dot11_phy_type_irbaseband
  4: "802.11a", // dot11_phy_type_ofdm
  5: "802.11b", // dot11_phy_type_hrdsss
  6: "802.11g", // dot11_phy_type_erp
  7: "802.11n", // dot11_phy_type_ht
  8: "802.11ac", // dot11_phy_type_vht
  9: "802.11ad", // dot11_phy_type_dmg
  10: "802.11ax", // dot11_phy_type_he
  11: "802.11be", // dot11_phy_type_eht
};

// Auth algorithm enum to string mapping
const AUTH_ALGORITHM_MAP: Record<number, string> = {
  1: "Open", // DOT11_AUTH_ALGO_80211_OPEN
  2: "Shared Key", // DOT11_AUTH_ALGO_80211_SHARED_KEY
  3: "WPA", // DOT11_AUTH_ALGO_WPA
  4: "WPA-PSK", // DOT11_AUTH_ALGO_WPA_PSK
  5: "WPA-None", // DOT11_AUTH_ALGO_WPA_NONE
  6: "WPA2", // DOT11_AUTH_ALGO_RSNA
  7: "WPA2-Personal", // DOT11_AUTH_ALGO_RSNA_PSK
  8: "WPA3", // DOT11_AUTH_ALGO_WPA3
  9: "WPA3-Personal", // DOT11_AUTH_ALGO_WPA3_SAE
  10: "OWE", // DOT11_AUTH_ALGO_OWE
  11: "WPA3-Enterprise", // DOT11_AUTH_ALGO_WPA3_ENT
};

// Query interface opcodes
const WLAN_INTF_OPCODE = {
  wlan_intf_opcode_current_connection: 7,
};

/**
 * Initialize koffi and define all struct types.
 * Called lazily on first API use.
 */
async function initialize(): Promise<boolean> {
  if (!isWindows) return false;
  if (wlanapi !== null) return true;

  try {
    // Dynamic import koffi only on Windows
    // This will fail on non-Windows platforms since koffi has no prebuilt binary

    const koffiModule = await import(/* webpackIgnore: true */ "koffi");
    koffi = koffiModule.default as unknown as KoffiModule;

    wlanapi = koffi.load("wlanapi.dll");

    // Define structs matching Windows SDK headers
    GUID = koffi.struct("GUID", {
      Data1: "uint32",
      Data2: "uint16",
      Data3: "uint16",
      Data4: koffi.array("uint8", 8),
    });

    DOT11_SSID = koffi.struct("DOT11_SSID", {
      uSSIDLength: "uint32",
      ucSSID: koffi.array("uint8", 32),
    });

    WLAN_INTERFACE_INFO = koffi.struct("WLAN_INTERFACE_INFO", {
      InterfaceGuid: GUID,
      strInterfaceDescription: koffi.array("uint16", 256), // WCHAR[256]
      isState: "int32",
    });

    WLAN_INTERFACE_INFO_LIST = koffi.struct("WLAN_INTERFACE_INFO_LIST", {
      dwNumberOfItems: "uint32",
      dwIndex: "uint32",
      InterfaceInfo: koffi.array(WLAN_INTERFACE_INFO, 1), // Variable length
    });

    WLAN_RATE_SET = koffi.struct("WLAN_RATE_SET", {
      uRateSetLength: "uint32",
      usRateSet: koffi.array("uint16", 126),
    });

    WLAN_BSS_ENTRY = koffi.struct("WLAN_BSS_ENTRY", {
      dot11Ssid: DOT11_SSID,
      uPhyId: "uint32",
      dot11Bssid: koffi.array("uint8", 6),
      dot11BssType: "int32",
      dot11BssPhyType: "int32",
      lRssi: "int32",
      uLinkQuality: "uint32",
      bInRegDomain: "uint8",
      usBeaconPeriod: "uint16",
      ullTimestamp: "uint64",
      ullHostTimestamp: "uint64",
      usCapabilityInformation: "uint16",
      ulChCenterFrequency: "uint32",
      wlanRateSet: WLAN_RATE_SET,
      ulIeOffset: "uint32",
      ulIeSize: "uint32",
    });

    WLAN_BSS_LIST = koffi.struct("WLAN_BSS_LIST", {
      dwTotalSize: "uint32",
      dwNumberOfItems: "uint32",
      wlanBssEntries: koffi.array(WLAN_BSS_ENTRY, 1), // Variable length
    });

    WLAN_ASSOCIATION_ATTRIBUTES = koffi.struct("WLAN_ASSOCIATION_ATTRIBUTES", {
      dot11Ssid: DOT11_SSID,
      dot11BssType: "int32",
      dot11Bssid: koffi.array("uint8", 6),
      dot11PhyType: "int32",
      uDot11PhyIndex: "uint32",
      wlanSignalQuality: "uint32",
      ulRxRate: "uint32",
      ulTxRate: "uint32",
    });

    WLAN_SECURITY_ATTRIBUTES = koffi.struct("WLAN_SECURITY_ATTRIBUTES", {
      bSecurityEnabled: "int32",
      bOneXEnabled: "int32",
      dot11AuthAlgorithm: "int32",
      dot11CipherAlgorithm: "int32",
    });

    WLAN_CONNECTION_ATTRIBUTES = koffi.struct("WLAN_CONNECTION_ATTRIBUTES", {
      isState: "int32",
      wlanConnectionMode: "int32",
      strProfileName: koffi.array("uint16", 256), // WCHAR[256]
      wlanAssociationAttributes: WLAN_ASSOCIATION_ATTRIBUTES,
      wlanSecurityAttributes: WLAN_SECURITY_ATTRIBUTES,
    });

    // Define function signatures

    const koffiAny = koffi as any;
    WlanOpenHandle = wlanapi.func("__stdcall", "WlanOpenHandle", "uint32", [
      "uint32",
      "void*",
      koffiAny.out(koffiAny.pointer("uint32")),
      "void**",
    ]) as (...args: unknown[]) => number;

    WlanCloseHandle = wlanapi.func("__stdcall", "WlanCloseHandle", "uint32", [
      "void*",
      "void*",
    ]) as (...args: unknown[]) => number;

    WlanEnumInterfaces = wlanapi.func(
      "__stdcall",
      "WlanEnumInterfaces",
      "uint32",
      ["void*", "void*", "void**"],
    ) as (...args: unknown[]) => number;

    WlanGetNetworkBssList = wlanapi.func(
      "__stdcall",
      "WlanGetNetworkBssList",
      "uint32",
      [
        "void*", // hClientHandle
        koffiAny.pointer(GUID), // pInterfaceGuid
        "void*", // pDot11Ssid (NULL for all)
        "int32", // dot11BssType
        "uint8", // bSecurityEnabled
        "void*", // pReserved
        "void**", // ppWlanBssList
      ],
    ) as (...args: unknown[]) => number;

    WlanQueryInterface = wlanapi.func(
      "__stdcall",
      "WlanQueryInterface",
      "uint32",
      [
        "void*", // hClientHandle
        koffiAny.pointer(GUID), // pInterfaceGuid
        "int32", // OpCode
        "void*", // pReserved
        koffiAny.out(koffiAny.pointer("uint32")), // pdwDataSize
        "void**", // ppData
        "void*", // pWlanOpcodeValueType
      ],
    ) as (...args: unknown[]) => number;

    WlanFreeMemory = wlanapi.func("__stdcall", "WlanFreeMemory", "void", [
      "void*",
    ]) as (...args: unknown[]) => void;

    return true;
  } catch (error) {
    console.error("Failed to initialize WLAN API:", error);
    return false;
  }
}

/**
 * Convert frequency in kHz to WiFi channel number
 */
function frequencyToChannel(freqKHz: number): number {
  const freqMHz = freqKHz / 1000;

  // 2.4 GHz band (channels 1-14)
  if (freqMHz >= 2412 && freqMHz <= 2484) {
    if (freqMHz === 2484) return 14;
    return Math.round((freqMHz - 2412) / 5) + 1;
  }

  // 5 GHz band (channels 36-165)
  if (freqMHz >= 5170 && freqMHz <= 5825) {
    return Math.round((freqMHz - 5000) / 5);
  }

  // 6 GHz band (Wi-Fi 6E, channels 1-233)
  if (freqMHz >= 5955 && freqMHz <= 7115) {
    return Math.round((freqMHz - 5950) / 5);
  }

  return 0;
}

/**
 * Convert 6-byte MAC address to normalized string (lowercase, no separators)
 */
function macBytesToString(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Decode SSID bytes to string
 */
function ssidBytesToString(bytes: number[], length: number): string {
  const validBytes = bytes.slice(0, length);
  return Buffer.from(validBytes).toString("utf8");
}

/**
 * Decode wide string (UTF-16LE) to string
 */
function wcharToString(wchars: number[]): string {
  // Find null terminator
  const nullIndex = wchars.indexOf(0);
  const chars = nullIndex >= 0 ? wchars.slice(0, nullIndex) : wchars;
  return String.fromCharCode(...chars);
}

/**
 * Open a handle to the WLAN API
 */
async function openHandle(): Promise<{
  handle: unknown;
  version: number;
} | null> {
  if (!(await initialize()) || !WlanOpenHandle) return null;

  const versionOut = [0];
  const handleOut = [null];

  const result = WlanOpenHandle(2, null, versionOut, handleOut);
  if (result !== ERROR_SUCCESS) {
    return null;
  }

  return { handle: handleOut[0], version: versionOut[0] as number };
}

/**
 * Get the first wireless interface GUID and description
 */
async function getFirstInterface(): Promise<{
  guid: unknown;
  description: string;
} | null> {
  if (!koffi) return null;

  const session = await openHandle();
  if (!session) return null;

  try {
    const listOut = [null];
    const result = WlanEnumInterfaces!(session.handle, null, listOut);
    if (result !== ERROR_SUCCESS || !listOut[0]) {
      return null;
    }

    try {
      const list = koffi.decode(listOut[0], WLAN_INTERFACE_INFO_LIST) as Record<
        string,
        unknown
      >;
      const count = list.dwNumberOfItems as number;
      if (count === 0) return null;

      // Get first interface
      const interfaces = list.InterfaceInfo as Record<string, unknown>[];
      const firstIface = interfaces[0];

      return {
        guid: firstIface.InterfaceGuid,
        description: wcharToString(
          firstIface.strInterfaceDescription as number[],
        ),
      };
    } finally {
      WlanFreeMemory!(listOut[0]);
    }
  } finally {
    WlanCloseHandle!(session.handle, null);
  }
}

/**
 * Scan for available WiFi networks
 * @returns Array of WifiResults sorted by signal strength
 */
export async function scanNetworks(): Promise<WifiResults[]> {
  if (!isWindows) {
    throw new Error("WLAN API is only available on Windows");
  }

  if (!koffi || !(await initialize())) {
    throw new Error("Failed to initialize WLAN API");
  }

  const session = await openHandle();
  if (!session) {
    throw new Error("Failed to open WLAN handle");
  }

  try {
    const iface = await getFirstInterface();
    if (!iface) {
      throw new Error("No wireless interface found");
    }

    const listOut = [null];
    const result = WlanGetNetworkBssList!(
      session.handle,
      iface.guid,
      null, // All SSIDs
      DOT11_BSS_TYPE.dot11_BSS_type_any,
      0, // Don't filter by security
      null,
      listOut,
    );

    if (result !== ERROR_SUCCESS || !listOut[0]) {
      throw new Error(`WlanGetNetworkBssList failed with error ${result}`);
    }

    try {
      const bssList = koffi.decode(listOut[0], WLAN_BSS_LIST) as Record<
        string,
        unknown
      >;
      const count = bssList.dwNumberOfItems as number;
      const results: WifiResults[] = [];

      // Get the array of BSS entries
      const entries = bssList.wlanBssEntries as Record<string, unknown>[];

      for (let i = 0; i < count; i++) {
        const entry = entries[i];
        const ssidData = entry.dot11Ssid as Record<string, unknown>;
        const ssid = ssidBytesToString(
          ssidData.ucSSID as number[],
          ssidData.uSSIDLength as number,
        );

        // Skip hidden networks (empty SSID)
        if (!ssid) continue;

        const rssi = entry.lRssi as number;
        const freqKHz = entry.ulChCenterFrequency as number;
        const channel = frequencyToChannel(freqKHz);
        const phyType = entry.dot11BssPhyType as number;

        const wifi = getDefaultWifiResults();
        wifi.ssid = ssid;
        wifi.bssid = macBytesToString(entry.dot11Bssid as number[]);
        wifi.rssi = rssi;
        wifi.signalStrength = rssiToPercentage(rssi);
        wifi.channel = channel;
        wifi.band = channelToBand(channel);
        wifi.phyMode = PHY_TYPE_MAP[phyType] || "Unknown";
        // Note: Security info not available from BSS list, need WlanGetAvailableNetworkList
        wifi.security = "";

        results.push(wifi);
      }

      return results.sort(bySignalStrength);
    } finally {
      WlanFreeMemory!(listOut[0]);
    }
  } finally {
    WlanCloseHandle!(session.handle, null);
  }
}

/**
 * Get currently connected WiFi network info
 * @returns WifiResults for current connection, or null if not connected
 */
export async function getCurrentConnection(): Promise<WifiResults | null> {
  if (!isWindows) {
    throw new Error("WLAN API is only available on Windows");
  }

  if (!koffi || !(await initialize())) {
    throw new Error("Failed to initialize WLAN API");
  }

  const session = await openHandle();
  if (!session) {
    throw new Error("Failed to open WLAN handle");
  }

  try {
    const iface = await getFirstInterface();
    if (!iface) {
      throw new Error("No wireless interface found");
    }

    const sizeOut = [0];
    const dataOut = [null];

    const result = WlanQueryInterface!(
      session.handle,
      iface.guid,
      WLAN_INTF_OPCODE.wlan_intf_opcode_current_connection,
      null,
      sizeOut,
      dataOut,
      null,
    );

    if (result !== ERROR_SUCCESS || !dataOut[0]) {
      // Not connected or query failed
      return null;
    }

    try {
      const connAttrs = koffi.decode(
        dataOut[0],
        WLAN_CONNECTION_ATTRIBUTES,
      ) as Record<string, unknown>;

      // Check if actually connected
      if (
        connAttrs.isState !==
        WLAN_INTERFACE_STATE.wlan_interface_state_connected
      ) {
        return null;
      }

      const assocAttrs = connAttrs.wlanAssociationAttributes as Record<
        string,
        unknown
      >;
      const secAttrs = connAttrs.wlanSecurityAttributes as Record<
        string,
        unknown
      >;
      const ssidData = assocAttrs.dot11Ssid as Record<string, unknown>;

      const ssid = ssidBytesToString(
        ssidData.ucSSID as number[],
        ssidData.uSSIDLength as number,
      );

      const signalQuality = assocAttrs.wlanSignalQuality as number; // 0-100
      const txRateKbps = assocAttrs.ulTxRate as number;
      const phyType = assocAttrs.dot11PhyType as number;
      const authAlgo = secAttrs.dot11AuthAlgorithm as number;

      const wifi = getDefaultWifiResults();
      wifi.ssid = ssid;
      wifi.bssid = macBytesToString(assocAttrs.dot11Bssid as number[]);
      wifi.signalStrength = signalQuality;
      wifi.rssi = Math.round(-100 + (signalQuality / 100) * 60); // Convert quality to approx RSSI
      wifi.txRate = Math.round(txRateKbps / 1000); // Convert kbps to Mbps
      wifi.phyMode = PHY_TYPE_MAP[phyType] || "Unknown";
      wifi.security = AUTH_ALGORITHM_MAP[authAlgo] || "Unknown";
      wifi.currentSSID = true;

      // Note: Channel not directly available from connection attributes
      // Would need to cross-reference with BSS list
      // For now, leave as 0 and let caller fill in from scan if needed

      return wifi;
    } finally {
      WlanFreeMemory!(dataOut[0]);
    }
  } finally {
    WlanCloseHandle!(session.handle, null);
  }
}

/**
 * Get the name of the wireless interface
 * @returns Interface description string
 */
export async function getInterfaceName(): Promise<string> {
  if (!isWindows) {
    throw new Error("WLAN API is only available on Windows");
  }

  const iface = await getFirstInterface();
  if (!iface) {
    throw new Error("No wireless interface found");
  }

  return iface.description;
}
