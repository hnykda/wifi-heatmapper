import { ApMapping } from "./types";
import {
  formatMacAddress,
  isValidMacAddress,
  normalizeMacAddress,
} from "./utils";

/**
 * Access point names are keyed by BSSID. An entry is either a full MAC
 * address or a prefix ending in "*" (e.g. "aa:bb:cc:dd:ee:*"), which names
 * every BSSID that starts with those hex digits. Separators and case are
 * ignored on both sides.
 */

const normalizePattern = (pattern: string): string =>
  normalizeMacAddress(pattern.trim());

/** True for "aa:bb:cc:dd:ee:*" style prefixes: 1 to 11 hex digits then "*". */
export const isApPrefix = (pattern: string): boolean =>
  /^[0-9a-f]{1,11}\*$/.test(normalizePattern(pattern));

/** True for a full MAC address or a prefix ending in "*". */
export const isValidApPattern = (pattern: string): boolean =>
  isValidMacAddress(pattern.trim()) || isApPrefix(pattern);

/** Format for display: "9E-05-D6-96-E8-30" or "9E-05-D6-96-E8-*". */
export const formatApPattern = (pattern: string): string => {
  const normalized = normalizePattern(pattern);
  if (!normalized.endsWith("*")) return formatMacAddress(normalized);
  const groups =
    normalized
      .slice(0, -1)
      .toUpperCase()
      .match(/.{1,2}/g) ?? [];
  return [...groups, "*"].join("-");
};

/**
 * Name of the access point for a BSSID, or undefined if none matches.
 * An exact match wins; otherwise the longest matching prefix wins.
 */
export function apNameFor(
  bssid: string | undefined,
  apMapping: ApMapping[] | undefined,
): string | undefined {
  if (!bssid || !apMapping?.length) return undefined;
  const target = normalizeMacAddress(bssid);
  let best: { apName: string; length: number } | undefined;
  for (const ap of apMapping) {
    const pattern = normalizePattern(ap.macAddress ?? "");
    if (!pattern) continue;
    if (pattern === target) return ap.apName;
    if (!pattern.endsWith("*")) continue;
    const prefix = pattern.slice(0, -1);
    if (
      prefix &&
      target.startsWith(prefix) &&
      (!best || prefix.length > best.length)
    ) {
      best = { apName: ap.apName, length: prefix.length };
    }
  }
  return best?.apName;
}

/** Muted hues the access point chips cycle through: green, blue, amber, violet, … */
export const AP_HUES = [150, 205, 32, 270, 345, 180, 55, 230];

/** What identifies an access point: its name, else its BSSID. */
export function apKeyFor(
  bssid: string | undefined,
  apMapping: ApMapping[] | undefined,
): string {
  return (
    apNameFor(bssid, apMapping) ?? (bssid ? normalizeMacAddress(bssid) : "")
  );
}

/**
 * A hue per access point seen in a survey, so the same access point has
 * the same colour everywhere. Sorted, so the colours don't change when the
 * table is sorted or a point is added for an access point already seen.
 */
export function apHues(
  bssids: (string | undefined)[],
  apMapping: ApMapping[] | undefined,
): Map<string, number> {
  const keys = [
    ...new Set(bssids.map((b) => apKeyFor(b, apMapping)).filter(Boolean)),
  ].sort();
  return new Map(keys.map((k, i) => [k, AP_HUES[i % AP_HUES.length]]));
}
