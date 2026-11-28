/**
 * nearby-networks.ts - the access points a measurement heard when the survey
 * scans all access points (Settings), and the heat maps made from them.
 * Pure functions, safe on the server and in the browser.
 *
 * The connection's own reading says how well the computer hears the one
 * access point it chose. A scan hears every access point in range, on every
 * band, so it shows what each of them covers. Each point keeps its scan in
 * `nearby`; a point without one was measured with scanning off.
 *
 * A scanned map shows, at each point, the strongest signal of the access
 * points it includes. A point whose scan heard none of them counts as 0%
 * (it listened and heard nothing); a point without a scan is left out.
 */
import type { NearbyNetwork, SurveyPoint, WifiResults } from "./types";
import {
  formatMacAddress,
  isValidMacAddress,
  normalizeMacAddress,
} from "./utils";

/**
 * A scan as a point stores it: one entry per access point radio (BSSID),
 * strongest first, without what only the connection knows (tx rate, noise).
 * Entries without a BSSID can't be told apart and are left out.
 */
export function toNearbyNetworks(scan: WifiResults[]): NearbyNetwork[] {
  const byBssid = new Map<string, NearbyNetwork>();
  for (const w of scan) {
    if (!w.bssid || !isValidMacAddress(w.bssid)) continue;
    if (!Number.isFinite(w.signalStrength) || w.signalStrength <= 0) continue;
    const bssid = normalizeMacAddress(w.bssid);
    const seen = byBssid.get(bssid);
    if (seen && seen.signalStrength >= w.signalStrength) continue;
    byBssid.set(bssid, {
      ssid: w.ssid ?? "",
      bssid,
      rssi: w.rssi,
      signalStrength: w.signalStrength,
      channel: w.channel,
      band: w.band,
      channelWidth: w.channelWidth,
    });
  }
  return [...byBssid.values()].sort(
    (a, b) => b.signalStrength - a.signalStrength,
  );
}

/** Does any point have a scan? */
export function hasScans(points: readonly SurveyPoint[]): boolean {
  return points.some((p) => p.nearby !== undefined);
}

/** One access point radio, over all of a survey's scans. */
export interface ScannedAccessPoint {
  bssid: string;
  ssid: string;
  /** GHz: 2.4, 5 or 6 (0 if the system did not say) */
  band: number;
  /** every channel it was heard on, in order */
  channels: number[];
  /** the strongest signal any point heard from it, percent */
  strongest: number;
  /** the point that heard it best: the closest we know to where it is */
  strongestPointId: string;
  /** how many points heard it */
  heardAt: number;
}

/** One network (SSID) with its access points, strongest first. */
export interface ScannedNetwork {
  /** "" for networks that hide their name */
  ssid: string;
  strongest: number;
  accessPoints: ScannedAccessPoint[];
}

/**
 * Every network the survey's scans heard: strongest first, unnamed last.
 * Disabled points count too, so switching one off doesn't change the list.
 */
export function scannedNetworks(
  points: readonly SurveyPoint[],
): ScannedNetwork[] {
  const found = new Map<string, ScannedAccessPoint & { seen: Set<number> }>();
  for (const point of points) {
    for (const n of point.nearby ?? []) {
      let ap = found.get(n.bssid);
      if (!ap) {
        ap = {
          bssid: n.bssid,
          ssid: n.ssid,
          band: n.band,
          channels: [],
          strongest: 0,
          strongestPointId: point.id,
          heardAt: 0,
          seen: new Set(),
        };
        found.set(n.bssid, ap);
      }
      ap.heardAt++;
      if (n.channel) ap.seen.add(n.channel);
      // a hidden network's name can show up in a later scan
      if (!ap.ssid && n.ssid) ap.ssid = n.ssid;
      if (n.signalStrength > ap.strongest) {
        ap.strongest = n.signalStrength;
        ap.strongestPointId = point.id;
      }
    }
  }
  const networks = new Map<string, ScannedNetwork>();
  for (const { seen, ...ap } of found.values()) {
    ap.channels = [...seen].sort((a, b) => a - b);
    let network = networks.get(ap.ssid);
    if (!network) {
      network = { ssid: ap.ssid, strongest: 0, accessPoints: [] };
      networks.set(ap.ssid, network);
    }
    network.accessPoints.push(ap);
    network.strongest = Math.max(network.strongest, ap.strongest);
  }
  for (const network of networks.values()) {
    network.accessPoints.sort(
      (a, b) => b.strongest - a.strongest || a.bssid.localeCompare(b.bssid),
    );
  }
  return [...networks.values()].sort(
    (a, b) =>
      Number(a.ssid === "") - Number(b.ssid === "") ||
      b.strongest - a.strongest ||
      a.ssid.localeCompare(b.ssid),
  );
}

/**
 * The network to show first: the one most points were connected to, if the
 * scans heard it, else the strongest one. undefined without scans.
 */
export function ownNetwork(
  points: readonly SurveyPoint[],
  networks: readonly ScannedNetwork[],
): string | undefined {
  const counts = new Map<string, number>();
  for (const p of points) {
    const ssid = p.wifiData.ssid;
    if (ssid) counts.set(ssid, (counts.get(ssid) ?? 0) + 1);
  }
  const connected = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([ssid]) => ssid)
    .find((ssid) => networks.some((n) => n.ssid === ssid));
  return connected ?? networks[0]?.ssid;
}

/**
 * How a network's scanned signal is split into maps: the best of all its
 * access points, one map per band, or one per access point.
 */
export const SCAN_SPLITS = ["best", "band", "accessPoint"] as const;
export type ScanSplit = (typeof SCAN_SPLITS)[number];

/** One scanned map. */
export interface ScanMapSpec {
  /** unique within the network and split */
  id: string;
  /** what it shows: "Home", "Home, 5 GHz", "Living room" */
  label: string;
  /** the access points (BSSIDs) it takes the strongest of */
  include: Set<string>;
}

/** "Home", or "(no name)" for a hidden network. */
export function networkName(ssid: string): string {
  return ssid === "" ? "(no name)" : ssid;
}

/**
 * The maps for one network. Per access point, the radios that share an
 * access point name (a marker, or Settings > Access point names) are one
 * map; a radio without a name is its own, labelled with band and address.
 */
export function scanMapSpecs(
  network: ScannedNetwork | undefined,
  split: ScanSplit,
  apName: (bssid: string) => string | undefined = () => undefined,
): ScanMapSpec[] {
  if (!network) return [];
  const name = networkName(network.ssid);
  const specs = new Map<string, ScanMapSpec>();
  const add = (id: string, label: string, bssid: string) => {
    let spec = specs.get(id);
    if (!spec) {
      spec = { id, label, include: new Set() };
      specs.set(id, spec);
    }
    spec.include.add(bssid);
  };
  const aps =
    split === "band"
      ? [...network.accessPoints].sort((a, b) => a.band - b.band)
      : network.accessPoints;
  for (const ap of aps) {
    if (split === "best") {
      add("best", name, ap.bssid);
    } else if (split === "band") {
      add(
        `band-${ap.band}`,
        ap.band ? `${name}, ${ap.band} GHz` : `${name}, band unknown`,
        ap.bssid,
      );
    } else {
      const named = apName(ap.bssid);
      if (named) add(`name-${named}`, named, ap.bssid);
      else add(`ap-${ap.bssid}`, radioLabel(ap), ap.bssid);
    }
  }
  return [...specs.values()];
}

/** "5 GHz 9E-05-D6-96-E8-30": an access point radio nobody has named. */
export function radioLabel(ap: Pick<ScannedAccessPoint, "bssid" | "band">) {
  const mac = formatMacAddress(ap.bssid);
  return ap.band ? `${ap.band} GHz ${mac}` : mac;
}

/**
 * The value a point gives a scanned map: the strongest signal (percent) of
 * the access points in `include`, 0 if its scan heard none of them, or null
 * if the point has no scan.
 */
export function scanValue(
  point: Pick<SurveyPoint, "nearby">,
  include: ReadonlySet<string>,
): number | null {
  if (!point.nearby) return null;
  let best = 0;
  for (const n of point.nearby) {
    if (include.has(n.bssid)) best = Math.max(best, n.signalStrength);
  }
  return best;
}
