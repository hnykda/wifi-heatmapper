/**
 * measurement-mode.ts - "signal only" or "signal and speed", and the
 * speed test server address. Pure functions, safe on the server and in the
 * browser.
 *
 * Up to 0.7 there was no explicit choice: an iperf3 server of "localhost"
 * meant "signal only". Surveys now store `measureSpeed`; files without it
 * are migrated by migrateMeasurementMode().
 */
import type { SurveyPoint } from "./types";

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

/** A dotted IPv4 address, each part 0 to 255 without leading zeros. */
export function isIPv4(text: string): boolean {
  const parts = text.split(".");
  return (
    parts.length === 4 &&
    parts.every((p) => /^(0|[1-9]\d{0,2})$/.test(p) && Number(p) <= 255)
  );
}

/**
 * An IPv6 address ("fe80::1", "2001:db8::42", "::ffff:192.0.2.1"),
 * optionally with a zone ("fe80::1%en0"). No brackets.
 */
export function isIPv6(text: string): boolean {
  const [address, zone, ...rest] = text.split("%");
  if (rest.length || (zone !== undefined && !/^[A-Za-z0-9._-]+$/.test(zone))) {
    return false;
  }
  const halves = address.split("::");
  if (halves.length > 2) return false;
  const groups = (half: string) => (half === "" ? [] : half.split(":"));
  const all = halves.flatMap(groups);
  // an IPv4 tail counts as two groups
  let count = all.length;
  const last = all[all.length - 1];
  if (last !== undefined && last.includes(".")) {
    if (!isIPv4(last)) return false;
    all.pop();
    count++;
  }
  if (!all.every((g) => /^[0-9A-Fa-f]{1,4}$/.test(g))) return false;
  return halves.length === 2 ? count <= 7 : count === 8;
}

/**
 * A host name (RFC 1123: labels of letters, digits and inner hyphens, up to
 * 63 characters each and 253 in all, an optional final dot) that isn't
 * all digits and dots (those must be an IPv4 address).
 */
export function isHostName(text: string): boolean {
  const name = text.endsWith(".") ? text.slice(0, -1) : text;
  if (!name || name.length > 253 || /^[\d.]+$/.test(name)) return false;
  return name
    .split(".")
    .every((label) =>
      /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label),
    );
}

const isHost = (host: string) =>
  isIPv4(host) || isHostName(host) || isIPv6(host);

/**
 * parseServerAddress() - split "host", "host:port", "1.2.3.4:5201",
 * "[fe80::1]:5201", "[::1]" or a bare IPv6 address ("fe80::1",
 * "fe80::1%en0") into host and port.
 * @returns null for anything else: an empty address, a host that isn't a
 *   valid host name, IPv4 or IPv6 address, a bad port, unbalanced brackets
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
    if (!m || !isIPv6(m[1])) return null;
    if (m[2] === undefined) return { host: m[1], port: null };
    const port = parsePort(m[2]);
    return port === undefined ? null : { host: m[1], port };
  }

  const colons = a.split(":").length - 1;
  // two or more colons: a bare IPv6 address, which can't carry a port
  if (colons >= 2) return isIPv6(a) ? { host: a, port: null } : null;
  if (colons === 1) {
    const [host, p] = a.split(":");
    const port = parsePort(p);
    if (!isHost(host) || port === undefined) return null;
    return { host, port };
  }
  return isHost(a) ? { host: a, port: null } : null;
}

/** "host:port" for messages, with brackets around IPv6 hosts. */
export function formatServerAddress({ host, port }: ServerAddress): string {
  const h = host.includes(":") ? `[${host}]` : host;
  return `${h}:${port ?? DEFAULT_IPERF_PORT}`;
}

/**
 * Did this point get a speed reading? A test that did not run is null;
 * any test that ran counts, even one that measured 0 Mbps.
 */
export function hasSpeedData(point: Pick<SurveyPoint, "iperfData">): boolean {
  const d = point.iperfData;
  if (!d) return false;
  return !!d.tcpDownload || !!d.tcpUpload || !!d.udpDownload || !!d.udpUpload;
}
