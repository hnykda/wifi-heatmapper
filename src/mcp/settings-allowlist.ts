/**
 * settings-allowlist.ts - the survey settings an agent may read and change,
 * as a pick of the app's own schemas (src/lib/schema.ts).
 *
 * Everything else in a survey file (the points, the floor plan, the
 * gradient, ...) is out of reach of update_settings, and the sudo password
 * is never read or written.
 *
 * Validation is stricter than the Settings tab for the two values that end
 * up in a shell command (the iperf3 server and the iperf3 command
 * templates): an agent may only set a plain host[:port] and plain iperf3
 * arguments, never shell syntax. Anything fancier is set by a person in the
 * app.
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

/** "localhost" (signal only, unless measureSpeed says otherwise), or a host name / IPv4 address with an optional port. */
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

const safeCommand = z
  .string()
  .superRefine((command, ctx) => {
    const problem = iperfCommandProblem(command);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  })
  .transform((command) => command.trim().replace(/\s+/g, " "));

const shape = settingsPatchSchema.shape;

/**
 * What update_settings accepts: the app's settings patch for the
 * allow-listed keys, with the stricter checks above. Every field is
 * optional; apMapping replaces the list, iperfCommands and heatmapRanges
 * change only what is given (null removes a map's scale).
 */
export const mcpSettingsPatchSchema = z.strictObject({
  measureSpeed: shape.measureSpeed.unwrap().optional(),
  iperfServerAdrs: z
    .string()
    .trim()
    .refine(isSafeIperfServer, {
      error: `must be "localhost" (signal only) or a host name or IPv4 address with an optional port, e.g. 192.168.1.10 or 192.168.1.10:5201`,
    })
    .optional(),
  testDuration: shape.testDuration.unwrap().optional(),
  iperfCommands: z
    .strictObject({
      tcpDownload: safeCommand.optional(),
      tcpUpload: safeCommand.optional(),
      udpDownload: safeCommand.optional(),
      udpUpload: safeCommand.optional(),
    })
    .optional(),
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
          return `iperfCommands.${key} is not a command. Allowed: ${Object.keys(defaultIperfCommands).join(", ")}.`;
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

/**
 * Why copy_settings may not copy a survey's speed settings ([] if it may):
 * the same checks update_settings makes on the server and the iperf3
 * commands, since they end up in a shell command. An empty server (signal
 * only) is fine.
 */
export function unsafeSpeedSettings(survey: {
  iperfServerAdrs?: string;
  iperfCommands?: Record<string, string>;
}): string[] {
  const problems: string[] = [];
  const server = (survey.iperfServerAdrs ?? "").trim();
  if (server && !isSafeIperfServer(server)) {
    problems.push("have a server that is not a plain host name or address");
  }
  for (const [test, command] of Object.entries(survey.iperfCommands ?? {})) {
    const problem = iperfCommandProblem(command);
    if (problem) problems.push(`have a ${test} command that ${problem}`);
  }
  return problems;
}
