/**
 * settings-allowlist.ts - the survey settings an agent may read and change,
 * as a pick of the app's own schemas (src/lib/schema.ts).
 *
 * Everything else in a survey file (the points, the floor plan, the
 * gradient, ...) is out of reach of update_settings, and the sudo password
 * is never read or written.
 *
 * The rules are the app's own: no shell is involved (iperf3 gets one
 * argument per value) and the extra iperf3 options are checked by the
 * app's schema. The one addition: the server must be one the speed test
 * can use (parseServerAddress), so a typo is refused instead of saved.
 */
import { z } from "zod";
import { settingsPatchSchema, surveyFileSchema } from "../lib/schema";
import { defaultIperfCommands } from "../lib/iperfUtils";
import type { SettingsPatch } from "../lib/types";
import { normalizeMacAddress } from "../lib/utils";
import { isValidApPattern } from "../lib/apName";
import {
  isLegacySignalOnlyServer,
  migrateMeasurementMode,
  parseServerAddress,
} from "../lib/measurement-mode";

export const SAFE_SETTING_KEYS = [
  "measureSpeed",
  "iperfServerAdrs",
  "testDuration",
  "iperfCommands",
  "apMapping",
  "radiusDivider",
  "maxOpacity",
  "minOpacity",
  "heatmapRanges",
] as const;

const safeKeys = Object.fromEntries(
  SAFE_SETTING_KEYS.map((key) => [key, true as const]),
) as { [K in (typeof SAFE_SETTING_KEYS)[number]]: true };

/** The allow-listed values of a survey, read like the app reads a file. */
export const safeSettingsSchema = surveyFileSchema.pick(safeKeys);
export type SafeSettings = Omit<
  z.output<typeof safeSettingsSchema>,
  "measureSpeed"
> & { measureSpeed: boolean };

/** Older files without measureSpeed are migrated like the app does. */
export function pickSafeSettings(survey: unknown): SafeSettings {
  return migrateMeasurementMode(safeSettingsSchema.parse(survey ?? {}));
}

export const TEST_DURATION_RANGE = { min: 1, max: 60 };
export const RADIUS_RANGE = { min: 1, max: 10_000 };

/** "", "localhost" (both signal only, unless measureSpeed says otherwise), or what the speed test can use: a host name, IPv4 or IPv6 address, with an optional port. */
export function isUsableIperfServer(value: string): boolean {
  return isLegacySignalOnlyServer(value) || parseServerAddress(value) !== null;
}

const shape = settingsPatchSchema.shape;

/**
 * What update_settings accepts: the app's settings patch for the
 * allow-listed keys (plus a usable server address). Every field is
 * optional; apMapping replaces the list, iperfCommands and heatmapRanges
 * change only what is given (null removes a map's scale).
 */
export const mcpSettingsPatchSchema = z.strictObject({
  measureSpeed: shape.measureSpeed.unwrap().optional(),
  iperfServerAdrs: shape.iperfServerAdrs
    .unwrap()
    .refine(isUsableIperfServer, {
      error: `must be a host name or IP address with an optional port, e.g. 192.168.1.10, nas.local:5201 or [fe80::1]:5201 ("localhost" or "" for signal only)`,
    })
    .optional(),
  testDuration: shape.testDuration.unwrap().optional(),
  iperfCommands: shape.iperfCommands,
  apMapping: z
    .array(
      z.object({
        apName: z
          .string()
          .trim()
          .min(1, { error: "must not be empty" })
          .max(100, { error: "is longer than 100 characters" }),
        macAddress: z
          .string()
          .trim()
          .refine(isValidApPattern, {
            error:
              "must be a MAC address such as 9e:05:d6:96:e8:30, or a prefix ending in * such as 9e:05:d6:96:e8:* (names every BSSID that starts with it)",
          })
          .transform(normalizeMacAddress),
      }),
    )
    .optional(),
  radiusDivider: z
    .number()
    .min(RADIUS_RANGE.min)
    .max(RADIUS_RANGE.max)
    .transform(Math.round)
    .nullable()
    .optional(),
  maxOpacity: shape.maxOpacity,
  minOpacity: shape.minOpacity,
  heatmapRanges: shape.heatmapRanges,
});

/** What update_settings accepts (before validation). */
export type McpSettingsPatch = z.input<typeof mcpSettingsPatchSchema>;

const fieldHints: Record<string, string> = {
  measureSpeed: "true (signal and speed) or false (signal only)",
  testDuration: `a whole number of seconds from ${TEST_DURATION_RANGE.min} to ${TEST_DURATION_RANGE.max}`,
  radiusDivider: `null (automatic) or a radius in floor-plan pixels from ${RADIUS_RANGE.min} to ${RADIUS_RANGE.max}`,
  maxOpacity: "a number from 0 to 1",
  minOpacity: "a number from 0 to 1",
};

/** Every problem with a patch, one sentence each. */
function describeProblems(error: z.ZodError): string[] {
  return error.issues.flatMap((issue) => {
    const [field] = issue.path;
    if (issue.code === "unrecognized_keys") {
      return issue.keys.map((key) => {
        if (field === "iperfCommands") {
          return `iperfCommands.${key} is not a test. Allowed: ${Object.keys(defaultIperfCommands).join(", ")}.`;
        }
        if (issue.path.length)
          return `${issue.path.join(".")}.${key} is not allowed.`;
        return key === "sudoerPassword"
          ? "The sudo password can't be set here. Type it in the app (Settings tab); it is never saved."
          : `${key} can't be changed with this tool. Allowed: ${SAFE_SETTING_KEYS.join(", ")}.`;
      });
    }
    const where = issue.path.join(".");
    const hint =
      issue.path.length === 1 ? fieldHints[String(field)] : undefined;
    return [hint ? `${where} must be ${hint}.` : `${where} ${issue.message}.`];
  });
}

export class SettingsPatchError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join("\n"));
  }
}

/** Check a patch; returns every problem found, in plain words. */
export function validateSettingsPatch(patch: unknown): string[] {
  const parsed = mcpSettingsPatchSchema.safeParse(patch);
  return parsed.success ? [] : describeProblems(parsed.error);
}

/**
 * toSettingsPatch() - the PATCH /api/settings body for an update_settings
 * call: validated and normalized (trimmed, MAC addresses without
 * punctuation, radius rounded). Throws SettingsPatchError.
 */
export function toSettingsPatch(patch: unknown): SettingsPatch {
  const parsed = mcpSettingsPatchSchema.safeParse(patch);
  if (!parsed.success) {
    throw new SettingsPatchError(describeProblems(parsed.error));
  }
  const body: SettingsPatch = parsed.data;
  // Setting only the server keeps the old meaning: localhost is signal
  // only, a real server adds speed.
  if (body.measureSpeed === undefined && body.iperfServerAdrs !== undefined) {
    body.measureSpeed = !isLegacySignalOnlyServer(body.iperfServerAdrs);
  }
  return body;
}
