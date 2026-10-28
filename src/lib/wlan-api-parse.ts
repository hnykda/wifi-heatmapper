/**
 * wlan-api-parse.ts - decode the structs the Windows Native Wifi API
 * (wlanapi.dll) returns, and turn them into WifiResults.
 *
 * Pure functions over Buffers, no koffi and no I/O, so they run (and are
 * tested) on every platform. wlan-api.ts copies the native memory into a
 * Buffer, frees it, and hands the copy to these functions.
 *
 * Offsets follow the x64 / arm64 layout of the Windows SDK headers
 * (wlanapi.h, windot11.h). All the structs used here only contain 4-byte
 * fields, byte arrays and (in WLAN_BSS_ENTRY) two 8-byte timestamps, so the
 * layout is the same on 32-bit Windows.
 *
 * @see https://learn.microsoft.com/en-us/windows/win32/nativewifi/native-wifi-api-reference
 */
import { WifiResults } from "./types";
import { bySignalStrength, getDefaultWifiResults } from "./utils";

// Win32 error codes the API returns
export const ERROR_SUCCESS = 0;
export const ERROR_ACCESS_DENIED = 5;
/** WlanQueryInterface(current_connection) on an interface that is not connected */
export const ERROR_INVALID_STATE = 5023;

/** WLAN_INTERFACE_STATE */
export const WLAN_INTERFACE_STATE_CONNECTED = 1;

/** DOT11_BSS_TYPE */
export const DOT11_BSS_TYPE_INFRASTRUCTURE = 1;
export const DOT11_BSS_TYPE_ANY = 3;

/** WLAN_INTF_OPCODE values passed to WlanQueryInterface */
export const WLAN_INTF_OPCODE = {
  current_connection: 7, // WLAN_CONNECTION_ATTRIBUTES
  channel_number: 8, // ULONG
  rssi: 0x10000102, // LONG, dBm
} as const;

// sizeof() of the structs, and the offset of the first array element in
// the *_LIST structs (two DWORDs, then the array)
export const WLAN_INTERFACE_INFO_SIZE = 532;
export const WLAN_BSS_ENTRY_SIZE = 360;
export const WLAN_AVAILABLE_NETWORK_SIZE = 628;
export const WLAN_CONNECTION_ATTRIBUTES_SIZE = 604;
export const LIST_HEADER_SIZE = 8;

/** DOT11_PHY_TYPE -> the names netsh uses */
const PHY_TYPE_NAMES: Record<number, string> = {
  1: "FHSS",
  2: "DSSS",
  3: "IR",
  4: "802.11a",
  5: "802.11b",
  6: "802.11g",
  7: "802.11n",
  8: "802.11ac",
  9: "802.11ad",
  10: "802.11ax",
  11: "802.11be",
};

/** DOT11_AUTH_ALGORITHM -> the names netsh uses */
const AUTH_ALGORITHM_NAMES: Record<number, string> = {
  1: "Open",
  2: "Shared",
  3: "WPA-Enterprise",
  4: "WPA-Personal",
  5: "WPA-None",
  6: "WPA2-Enterprise",
  7: "WPA2-Personal",
  8: "WPA3-Enterprise 192 Bits",
  9: "WPA3-Personal",
  10: "OWE",
  11: "WPA3-Enterprise",
};

export function phyTypeName(phyType: number): string {
  return PHY_TYPE_NAMES[phyType] ?? "";
}

export function authAlgorithmName(algorithm: number): string {
  return AUTH_ALGORITHM_NAMES[algorithm] ?? "";
}

/** An interface from WlanEnumInterfaces (WLAN_INTERFACE_INFO) */
export interface WlanInterface {
  guid: Buffer; // 16 bytes, passed back to the API as-is
  description: string;
  state: number; // WLAN_INTERFACE_STATE
}

/** One BSS from WlanGetNetworkBssList (WLAN_BSS_ENTRY) */
export interface WlanBssEntry {
  ssid: string;
  bssid: string; // 12 lowercase hex digits, no separators
  bssType: number;
  phyType: number;
  rssi: number; // dBm
  linkQuality: number; // 0-100, what netsh calls "Signal"
  centerFrequencyKHz: number;
}

/** One network from WlanGetAvailableNetworkList (WLAN_AVAILABLE_NETWORK) */
export interface WlanAvailableNetwork {
  ssid: string;
  bssType: number;
  signalQuality: number;
  securityEnabled: boolean;
  authAlgorithm: number;
}

/** WLAN_CONNECTION_ATTRIBUTES from WlanQueryInterface(current_connection) */
export interface WlanConnection {
  state: number;
  profileName: string;
  ssid: string;
  bssid: string;
  phyType: number;
  signalQuality: number; // 0-100
  rxRateKbps: number;
  txRateKbps: number;
  securityEnabled: boolean;
  authAlgorithm: number;
}

/** WCHAR[] (UTF-16LE), up to the first NUL */
function readWideString(buf: Buffer, offset: number, chars: number): string {
  const s = buf.toString("utf16le", offset, offset + chars * 2);
  const nul = s.indexOf("\0");
  return nul >= 0 ? s.slice(0, nul) : s;
}

/** DOT11_SSID: ULONG uSSIDLength; UCHAR ucSSID[32] (36 bytes) */
function readSsid(buf: Buffer, offset: number): string {
  const length = Math.min(buf.readUInt32LE(offset), 32);
  return buf.toString("utf8", offset + 4, offset + 4 + length);
}

/** DOT11_MAC_ADDRESS (6 bytes) as "0123456789ab" */
function readMac(buf: Buffer, offset: number): string {
  return buf.subarray(offset, offset + 6).toString("hex");
}

/** Bytes to copy for a WLAN_INTERFACE_INFO_LIST, given its first 8 bytes */
export function interfaceListSize(header: Buffer): number {
  return LIST_HEADER_SIZE + header.readUInt32LE(0) * WLAN_INTERFACE_INFO_SIZE;
}

/** Bytes to copy for a WLAN_BSS_LIST, given its first 8 bytes */
export function bssListSize(header: Buffer): number {
  return header.readUInt32LE(0); // dwTotalSize
}

/** Bytes to copy for a WLAN_AVAILABLE_NETWORK_LIST, given its first 8 bytes */
export function availableNetworkListSize(header: Buffer): number {
  return (
    LIST_HEADER_SIZE + header.readUInt32LE(0) * WLAN_AVAILABLE_NETWORK_SIZE
  );
}

/** WLAN_INTERFACE_INFO_LIST */
export function decodeInterfaceList(buf: Buffer): WlanInterface[] {
  const count = buf.readUInt32LE(0);
  const result: WlanInterface[] = [];
  for (let i = 0; i < count; i++) {
    const o = LIST_HEADER_SIZE + i * WLAN_INTERFACE_INFO_SIZE;
    result.push({
      guid: Buffer.from(buf.subarray(o, o + 16)),
      description: readWideString(buf, o + 16, 256),
      state: buf.readInt32LE(o + 528),
    });
  }
  return result;
}

/** WLAN_BSS_LIST */
export function decodeBssList(buf: Buffer): WlanBssEntry[] {
  const count = buf.readUInt32LE(4);
  const result: WlanBssEntry[] = [];
  for (let i = 0; i < count; i++) {
    const o = LIST_HEADER_SIZE + i * WLAN_BSS_ENTRY_SIZE;
    result.push({
      ssid: readSsid(buf, o),
      bssid: readMac(buf, o + 40),
      bssType: buf.readInt32LE(o + 48),
      phyType: buf.readInt32LE(o + 52),
      rssi: buf.readInt32LE(o + 56),
      linkQuality: buf.readUInt32LE(o + 60),
      centerFrequencyKHz: buf.readUInt32LE(o + 92),
    });
  }
  return result;
}

/** WLAN_AVAILABLE_NETWORK_LIST */
export function decodeAvailableNetworkList(
  buf: Buffer,
): WlanAvailableNetwork[] {
  const count = buf.readUInt32LE(0);
  const result: WlanAvailableNetwork[] = [];
  for (let i = 0; i < count; i++) {
    const o = LIST_HEADER_SIZE + i * WLAN_AVAILABLE_NETWORK_SIZE;
    result.push({
      ssid: readSsid(buf, o + 512),
      bssType: buf.readInt32LE(o + 548),
      signalQuality: buf.readUInt32LE(o + 604),
      securityEnabled: buf.readInt32LE(o + 608) !== 0,
      authAlgorithm: buf.readInt32LE(o + 612),
    });
  }
  return result;
}

/** WLAN_CONNECTION_ATTRIBUTES */
export function decodeConnectionAttributes(buf: Buffer): WlanConnection {
  // WLAN_ASSOCIATION_ATTRIBUTES starts at 520, WLAN_SECURITY_ATTRIBUTES at 588
  return {
    state: buf.readInt32LE(0),
    profileName: readWideString(buf, 8, 256),
    ssid: readSsid(buf, 520),
    bssid: readMac(buf, 560),
    phyType: buf.readInt32LE(568),
    signalQuality: buf.readUInt32LE(576),
    rxRateKbps: buf.readUInt32LE(580),
    txRateKbps: buf.readUInt32LE(584),
    securityEnabled: buf.readInt32LE(588) !== 0,
    authAlgorithm: buf.readInt32LE(596),
  };
}

/** Center frequency (kHz) -> band in GHz (2.4, 5 or 6), 0 if unknown */
export function frequencyToBand(freqKHz: number): number {
  const mhz = freqKHz / 1000;
  if (mhz >= 2400 && mhz < 2500) return 2.4;
  if (mhz >= 4900 && mhz < 5925) return 5;
  if (mhz >= 5925 && mhz < 7125) return 6;
  return 0;
}

/** Center frequency (kHz) -> channel number, 0 if unknown */
export function frequencyToChannel(freqKHz: number): number {
  const mhz = Math.round(freqKHz / 1000);
  switch (frequencyToBand(freqKHz)) {
    case 2.4:
      return mhz === 2484 ? 14 : Math.round((mhz - 2407) / 5);
    case 5:
      return Math.round((mhz - 5000) / 5);
    case 6:
      return mhz === 5935 ? 2 : Math.round((mhz - 5950) / 5);
    default:
      return 0;
  }
}

/**
 * The interfaces to try, connected ones first (a machine can have a second,
 * idle adapter, e.g. a USB dongle; enumeration order says nothing).
 */
export function connectedFirst(interfaces: WlanInterface[]): WlanInterface[] {
  return [...interfaces].sort(
    (a, b) =>
      Number(b.state === WLAN_INTERFACE_STATE_CONNECTED) -
      Number(a.state === WLAN_INTERFACE_STATE_CONNECTED),
  );
}

/**
 * The scan list: one WifiResults per BSS, hidden networks left out, security
 * taken from the available-network list (matched by SSID), strongest first.
 */
export function bssEntriesToWifiResults(
  entries: WlanBssEntry[],
  available: WlanAvailableNetwork[],
  connectedBssid = "",
): WifiResults[] {
  const securityBySsid = new Map<string, string>();
  for (const net of available) {
    if (net.ssid && !securityBySsid.has(net.ssid)) {
      securityBySsid.set(net.ssid, authAlgorithmName(net.authAlgorithm));
    }
  }
  const results: WifiResults[] = [];
  for (const entry of entries) {
    if (!entry.ssid) continue; // hidden network
    const wifi = getDefaultWifiResults();
    wifi.ssid = entry.ssid;
    wifi.bssid = entry.bssid;
    wifi.rssi = entry.rssi;
    wifi.signalStrength = entry.linkQuality;
    wifi.channel = frequencyToChannel(entry.centerFrequencyKHz);
    wifi.band = frequencyToBand(entry.centerFrequencyKHz);
    wifi.phyMode = phyTypeName(entry.phyType);
    wifi.security = securityBySsid.get(entry.ssid) ?? "";
    wifi.currentSSID = connectedBssid !== "" && entry.bssid === connectedBssid;
    results.push(wifi);
  }
  return results.sort(bySignalStrength);
}

/**
 * The current connection as WifiResults.
 * @param rssi - from WlanQueryInterface(rssi), dBm
 * @param channel - from WlanQueryInterface(channel_number)
 * @param bss - the connected BSS from the (cached) BSS list, if found: the
 *   only place that has the frequency, and so the band (6 GHz channel
 *   numbers overlap the 2.4 and 5 GHz ones)
 */
export function connectionToWifiResults(
  conn: WlanConnection,
  rssi: number,
  channel: number,
  bss?: WlanBssEntry,
): WifiResults {
  const wifi = getDefaultWifiResults();
  wifi.ssid = conn.ssid;
  wifi.bssid = conn.bssid;
  wifi.signalStrength = conn.signalQuality;
  wifi.rssi = rssi;
  wifi.txRate = Math.round(conn.txRateKbps / 1000);
  wifi.phyMode = phyTypeName(conn.phyType);
  wifi.security = authAlgorithmName(conn.authAlgorithm);
  wifi.currentSSID = true;
  if (bss && bss.centerFrequencyKHz) {
    wifi.channel = frequencyToChannel(bss.centerFrequencyKHz);
    wifi.band = frequencyToBand(bss.centerFrequencyKHz);
  } else {
    wifi.channel = channel;
    // without a frequency, guess the way netsh-based code always has
    wifi.band = channel === 0 ? 0 : channel <= 14 ? 2.4 : 5;
  }
  return wifi;
}
