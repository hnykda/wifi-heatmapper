/**
 * measurement-mode.ts - "signal only" or "signal and speed", and the
 * speed test server address. Pure functions, safe on the server and in the
 * browser.
 *
 * Up to 0.7 there was no explicit choice: an iperf3 server of "localhost"
 * meant "signal only". Surveys now store `measureSpeed`; files without it
 * are migrated by migrateMeasurementMode().
 */
import type { IperfTestProperty, SurveyPoint } from "./types";

/** The iperf3 server port when the address doesn't name one. */
export const DEFAULT_IPERF_PORT = 5201;

/** The old (0.7 and earlier) way of saying "no speed test": empty or localhost. */
export function isLegacySignalOnlyServer(address: unknown): boolean {
  if (typeof address !== "string") return true;
  const a = address.trim().toLowerCase();
  return a === "" || a === "localhost";
}

/**
 * Does this survey (or the settings sent to /api/start-task) measure
 * speed? An explicit `measureSpeed` wins; without one, the old rule
 * applies (localhost or empty is signal only).
 */
export function measuresSpeed(settings: {
  measureSpeed?: unknown;
  iperfServerAdrs?: unknown;
}): boolean {
  if (typeof settings.measureSpeed === "boolean") return settings.measureSpeed;
  return !isLegacySignalOnlyServer(settings.iperfServerAdrs);
}

/**
 * migrateMeasurementMode() - give a loaded survey an explicit
 * `measureSpeed`. `localhost` or an empty server becomes signal only,
 * any other server becomes signal and speed. A survey that already has
 * the field is returned unchanged. Pure: the input is not modified.
 *
 * Called by parseSurveyFile() in schema.ts, the one load path.
 */
export function migrateMeasurementMode<
  T extends { measureSpeed?: unknown; iperfServerAdrs?: unknown },
>(loaded: T): T & { measureSpeed: boolean } {
  if (typeof loaded.measureSpeed === "boolean") {
    return loaded as T & { measureSpeed: boolean };
  }
  return { ...loaded, measureSpeed: measuresSpeed(loaded) };
}

export interface ServerAddress {
  host: string;
  /** null when the address doesn't name one (iperf3 then uses 5201) */
  port: number | null;
}

/**
 * parseServerAddress() - split "host", "host:port", "1.2.3.4:5201",
 * "[fe80::1]:5201", "[::1]" or a bare IPv6 address ("fe80::1",
 * "fe80::1%en0") into host and port.
 * @returns null for an empty address, a bad port or unbalanced brackets
 */
export function parseServerAddress(address: string): ServerAddress | null {
  const a = (address ?? "").trim();
  if (!a) return null;

  const parsePort = (p: string): number | null | undefined => {
    if (!/^\d{1,5}$/.test(p)) return undefined;
    const n = Number(p);
    return n >= 1 && n <= 65535 ? n : undefined;
  };

  // [IPv6] or [IPv6]:port
  if (a.startsWith("[")) {
    const m = /^\[([^\]]+)\](?::(.*))?$/.exec(a);
    if (!m) return null;
    if (m[2] === undefined) return { host: m[1], port: null };
    const port = parsePort(m[2]);
    return port === undefined ? null : { host: m[1], port };
  }
  if (a.includes("[") || a.includes("]")) return null;

  const colons = a.split(":").length - 1;
  // two or more colons: a bare IPv6 address, which can't carry a port
  if (colons >= 2) return { host: a, port: null };
  if (colons === 1) {
    const [host, p] = a.split(":");
    const port = parsePort(p);
    if (!host || port === undefined) return null;
    return { host, port };
  }
  return { host: a, port: null };
}

/** "host:port" for messages, with brackets around IPv6 hosts. */
export function formatServerAddress({ host, port }: ServerAddress): string {
  const h = host.includes(":") ? `[${host}]` : host;
  return `${h}:${port ?? DEFAULT_IPERF_PORT}`;
}

const ran = (t: IperfTestProperty | undefined) => !!t && t.bitsPerSecond > 0;

/**
 * Did this point get a speed reading? Unmeasured tests are stored as
 * zeros, so any non-zero result counts.
 */
export function hasSpeedData(point: Pick<SurveyPoint, "iperfData">): boolean {
  const d = point.iperfData;
  if (!d) return false;
  return (
    ran(d.tcpDownload) ||
    ran(d.tcpUpload) ||
    ran(d.udpDownload) ||
    ran(d.udpUpload)
  );
}
