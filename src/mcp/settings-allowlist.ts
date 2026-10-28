/**
 * settings-allowlist.ts - the survey settings an agent may read and change.
 *
 * Everything else in a survey file (the points, the floor plan, the
 * gradient, ...) is out of reach of update_settings, and the sudo password
 * is never read or written. Pure functions.
 *
 * Validation is stricter than the Settings tab for the two values that end
 * up in a shell command (the iperf3 server and the iperf3 command
 * templates): an agent may only set a plain host[:port] and plain iperf3
 * arguments, never shell syntax. Anything fancier is set by a person in the
 * app.
 */
import {
  isValidHeatmapRange,
  normalizeHeatmapRanges,
} from "../lib/heatmap-scale";
import { isGridHeatmapKey, parseHeatmapKey } from "../lib/heatmap-grid";
import { defaultIperfCommands } from "../lib/iperfUtils";
import type {
  ApMapping,
  HeatmapRanges,
  HeatmapScale,
  IperfCommands,
} from "../lib/types";
import { normalizeMacAddress } from "../lib/utils";
import { isValidApPattern } from "../lib/apName";
import type { StoredSurvey } from "./app-client";

export const SAFE_SETTING_KEYS = [
  "iperfServerAdrs",
  "testDuration",
  "iperfCommands",
  "apMapping",
  "radiusDivider",
  "maxOpacity",
  "minOpacity",
  "heatmapRanges",
] as const;

export type SafeSettings = {
  iperfServerAdrs: string;
  testDuration: number;
  iperfCommands: IperfCommands;
  apMapping: ApMapping[];
  radiusDivider: number | null;
  maxOpacity: number;
  minOpacity: number;
  heatmapRanges: HeatmapRanges;
};

/** What update_settings accepts. Every field is optional. */
export interface SettingsPatch {
  iperfServerAdrs?: string;
  testDuration?: number;
  /** Only the commands given are changed. */
  iperfCommands?: Partial<IperfCommands>;
  /** Replaces the whole list. */
  apMapping?: ApMapping[];
  /** Heat spot radius in floor-plan pixels, or null for automatic. */
  radiusDivider?: number | null;
  maxOpacity?: number;
  minOpacity?: number;
  /** Per map; null removes that map's saved scale. Others are kept. */
  heatmapRanges?: Record<string, HeatmapScale | null>;
}

export const TEST_DURATION_RANGE = { min: 1, max: 60 };
export const RADIUS_RANGE = { min: 1, max: 10_000 };

/** The allow-listed values of a survey, with the app's defaults filled in. */
export function pickSafeSettings(survey: Partial<StoredSurvey>): SafeSettings {
  return {
    iperfServerAdrs: survey.iperfServerAdrs ?? "localhost",
    testDuration: survey.testDuration ?? 1,
    iperfCommands: { ...defaultIperfCommands, ...(survey.iperfCommands ?? {}) },
    apMapping: survey.apMapping ?? [],
    radiusDivider: survey.radiusDivider ?? null,
    maxOpacity: survey.maxOpacity ?? 0.7,
    minOpacity: survey.minOpacity ?? 0.2,
    heatmapRanges: normalizeHeatmapRanges(survey.heatmapRanges),
  };
}

/** "localhost" (throughput tests off), or a host name / IPv4 address with an optional port. */
export function isSafeIperfServer(value: string): boolean {
  const m =
    /^([A-Za-z0-9](?:[A-Za-z0-9.-]{0,252}[A-Za-z0-9])?)(?::(\d{1,5}))?$/.exec(
      value,
    );
  if (!m) return false;
  if (m[2] !== undefined) {
    const port = Number(m[2]);
    if (port < 1 || port > 65535) return false;
  }
  return true;
}

const PLACEHOLDER = /^\{(server|port|duration)\}$/;
const PLAIN_ARG = /^[A-Za-z0-9._:=/@%+,-]+$/;

/**
 * An iperf3 command template with only plain arguments: it starts with
 * iperf3, contains {server} and -J (the app parses iperf3's JSON), and has
 * no quotes, pipes, redirects, substitutions or other shell syntax.
 */
export function iperfCommandProblem(command: string): string | null {
  const tokens = command.trim().split(/\s+/);
  if (tokens[0] !== "iperf3") return "must start with iperf3";
  for (const token of tokens.slice(1)) {
    if (!PLACEHOLDER.test(token) && !PLAIN_ARG.test(token)) {
      return `"${token}" is not allowed (only plain iperf3 arguments and {server}, {port}, {duration})`;
    }
  }
  if (!tokens.includes("{server}")) return "must contain {server}";
  if (!tokens.includes("-J") && !tokens.includes("--json")) {
    return "must contain -J (the app reads iperf3's JSON output)";
  }
  return null;
}

function isNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Check a patch; returns every problem found, in plain words. */
export function validateSettingsPatch(patch: SettingsPatch): string[] {
  const errors: string[] = [];
  const known = new Set<string>(SAFE_SETTING_KEYS);
  for (const key of Object.keys(patch)) {
    if (!known.has(key)) {
      errors.push(
        key === "sudoerPassword"
          ? "The sudo password can't be set here. Type it in the app (Settings tab); it is never saved."
          : `${key} can't be changed with this tool. Allowed: ${SAFE_SETTING_KEYS.join(", ")}.`,
      );
    }
  }

  if (patch.iperfServerAdrs !== undefined) {
    const v = patch.iperfServerAdrs;
    if (typeof v !== "string" || !isSafeIperfServer(v.trim())) {
      errors.push(
        `iperfServerAdrs must be "localhost" (throughput tests off) or a host name or IPv4 address with an optional port, e.g. 192.168.1.10 or 192.168.1.10:5201.`,
      );
    }
  }

  if (patch.testDuration !== undefined) {
    const v = patch.testDuration;
    if (
      !Number.isInteger(v) ||
      v < TEST_DURATION_RANGE.min ||
      v > TEST_DURATION_RANGE.max
    ) {
      errors.push(
        `testDuration must be a whole number of seconds from ${TEST_DURATION_RANGE.min} to ${TEST_DURATION_RANGE.max}.`,
      );
    }
  }

  if (patch.iperfCommands !== undefined) {
    const allowed = Object.keys(defaultIperfCommands);
    for (const [key, value] of Object.entries(patch.iperfCommands)) {
      if (!allowed.includes(key)) {
        errors.push(
          `iperfCommands.${key} is not a command. Allowed: ${allowed.join(", ")}.`,
        );
      } else if (typeof value !== "string") {
        errors.push(`iperfCommands.${key} must be a string.`);
      } else {
        const problem = iperfCommandProblem(value);
        if (problem) errors.push(`iperfCommands.${key} ${problem}.`);
      }
    }
  }

  if (patch.apMapping !== undefined) {
    if (!Array.isArray(patch.apMapping)) {
      errors.push("apMapping must be a list of { apName, macAddress }.");
    } else {
      patch.apMapping.forEach((ap, i) => {
        if (!ap || typeof ap.apName !== "string" || !ap.apName.trim()) {
          errors.push(`apMapping[${i}].apName must not be empty.`);
        } else if (ap.apName.length > 100) {
          errors.push(`apMapping[${i}].apName is longer than 100 characters.`);
        }
        if (
          !ap ||
          typeof ap.macAddress !== "string" ||
          !isValidApPattern(ap.macAddress)
        ) {
          errors.push(
            `apMapping[${i}].macAddress must be a MAC address such as 9e:05:d6:96:e8:30, or a prefix ending in * such as 9e:05:d6:96:e8:* (names every BSSID that starts with it).`,
          );
        }
      });
    }
  }

  if (patch.radiusDivider !== undefined && patch.radiusDivider !== null) {
    const v = patch.radiusDivider;
    if (!isNumber(v) || v < RADIUS_RANGE.min || v > RADIUS_RANGE.max) {
      errors.push(
        `radiusDivider must be null (automatic) or a radius in floor-plan pixels from ${RADIUS_RANGE.min} to ${RADIUS_RANGE.max}.`,
      );
    }
  }

  for (const key of ["maxOpacity", "minOpacity"] as const) {
    const v = patch[key];
    if (v !== undefined && (!isNumber(v) || v < 0 || v > 1)) {
      errors.push(`${key} must be a number from 0 to 1.`);
    }
  }

  if (patch.heatmapRanges !== undefined) {
    if (
      typeof patch.heatmapRanges !== "object" ||
      patch.heatmapRanges === null ||
      Array.isArray(patch.heatmapRanges)
    ) {
      errors.push("heatmapRanges must be an object keyed by map.");
    } else {
      for (const [key, scale] of Object.entries(patch.heatmapRanges)) {
        if (!isGridHeatmapKey(key)) {
          errors.push(`heatmapRanges: "${key}" is not a heat map.`);
          continue;
        }
        if (scale === null) continue;
        const { property } = parseHeatmapKey(key);
        if (
          typeof scale !== "object" ||
          typeof scale.enabled !== "boolean" ||
          !isValidHeatmapRange(scale, property)
        ) {
          errors.push(
            `heatmapRanges.${key} must be { min, max, enabled } with 0 <= min < max` +
              (property === "signalStrength"
                ? " <= 100 (percent)."
                : ", in display units (Mbps, ms or counts)."),
          );
        }
      }
    }
  }

  return errors;
}

export class SettingsPatchError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join("\n"));
  }
}

/**
 * applySettingsPatch() - the whole survey with the patch applied, ready to
 * POST to /api/settings. Fields outside the allow-list are copied as they
 * are; the sudo password is dropped. Throws SettingsPatchError.
 */
export function applySettingsPatch(
  survey: StoredSurvey,
  patch: SettingsPatch,
): StoredSurvey {
  const problems = validateSettingsPatch(patch);
  if (problems.length) throw new SettingsPatchError(problems);

  const { sudoerPassword: _ignored, ...base } = survey as StoredSurvey & {
    sudoerPassword?: unknown;
  };
  const next: StoredSurvey = { ...base };
  const current = pickSafeSettings(survey);

  if (patch.iperfServerAdrs !== undefined) {
    next.iperfServerAdrs = patch.iperfServerAdrs.trim();
  }
  if (patch.testDuration !== undefined) next.testDuration = patch.testDuration;
  if (patch.iperfCommands !== undefined) {
    const changed = Object.fromEntries(
      Object.entries(patch.iperfCommands).map(([k, v]) => [
        k,
        (v as string).trim().replace(/\s+/g, " "),
      ]),
    );
    next.iperfCommands = { ...current.iperfCommands, ...changed };
  }
  if (patch.apMapping !== undefined) {
    next.apMapping = patch.apMapping.map((ap) => ({
      apName: ap.apName.trim(),
      macAddress: normalizeMacAddress(ap.macAddress.trim()),
    }));
  }
  if (patch.radiusDivider !== undefined) {
    next.radiusDivider =
      patch.radiusDivider === null ? null : Math.round(patch.radiusDivider);
  }
  if (patch.maxOpacity !== undefined) next.maxOpacity = patch.maxOpacity;
  if (patch.minOpacity !== undefined) next.minOpacity = patch.minOpacity;
  if (patch.heatmapRanges !== undefined) {
    const ranges: Record<string, HeatmapScale> = { ...current.heatmapRanges };
    for (const [key, scale] of Object.entries(patch.heatmapRanges)) {
      if (scale === null) delete ranges[key];
      else
        ranges[key] = {
          min: scale.min,
          max: scale.max,
          enabled: scale.enabled,
        };
    }
    next.heatmapRanges = normalizeHeatmapRanges(ranges);
  }
  return next;
}
