/**
 * macos-helper-parse.ts - turn the JSON printed by the macOS Wi-Fi helper
 * (native/macos-wifi-helper) into WifiResults. Pure functions, no I/O, so
 * they are tested against fixtures in __tests__/data/mac-helper-*.json.
 *
 * The helper prints one JSON document per command:
 *   info       { locationAuthorized, locationStatus, interface: {...} }
 *   scan       { ..., interface: {...}, networks: [{...}, ...] }
 *   status     { locationAuthorized, locationStatus, ... }
 *   authorize  { statusBefore, prompted, locationAuthorized, locationStatus }
 * Any of them may instead be { error: "..." }.
 *
 * SSID and BSSID are null until the helper app has Location permission.
 */
import { WifiResults } from "./types";
import {
  bySignalStrength,
  getDefaultWifiResults,
  normalizeMacAddress,
  rssiToPercentage,
} from "./utils";

/** One network as the helper reports it (interface or scan entry). */
export interface HelperNetwork {
  ssid?: string | null;
  bssid?: string | null;
  rssi?: number | null;
  noise?: number | null;
  channel?: number | null;
  band?: number | null; // GHz: 2.4, 5 or 6
  channelWidth?: number | null; // MHz
  txRate?: number | null; // Mbps (interface only)
  phyMode?: string | null; // e.g. "802.11ax" (interface only)
  security?: string | null;
  // interface only
  name?: string | null;
  powerOn?: boolean;
  associated?: boolean;
}

export interface HelperDocument {
  error?: string;
  helperVersion?: number;
  locationAuthorized?: boolean;
  locationStatus?: string;
  locationServicesEnabled?: boolean;
  interface?: HelperNetwork;
  networks?: HelperNetwork[];
  statusBefore?: string;
  prompted?: boolean;
}

/** What the server needs to know about Location permission. */
export interface HelperLocation {
  locationAuthorized: boolean;
  /** notDetermined | denied | restricted | authorized | unknown */
  locationStatus: string;
  locationServicesEnabled: boolean;
}

export interface HelperInfo extends HelperLocation {
  wifi: WifiResults;
  interfaceName: string;
  /** false when Wi-Fi is off or not joined to a network */
  associated: boolean;
  noise: number | null;
}

export interface HelperScan extends HelperLocation {
  /** sorted by signal strength; the joined network has currentSSID: true */
  networks: WifiResults[];
}

/**
 * parseHelperDocument - JSON text (or an already-parsed object) to a
 * HelperDocument. Throws with the helper's own message if it reported an
 * error, or if the output is not a helper document at all.
 */
export function parseHelperDocument(input: string | object): HelperDocument {
  let doc: unknown;
  if (typeof input === "string") {
    try {
      doc = JSON.parse(input);
    } catch {
      throw new Error(
        `The Wi-Fi helper printed something that is not JSON: ${input.slice(0, 200)}`,
      );
    }
  } else {
    doc = input;
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error("The Wi-Fi helper printed an unexpected result.");
  }
  const d = doc as HelperDocument;
  if (typeof d.error === "string" && d.error) {
    throw new Error(`Wi-Fi helper: ${d.error}`);
  }
  return d;
}

export function parseHelperLocation(input: string | object): HelperLocation {
  const doc = parseHelperDocument(input);
  return locationOf(doc);
}

function locationOf(doc: HelperDocument): HelperLocation {
  return {
    locationAuthorized: doc.locationAuthorized === true,
    locationStatus: doc.locationStatus ?? "unknown",
    locationServicesEnabled: doc.locationServicesEnabled !== false,
  };
}

const num = (v: number | null | undefined): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;

/**
 * helperNetworkToWifiResults - one helper network to WifiResults.
 * Missing SSID/BSSID (no Location permission) become "", which the UI shows
 * as "not available". BSSIDs are normalized like everywhere else
 * ("9e05d696e830"), so access point names still match.
 */
export function helperNetworkToWifiResults(
  net: HelperNetwork,
  currentSSID = false,
): WifiResults {
  const rssi = num(net.rssi);
  return {
    ...getDefaultWifiResults(),
    ssid: net.ssid ?? "",
    bssid: net.bssid ? normalizeMacAddress(net.bssid) : "",
    rssi,
    signalStrength: rssiToPercentage(rssi),
    channel: num(net.channel),
    band: num(net.band),
    channelWidth: num(net.channelWidth),
    txRate: num(net.txRate),
    phyMode: net.phyMode ?? "",
    security: net.security ?? "",
    currentSSID,
  };
}

/** parseHelperInfo - output of `WiFiHeatmapperHelper info`. */
export function parseHelperInfo(input: string | object): HelperInfo {
  const doc = parseHelperDocument(input);
  const iface = doc.interface;
  if (!iface || typeof iface !== "object") {
    throw new Error("The Wi-Fi helper did not report a Wi-Fi interface.");
  }
  const associated =
    iface.associated ?? (num(iface.rssi) !== 0 && num(iface.channel) !== 0);
  return {
    ...locationOf(doc),
    wifi: helperNetworkToWifiResults(iface, true),
    interfaceName: iface.name ?? "",
    associated: iface.powerOn !== false && associated,
    noise: typeof iface.noise === "number" ? iface.noise : null,
  };
}

/**
 * parseHelperScan - output of `WiFiHeatmapperHelper scan`.
 * The joined network (from "interface") replaces its scan entry, because it
 * also knows the tx rate and PHY mode. Without Location permission the BSSID
 * is unknown, so the entry on the same channel with the closest RSSI is
 * taken to be the joined one.
 */
export function parseHelperScan(input: string | object): HelperScan {
  const doc = parseHelperDocument(input);
  const networks = (Array.isArray(doc.networks) ? doc.networks : [])
    .filter((n) => n && typeof n === "object")
    .map((n) => helperNetworkToWifiResults(n));

  const iface = doc.interface;
  const joined =
    iface &&
    iface.powerOn !== false &&
    (iface.associated ?? num(iface.channel) !== 0)
      ? helperNetworkToWifiResults(iface, true)
      : null;

  if (joined) {
    let match = -1;
    if (joined.bssid) {
      match = networks.findIndex((n) => n.bssid === joined.bssid);
    } else {
      let best = Infinity;
      networks.forEach((n, i) => {
        const delta = Math.abs(n.rssi - joined.rssi);
        if (n.channel === joined.channel && delta < best && delta <= 4) {
          best = delta;
          match = i;
        }
      });
    }
    if (match >= 0) {
      // keep the scan's SSID if the interface had none (it never does
      // without Location permission, but be safe)
      networks[match] = {
        ...joined,
        ssid: joined.ssid || networks[match].ssid,
      };
    } else {
      networks.push(joined);
    }
  }

  return { ...locationOf(doc), networks: networks.sort(bySignalStrength) };
}
