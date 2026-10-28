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
