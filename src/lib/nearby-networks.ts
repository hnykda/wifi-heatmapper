/**
 * nearby-networks.ts - the access points a measurement heard when it scanned
 * for nearby networks (Settings > Scan nearby networks), and the heat maps
 * made from them. Pure functions, safe on the server and in the browser.
 *
 * A scan lists every access point in range, on every band, whether or not
 * the computer is connected. Each point keeps its scan in `nearby`; a point
 * measured while not connected to Wi-Fi has only the scan (isScanOnly()).
 *
 * The Heat maps tab draws a report per band (nearbyReports in the survey):
 * the access points it includes, as one map, a map per network (SSID) or a
 * map per access point. A map shows, at each point, the strongest signal of
 * its access points; a point whose scan heard none of them is 0%: it was
 * scanned and heard nothing from them.
 */
import type { NearbyNetwork, SurveyPoint, WifiResults } from "./types";
import { formatMacAddress } from "./utils";

/** The bands a scan can report, in GHz. */
export const NEARBY_BANDS = [2.4, 5, 6] as const;
export type NearbyBand = (typeof NEARBY_BANDS)[number];

/** How a network without a name (hidden, or name not readable) is listed. */
export const UNNAMED_NETWORK = "";

/**
 * One scan entry as stored: the scanner's results without what only the
 * connection has (speed, PHY mode, noise). One entry per access point
 * (BSSID); when a scanner lists one twice, the stronger one is kept.
 * Strongest first.
 */
export function toNearbyNetworks(scan: WifiResults[]): NearbyNetwork[] {
  const byBssid = new Map<string, NearbyNetwork>();
  const unnamed: NearbyNetwork[] = []; // no BSSID (macOS without Location)
  for (const w of scan) {
    if (!Number.isFinite(w.signalStrength) || w.signalStrength <= 0) continue;
    const entry: NearbyNetwork = {
      ssid: w.ssid ?? "",
      bssid: w.bssid ?? "",
      rssi: w.rssi,
      signalStrength: w.signalStrength,
      channel: w.channel,
      band: w.band,
      channelWidth: w.channelWidth,
      security: w.security ?? "",
    };
    if (!entry.bssid) {
      unnamed.push(entry);
      continue;
    }
    const seen = byBssid.get(entry.bssid);
    if (!seen || seen.signalStrength < entry.signalStrength) {
      byBssid.set(entry.bssid, entry);
    }
  }
  return [...byBssid.values(), ...unnamed].sort(
    (a, b) => b.signalStrength - a.signalStrength,
  );
}

/** Did this point scan for nearby networks? */
export function hasNearbyScan(point: Pick<SurveyPoint, "nearby">): boolean {
  return Array.isArray(point.nearby);
}

/**
 * Was this point measured without a Wi-Fi connection? Then it has only a
 * scan, and no signal, noise or speed of its own: those maps leave it out.
 */
export function isScanOnly(
  point: Pick<SurveyPoint, "nearby" | "wifiData">,
): boolean {
  return (
    hasNearbyScan(point) &&
    !point.wifiData.signalStrength &&
    !point.wifiData.rssi
  );
}

/** The strongest signal (percent) a point heard, from any network; 0 if none. */
export function strongestNearby(point: Pick<SurveyPoint, "nearby">): number {
  return (point.nearby ?? []).reduce(
    (max, n) => Math.max(max, n.signalStrength),
    0,
  );
}

/** The band of a scan entry, or null if it is not one we show. */
export function nearbyBand(
  network: Pick<NearbyNetwork, "band">,
): NearbyBand | null {
  return (NEARBY_BANDS as readonly number[]).includes(network.band)
    ? (network.band as NearbyBand)
    : null;
}

/**
 * How a band's report splits its maps: one map for every access point it
 * includes together, one per network (SSID), or one per access point.
 */
export const NEARBY_SPLITS = ["combined", "network", "accessPoint"] as const;
export type NearbySplit = (typeof NEARBY_SPLITS)[number];

/** A band's report as the survey saves it (nearbyReports in schema.ts). */
export interface NearbyReportSettings {
  /** drawn on the Heat maps tab */
  shown: boolean;
  /** access points (accessPointKey) left out */
  hidden: string[];
  split: NearbySplit;
}

export const defaultNearbyReport = (): NearbyReportSettings => ({
  shown: false,
  hidden: [],
  split: "combined",
});

/**
 * What identifies one access point (one radio): its BSSID, or, when the OS
 * hides it, the network name and channel.
 */
export function accessPointKey(
  n: Pick<NearbyNetwork, "bssid" | "ssid" | "channel">,
): string {
  return n.bssid ? n.bssid.toLowerCase() : `${n.ssid}@${n.channel}`;
}

/** One access point heard on a band, over all of a survey's scans. */
export interface NearbyAccessPoint {
  key: string;
  ssid: string;
  bssid: string;
  channel: number;
  /** the strongest signal any point heard from it, percent */
  strongest: number;
  /** how many points heard it */
  heardAt: number;
}

/** One network (SSID) on a band, with its access points, strongest first. */
export interface NearbyNetworkGroup {
  ssid: string;
  strongest: number;
  accessPoints: NearbyAccessPoint[];
}

/**
 * Every access point the survey's scans heard on `band`, grouped by
 * network: strongest network first, unnamed ones last. Disabled points
 * count too, so turning one off doesn't change the list.
 */
export function nearbyAccessPoints(
  points: SurveyPoint[],
  band: NearbyBand,
): NearbyNetworkGroup[] {
  const found = new Map<string, NearbyAccessPoint>();
  for (const point of points) {
    const heardHere = new Set<string>();
    for (const n of point.nearby ?? []) {
      if (n.band !== band) continue;
      const key = accessPointKey(n);
      const ap = found.get(key) ?? {
        key,
        ssid: n.ssid,
        bssid: n.bssid,
        channel: n.channel,
        strongest: 0,
        heardAt: 0,
      };
      ap.strongest = Math.max(ap.strongest, n.signalStrength);
      if (!heardHere.has(key)) ap.heardAt++;
      heardHere.add(key);
      found.set(key, ap);
    }
  }
  const groups = new Map<string, NearbyNetworkGroup>();
  for (const ap of found.values()) {
    const group = groups.get(ap.ssid) ?? {
      ssid: ap.ssid,
      strongest: 0,
      accessPoints: [],
    };
    group.accessPoints.push(ap);
    group.strongest = Math.max(group.strongest, ap.strongest);
    groups.set(ap.ssid, group);
  }
  for (const g of groups.values()) {
    g.accessPoints.sort(
      (a, b) => b.strongest - a.strongest || a.key.localeCompare(b.key),
    );
  }
  return [...groups.values()].sort((a, b) =>
    a.ssid === UNNAMED_NETWORK
      ? 1
      : b.ssid === UNNAMED_NETWORK
        ? -1
        : b.strongest - a.strongest || a.ssid.localeCompare(b.ssid),
  );
}

/** The bands any point heard a network on, in order. */
export function nearbyBandsHeard(points: SurveyPoint[]): NearbyBand[] {
  const heard = new Set<NearbyBand>();
  for (const point of points) {
    for (const n of point.nearby ?? []) {
      const band = nearbyBand(n);
      if (band !== null) heard.add(band);
    }
  }
  return NEARBY_BANDS.filter((b) => heard.has(b));
}

/**
 * The value a point contributes to a nearby-network map of `band`: the
 * strongest signal (percent) of the access points in `include`, 0 if the
 * scan heard none of them, or null if the point did not scan.
 */
export function nearbyValue(
  point: Pick<SurveyPoint, "nearby">,
  band: NearbyBand,
  include: ReadonlySet<string>,
): number | null {
  if (!point.nearby) return null;
  let best = 0;
  for (const n of point.nearby) {
    if (n.band !== band || !include.has(accessPointKey(n))) continue;
    best = Math.max(best, n.signalStrength);
  }
  return best;
}

/** One map of a band's report. */
export interface NearbyMapSpec {
  /** unique within the report */
  id: string;
  /** what it shows: "Home", "Living room", "2 networks" */
  label: string;
  /** the access points (accessPointKey) it combines */
  include: Set<string>;
}

/** "Home, Home-IoT" or "4 networks". */
export function networksText(ssids: string[]): string {
  const unique = [...new Set(ssids)];
  if (unique.length === 0) return "no access points";
  if (unique.length <= 3) return unique.map(networkName).join(", ");
  return `${unique.length} networks`;
}

/**
 * The maps a band's report draws, in list order. Per access point, the
 * radios that share an access point name (Settings > Access point names)
 * are one map; others are one map each. A combined report with nothing
 * included is still one map (it says so), the split ones then have none.
 */
export function nearbyMapSpecs(
  groups: NearbyNetworkGroup[],
  report: Pick<NearbyReportSettings, "hidden" | "split">,
  apName: (bssid: string) => string | undefined = () => undefined,
): NearbyMapSpec[] {
  const hidden = new Set(report.hidden);
  const included = groups.flatMap((g) =>
    g.accessPoints.filter((ap) => !hidden.has(ap.key)),
  );
  if (report.split === "combined") {
    return [
      {
        id: "all",
        label: networksText(included.map((ap) => ap.ssid)),
        include: new Set(included.map((ap) => ap.key)),
      },
    ];
  }
  const specs = new Map<string, NearbyMapSpec>();
  for (const ap of included) {
    let id: string;
    let label: string;
    if (report.split === "network") {
      id = `net:${ap.ssid}`;
      label = networkName(ap.ssid);
    } else {
      const name = ap.bssid ? apName(ap.bssid) : undefined;
      id = name ? `name:${name}` : `ap:${ap.key}`;
      label = name ?? accessPointLabel(ap);
    }
    const spec = specs.get(id) ?? { id, label, include: new Set<string>() };
    spec.include.add(ap.key);
    specs.set(id, spec);
  }
  return [...specs.values()];
}

/** "Home · 9E-05-D6-96-E8-30", for an access point without a name. */
export function accessPointLabel(
  ap: Pick<NearbyAccessPoint, "ssid" | "bssid" | "channel">,
): string {
  const where = ap.bssid ? formatMacAddress(ap.bssid) : `channel ${ap.channel}`;
  return `${networkName(ap.ssid)} · ${where}`;
}

/** "Home", or "(no name)" for a hidden network. */
export function networkName(ssid: string): string {
  return ssid === UNNAMED_NETWORK ? "(no name)" : ssid;
}
