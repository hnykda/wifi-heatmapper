/**
 * wlan-api.ts - read Wi-Fi details on Windows from wlanapi.dll (the Native
 * Wifi API) through koffi. It is the only way the app reads Wi-Fi on Windows,
 * and nothing depends on the display language.
 *
 * koffi is loaded lazily, on Windows only, the first time a function here is
 * called; macOS, Linux and the unit tests never load it. If it cannot be
 * loaded the returned promise rejects with a WlanLoadError, and the Windows
 * scanner shows that error. Struct decoding lives in wlan-api-parse.ts (pure,
 * tested everywhere).
 *
 * @see https://learn.microsoft.com/en-us/windows/win32/nativewifi/native-wifi-api
 */
import type * as Koffi from "koffi";
import { WifiResults } from "./types";
import { delay } from "./server-utils";
import {
  DOT11_BSS_TYPE_ANY,
  ERROR_INVALID_STATE,
  ERROR_SUCCESS,
  WLAN_CONNECTION_ATTRIBUTES_SIZE,
  WLAN_INTERFACE_STATE_CONNECTED,
  WLAN_INTF_OPCODE,
  WlanInterface,
  availableNetworkListSize,
  bssEntriesToWifiResults,
  bssListSize,
  connectedFirst,
  connectionToWifiResults,
  decodeAvailableNetworkList,
  decodeBssList,
  decodeConnectionAttributes,
  decodeInterfaceList,
  interfaceListSize,
} from "./wlan-api-parse";

/** A WLAN API call returned a Win32 error code */
export class WlanApiError extends Error {
  constructor(
    readonly fn: string,
    readonly code: number,
  ) {
    super(`${fn} failed with error ${code}`);
    this.name = "WlanApiError";
  }
}

/** koffi or wlanapi.dll could not be loaded */
export class WlanLoadError extends Error {
  constructor(cause: unknown) {
    super(
      `koffi could not load wlanapi.dll: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
    this.name = "WlanLoadError";
  }
}

/** scanNetworks() found no Wi-Fi adapter: not a bug, nothing to scan with */
export const NO_WIFI_ADAPTER_MESSAGE = "No Wi-Fi adapter found.";

/**
 * Drivers must finish a WlanScan within 4 seconds (Windows logo
 * requirement), so wait that long rather than polling the cached list, which
 * is usually non-empty straight away and so says nothing about the new scan.
 */
const SCAN_WAIT_MS = 4000;
/** Reuse the cached list if we scanned this recently (like nmcli's default) */
const RESCAN_AFTER_MS = 30_000;
let lastScanAt = 0;

type Fn = (...args: unknown[]) => any;
interface Native {
  koffi: typeof Koffi;
  WlanOpenHandle: Fn;
  WlanCloseHandle: Fn;
  WlanFreeMemory: Fn;
  WlanEnumInterfaces: Fn;
  WlanScan: Fn;
  WlanGetNetworkBssList: Fn;
  WlanGetAvailableNetworkList: Fn;
  WlanQueryInterface: Fn;
}

let nativePromise: Promise<Native> | null = null;

/** Load koffi and wlanapi.dll once; a failure is remembered (no retries). */
export function loadWlanApi(): Promise<Native> {
  nativePromise ??= loadNative().catch((err) => {
    throw new WlanLoadError(err);
  });
  return nativePromise;
}

async function loadNative(): Promise<Native> {
  if (process.platform !== "win32") {
    throw new Error("The WLAN API is only available on Windows");
  }
  // koffi is listed in next.config.mjs serverExternalPackages, so this stays
  // a runtime import of node_modules/koffi (traced into the standalone build)
  const mod = await import("koffi");
  const koffi = ((mod as { default?: typeof Koffi }).default ??
    mod) as typeof Koffi;
  const lib = koffi.load("wlanapi.dll");
  const f = (proto: string) => lib.func(proto) as Fn;
  return {
    koffi,
    WlanOpenHandle: f(
      "uint32 __stdcall WlanOpenHandle(uint32 dwClientVersion, void *pReserved, _Out_ uint32 *pdwNegotiatedVersion, _Out_ void **phClientHandle)",
    ),
    WlanCloseHandle: f(
      "uint32 __stdcall WlanCloseHandle(void *hClientHandle, void *pReserved)",
    ),
    WlanFreeMemory: f("void __stdcall WlanFreeMemory(void *pMemory)"),
    WlanEnumInterfaces: f(
      "uint32 __stdcall WlanEnumInterfaces(void *hClientHandle, void *pReserved, _Out_ void **ppInterfaceList)",
    ),
    WlanScan: f(
      "uint32 __stdcall WlanScan(void *hClientHandle, void *pInterfaceGuid, void *pDot11Ssid, void *pIeData, void *pReserved)",
    ),
    WlanGetNetworkBssList: f(
      "uint32 __stdcall WlanGetNetworkBssList(void *hClientHandle, void *pInterfaceGuid, void *pDot11Ssid, int32 dot11BssType, int32 bSecurityEnabled, void *pReserved, _Out_ void **ppWlanBssList)",
    ),
    WlanGetAvailableNetworkList: f(
      "uint32 __stdcall WlanGetAvailableNetworkList(void *hClientHandle, void *pInterfaceGuid, uint32 dwFlags, void *pReserved, _Out_ void **ppAvailableNetworkList)",
    ),
    WlanQueryInterface: f(
      "uint32 __stdcall WlanQueryInterface(void *hClientHandle, void *pInterfaceGuid, int32 OpCode, void *pReserved, _Out_ uint32 *pdwDataSize, _Out_ void **ppData, void *pWlanOpcodeValueType)",
    ),
  };
}

function check(fn: string, code: number) {
  if (code !== ERROR_SUCCESS) throw new WlanApiError(fn, code);
}

/**
 * Copy memory the API allocated into a Buffer, then free it (exactly once,
 * whatever happens). `size` is a byte count, or computed from the first 8
 * bytes (the list header).
 */
function takeBuffer(
  api: Native,
  ptr: unknown,
  size: number | ((header: Buffer) => number),
): Buffer {
  try {
    const n =
      typeof size === "number"
        ? size
        : size(Buffer.from(api.koffi.view(ptr, 8).slice(0)));
    return Buffer.from(api.koffi.view(ptr, n).slice(0));
  } finally {
    api.WlanFreeMemory(ptr);
  }
}

/** Open a client handle, run `fn`, always close the handle. */
async function withHandle<T>(
  fn: (api: Native, handle: unknown) => Promise<T>,
): Promise<T> {
  const api = await loadWlanApi();
  const version = [0];
  const handle: unknown[] = [null];
  check("WlanOpenHandle", api.WlanOpenHandle(2, null, version, handle));
  try {
    return await fn(api, handle[0]);
  } finally {
    api.WlanCloseHandle(handle[0], null);
  }
}

function enumInterfaces(api: Native, handle: unknown): WlanInterface[] {
  const out: unknown[] = [null];
  check("WlanEnumInterfaces", api.WlanEnumInterfaces(handle, null, out));
  return decodeInterfaceList(takeBuffer(api, out[0], interfaceListSize));
}

/** The (cached) BSS list; WlanGetNetworkBssList never starts a scan. */
function bssList(api: Native, handle: unknown, iface: WlanInterface) {
  const out: unknown[] = [null];
  check(
    "WlanGetNetworkBssList",
    api.WlanGetNetworkBssList(
      handle,
      iface.guid,
      null,
      DOT11_BSS_TYPE_ANY,
      0,
      null,
      out,
    ),
  );
  return decodeBssList(takeBuffer(api, out[0], bssListSize));
}

function availableNetworks(api: Native, handle: unknown, iface: WlanInterface) {
  const out: unknown[] = [null];
  check(
    "WlanGetAvailableNetworkList",
    api.WlanGetAvailableNetworkList(handle, iface.guid, 0, null, out),
  );
  return decodeAvailableNetworkList(
    takeBuffer(api, out[0], availableNetworkListSize),
  );
}

/** WlanQueryInterface; returns the data as a Buffer */
function queryInterface(
  api: Native,
  handle: unknown,
  iface: WlanInterface,
  opcode: number,
  minSize: number,
): Buffer {
  const size = [0];
  const out: unknown[] = [null];
  check(
    "WlanQueryInterface",
    api.WlanQueryInterface(handle, iface.guid, opcode, null, size, out, null),
  );
  return takeBuffer(api, out[0], Math.max(minSize, Number(size[0]) || 0));
}

/** The connected network on `iface`, or null if it is not connected */
function connectionOn(
  api: Native,
  handle: unknown,
  iface: WlanInterface,
): WifiResults | null {
  let conn;
  try {
    conn = decodeConnectionAttributes(
      queryInterface(
        api,
        handle,
        iface,
        WLAN_INTF_OPCODE.current_connection,
        WLAN_CONNECTION_ATTRIBUTES_SIZE,
      ),
    );
  } catch (err) {
    if (err instanceof WlanApiError && err.code === ERROR_INVALID_STATE) {
      return null; // not connected
    }
    throw err;
  }
  if (conn.state !== WLAN_INTERFACE_STATE_CONNECTED) return null;

  const rssi = queryInterface(
    api,
    handle,
    iface,
    WLAN_INTF_OPCODE.rssi,
    4,
  ).readInt32LE(0);
  const channel = queryInterface(
    api,
    handle,
    iface,
    WLAN_INTF_OPCODE.channel_number,
    4,
  ).readUInt32LE(0);
  // The frequency (for the band) is only in the BSS list. Reading the cached
  // list does not scan, so it is cheap and does not disturb throughput.
  let bss;
  try {
    bss = bssList(api, handle, iface).find((e) => e.bssid === conn.bssid);
  } catch {
    bss = undefined;
  }
  return connectionToWifiResults(conn, rssi, channel, bss);
}

/**
 * The network the machine is connected to, from the first connected
 * interface. No scan. Null if no interface is connected.
 */
export async function getCurrentConnection(): Promise<WifiResults | null> {
  return withHandle(async (api, handle) => {
    for (const iface of connectedFirst(enumInterfaces(api, handle))) {
      const wifi = connectionOn(api, handle, iface);
      if (wifi) return wifi;
    }
    return null;
  });
}

/**
 * Nearby networks, one entry per BSS, strongest first. Asks the driver for a
 * fresh scan (unless one ran in the last 30 s) and waits for it to finish.
 * The connected BSS, if any, has currentSSID set.
 */
export async function scanNetworks(): Promise<WifiResults[]> {
  return withHandle(async (api, handle) => {
    const interfaces = connectedFirst(enumInterfaces(api, handle));
    const iface = interfaces[0];
    if (!iface) throw new Error(NO_WIFI_ADAPTER_MESSAGE);

    if (Date.now() - lastScanAt > RESCAN_AFTER_MS) {
      // If the scan cannot start (radio busy, say), use the cached list
      if (
        api.WlanScan(handle, iface.guid, null, null, null) === ERROR_SUCCESS
      ) {
        await delay(SCAN_WAIT_MS);
        lastScanAt = Date.now();
      }
    }

    const entries = bssList(api, handle, iface);
    const available = availableNetworks(api, handle, iface);
    const connected = connectionOn(api, handle, iface);
    return bssEntriesToWifiResults(entries, available, connected?.bssid ?? "");
  });
}
