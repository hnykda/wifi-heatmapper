/**
 * schema.ts - the shape of a survey file and of the API request bodies that
 * change one, as Zod schemas. The TypeScript types in types.ts are derived
 * from these, so the two cannot drift apart.
 *
 * Two kinds of schema live here:
 *
 * - Lenient ones read what is on disk (surveyFileSchema). Survey files come
 *   from every version since 0.4, and some were edited by hand. A field that
 *   is missing or has the wrong type falls back to its default (`.catch()`),
 *   a list entry that is unusable is dropped, and the rest still loads.
 *   The migrations that used to live in GlobalSettings.tsx and fileHandler.ts
 *   (defaults for missing fields, iperfResults -> iperfData, the fixed
 *   colour scales) happen here, on the server.
 *
 * - Strict ones check request bodies (settingsPatchSchema, addPointSchema,
 *   ...). Unknown keys and invalid values are refused with a 400, and
 *   nothing is written.
 *
 * The measurement payload of a point (wifiData, iperfData) is read leniently
 * in both cases: it comes from this server's own scanners, which leave a
 * field out on some systems, and losing a measurement over a missing
 * txRate would be worse than storing 0. A speed test that did not run is
 * null (files before schema version 2 stored zeros; parseSurveyFile()
 * reads those as null).
 *
 * The sudo password is not part of any schema here: it is never stored, and
 * parsing drops it like any other unknown key.
 */
import { z } from "zod";
import { HEATMAP_KEYS, parseHeatmapKey } from "./heatmap-grid";
import { isValidHeatmapRange } from "./heatmap-scale";
import {
  defaultIperfCommands,
  iperfArgsProblem,
  migrateIperfTemplate,
} from "./iperfUtils";
import { getLogger } from "./logger";
import { defaultGradient, emptyWifiResults } from "./survey-defaults";
import { mediaUrlFor } from "./media-url";
import { migrateMeasurementMode } from "./measurement-mode";
import { cleanPointLabel, POINT_LABEL_MAX } from "./point-label";
import { COPY_PART_NAMES, type CopyPart } from "./survey-ops";
import type { Gradient, HeatmapKey, HeatmapRanges } from "./types";

const logger = getLogger("schema");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A list whose unusable entries are dropped instead of failing the list. */
function lenientArray<T extends z.ZodType>(item: T) {
  return z
    .array(z.unknown())
    .catch([])
    .transform((items) =>
      items.flatMap((value) => {
        const parsed = item.safeParse(value);
        return parsed.success ? [parsed.data as z.output<T>] : [];
      }),
    );
}

const finite = z.number(); // Zod 4 refuses NaN and Infinity

/* ---------- measurements ---------- */

/**
 * One speed test that ran. Without a usable bitsPerSecond it isn't one
 * (the test becomes null); the other values fall back one by one.
 */
export const iperfTestPropertySchema = z.object({
  bitsPerSecond: finite, // 0 is a real result: nothing got through
  retransmits: finite.optional().catch(undefined),
  // null: the test does not report it (TCP has no jitter) or it is unknown
  jitterMs: finite.nullable().catch(null),
  lostPackets: finite.nullable().catch(null),
  packetsReceived: finite.nullable().catch(null),
  signalStrength: finite.catch(0),
});

/** A test, or null when it did not run (or is unusable). */
const iperfTestOrNull = iperfTestPropertySchema.nullable().catch(null);

/** The four speed tests of a point; null for each one that did not run. */
export const iperfResultsSchema = z.object({
  tcpDownload: iperfTestOrNull,
  tcpUpload: iperfTestOrNull,
  udpDownload: iperfTestOrNull,
  udpUpload: iperfTestOrNull,
});

const IPERF_TESTS = [
  "tcpDownload",
  "tcpUpload",
  "udpDownload",
  "udpUpload",
] as const;

/**
 * Did this stored test not run? Before schema version 2 a test that did
 * not run was saved as zeros: bitsPerSecond 0 and nothing else measured.
 * signalStrength is not looked at: it is the Wi-Fi reading copied in
 * (0.3 stored the signal there even for tests that did not run). A test
 * with any other value is kept, and so is any test in a newer file, where
 * 0 Mbps is a real result.
 */
function savedAsZeros(test: z.output<typeof iperfTestPropertySchema>) {
  const nothing = (v: number | null | undefined) =>
    v === 0 || v === null || v === undefined;
  return (
    test.bitsPerSecond === 0 &&
    nothing(test.retransmits) &&
    nothing(test.jitterMs) &&
    nothing(test.lostPackets) &&
    nothing(test.packetsReceived)
  );
}

/** The results of a Wi-Fi reading. */
export interface WifiResults {
  ssid: string;
  bssid: string;
  rssi: number; // dBm
  // noise floor in dBm; only some platforms report it (macOS, some Linux
  // drivers). Missing or null means unknown.
  noise?: number | null;
  signalStrength: number; // percent
  channel: number;
  security: string;
  txRate: number;
  phyMode: string;
  channelWidth: number;
  band: number; // frequency band - 2.4 or 5 (GHz)
  currentSSID: boolean; // true if this is the SSID currently in use
  strongestSSID: WifiResults | null;
}

export const wifiResultsSchema: z.ZodType<WifiResults> = z.lazy(() =>
  z.object({
    ssid: z.string().catch(""),
    bssid: z.string().catch(""),
    rssi: finite.catch(0),
    noise: finite.nullable().optional().catch(undefined),
    signalStrength: finite.catch(0),
    channel: finite.catch(0),
    security: z.string().catch(""),
    txRate: finite.catch(0),
    phyMode: z.string().catch(""),
    channelWidth: finite.catch(0),
    band: finite.catch(0),
    currentSSID: z.boolean().catch(false),
    strongestSSID: wifiResultsSchema.nullable().catch(null),
  }),
);

/* ---------- survey points ---------- */

/**
 * A point's name in a request: trimmed, at most POINT_LABEL_MAX
 * characters; "" removes it.
 */
const pointLabelStrict = z
  .string()
  .trim()
  .max(POINT_LABEL_MAX, `a label is at most ${POINT_LABEL_MAX} characters`);

/** A stored name: trimmed and cut to POINT_LABEL_MAX; empty or bad: none. */
const pointLabelLenient = z
  .string()
  .transform(cleanPointLabel)
  .optional()
  .catch(undefined);

const pointFields = {
  x: finite,
  y: finite,
  wifiData: wifiResultsSchema,
  iperfData: iperfResultsSchema,
  timestamp: finite,
  isEnabled: z.boolean(),
  /** optional name shown instead of the id ("Kitchen"); display only */
  label: pointLabelStrict.optional(),
};

/**
 * A stored point. Without a usable position and id it is dropped; everything
 * else falls back. Versions before 0.4 called iperfData "iperfResults".
 */
export const surveyPointSchema = z.preprocess(
  (value) => {
    if (!isRecord(value) || value.iperfResults === undefined) return value;
    const { iperfResults, ...rest } = value;
    return { ...rest, iperfData: iperfResults };
  },
  z.object({
    x: pointFields.x,
    y: pointFields.y,
    id: z.string().min(1),
    wifiData: pointFields.wifiData.catch(emptyWifiResults),
    iperfData: pointFields.iperfData.catch(() => iperfResultsSchema.parse({})), // all null
    timestamp: pointFields.timestamp.catch(0),
    isEnabled: pointFields.isEnabled.catch(true),
    label: pointLabelLenient,
  }),
);

/* ---------- settings ---------- */

export const apMappingSchema = z.object({
  apName: z.string(),
  macAddress: z.string(),
});

/** The extra iperf3 options of one test (see iperfUtils.ts). */
const iperfExtraArgs = z.array(z.string()).superRefine((args, ctx) => {
  const problem = iperfArgsProblem(args);
  if (problem) ctx.addIssue({ code: "custom", message: problem });
});

/**
 * The extra iperf3 options per test, as argument arrays. (Before 0.8 these
 * were whole command templates run through a shell; the file key stayed.)
 */
export const iperfCommandsSchema = z.object({
  tcpDownload: iperfExtraArgs,
  tcpUpload: iperfExtraArgs,
  udpDownload: iperfExtraArgs,
  udpUpload: iperfExtraArgs,
});

const iperfCommandKeys = Object.keys(
  iperfCommandsSchema.shape,
) as (keyof typeof iperfCommandsSchema.shape)[];

/**
 * Missing or damaged options fall back to the default one by one. An old
 * command template (a string) is read into its extra options; one that
 * can't be (shell syntax, another program) falls back to the defaults,
 * with a warning in the log.
 */
const iperfCommandsLenient = z
  .unknown()
  .optional()
  .transform(
    (value) =>
      Object.fromEntries(
        iperfCommandKeys.map((key) => {
          const v = isRecord(value) ? value[key] : undefined;
          if (typeof v === "string") {
            const migrated = migrateIperfTemplate(v);
            if (migrated.args) return [key, migrated.args];
            logger.warn(
              `The ${key} iperf3 command "${v}" can't be used any more because ${migrated.reason}; using the default options instead. Set extra options under Settings > Advanced.`,
            );
            return [key, [...defaultIperfCommands[key]]];
          }
          const parsed = iperfExtraArgs.safeParse(v);
          return [
            key,
            parsed.success ? parsed.data : [...defaultIperfCommands[key]],
          ];
        }),
      ) as z.output<typeof iperfCommandsSchema>,
  );

export const heatmapScaleSchema = z.object({
  min: finite,
  max: finite,
  enabled: z.boolean(),
});

function isHeatmapKey(key: string): key is (typeof HEATMAP_KEYS)[number] {
  return (HEATMAP_KEYS as readonly string[]).includes(key);
}

/** Why a saved scale isn't valid for its map (0 <= min < max, <= 100 for signal), or null. */
function scaleProblem(
  key: (typeof HEATMAP_KEYS)[number],
  scale: unknown,
): string | null {
  const { property } = parseHeatmapKey(key);
  if (
    heatmapScaleSchema.safeParse(scale).success &&
    isValidHeatmapRange(scale, property)
  ) {
    return null;
  }
  return (
    "must be { min, max, enabled } with 0 <= min < max" +
    (property === "signalStrength"
      ? " <= 100 (percent)"
      : ", in display units (Mbps, ms, counts or dB)")
  );
}

/** Keep only known maps with a valid saved scale (lenient). */
export function normalizeHeatmapRanges(input: unknown): HeatmapRanges {
  if (!isRecord(input)) return {};
  const ranges: HeatmapRanges = {};
  for (const key of HEATMAP_KEYS) {
    const value = input[key];
    if (scaleProblem(key, value) === null) {
      ranges[key] = heatmapScaleSchema.parse(value);
    }
  }
  return ranges;
}

const heatmapRangesLenient = z
  .unknown()
  .optional()
  .transform(normalizeHeatmapRanges);

function isGradientStop(key: string, color: unknown): color is string {
  const stop = Number(key);
  return (
    key.trim() !== "" &&
    Number.isFinite(stop) &&
    stop >= 0 &&
    stop <= 1 &&
    typeof color === "string" &&
    color !== ""
  );
}

/** Colour stops 0..1 -> CSS colour. */
const gradientSchema = z
  .record(z.string(), z.string())
  .superRefine((gradient, ctx) => {
    const entries = Object.entries(gradient);
    if (entries.length === 0) {
      ctx.addIssue({ code: "custom", message: "needs at least one stop" });
    }
    for (const [key, color] of entries) {
      if (!isGradientStop(key, color)) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "a stop is a number from 0 to 1 and a colour",
        });
      }
    }
  })
  .transform((g) => g as Gradient);

/** Bad stops are dropped; with none left, the default gradient. */
const gradientLenient = z
  .unknown()
  .optional()
  .transform((value): Gradient => {
    if (!isRecord(value)) return defaultGradient();
    const stops = Object.entries(value).filter(([k, c]) =>
      isGradientStop(k, c),
    );
    return stops.length
      ? (Object.fromEntries(stops) as Gradient)
      : defaultGradient();
  });

export const surveyFileMetaSchema = z.object({
  schemaVersion: finite,
  appVersion: z.string(),
  platform: z.string(),
  osName: z.string(),
  savedAt: z.string(), // ISO timestamp
  // Only on the save that created the survey: the survey whose speed
  // settings it started from (survey-store.ts)
  speedSettingsFrom: z.string().optional().catch(undefined),
});

/* ---------- the survey file ---------- */

/**
 * One data/surveys/<floor plan>.json, read leniently. Unknown keys
 * (including a sudo password in a very old file) are dropped.
 */
export const surveyFileSchema = z.object({
  surveyPoints: lenientArray(surveyPointSchema),
  floorplanImageName: z.string().catch(""),
  // URL the browser loads the image from; always derived from the name
  floorplanImagePath: z.string().catch(""),
  // "Signal and speed" (true) or "Signal only" (false). Files before 0.8
  // don't have it; parseSurveyFile() derives it from the server address.
  measureSpeed: z.boolean().optional().catch(undefined),
  iperfServerAdrs: z.string().catch(""), // the speed test (iperf3) server, host[:port]
  testDuration: finite.catch(5),
  apMapping: lenientArray(apMappingSchema),
  nextPointNum: z.int().catch(1),
  dimensions: z
    .object({ width: finite, height: finite })
    .catch(() => ({ width: 100, height: 100 })),
  radiusDivider: finite.nullable().catch(null), // null: calculated
  maxOpacity: finite.catch(0.7),
  minOpacity: finite.catch(0.2),
  blur: finite.catch(0.99),
  gradient: gradientLenient,
  heatmapRanges: heatmapRangesLenient,
  iperfCommands: iperfCommandsLenient,
  meta: surveyFileMetaSchema.optional().catch(undefined), // set on every save
});

/** A survey as the API returns it: the file, never with a password. */
export type SurveyDocument = Omit<
  z.output<typeof surveyFileSchema>,
  "measureSpeed"
> & { measureSpeed: boolean };

/**
 * The version of the survey file format, stamped into `meta` on each save
 * (survey-store.ts). 2 (after 0.8): a speed test that did not run is null, not
 * zeros.
 */
export const SURVEY_SCHEMA_VERSION = 2;

/**
 * Files before schema version 2 stored a speed test that did not run as
 * zeros; read those as null (savedAsZeros()). Tests with real values are
 * kept. Newer files are left alone, so a real 0 Mbps stays 0, and running
 * it twice changes nothing.
 */
export function migrateUnmeasuredTests<
  T extends Pick<z.output<typeof surveyFileSchema>, "surveyPoints" | "meta">,
>(survey: T): T {
  if ((survey.meta?.schemaVersion ?? 0) >= 2) return survey;
  return {
    ...survey,
    surveyPoints: survey.surveyPoints.map((point) => {
      const iperfData = { ...point.iperfData };
      for (const key of IPERF_TESTS) {
        const test = iperfData[key];
        if (test && savedAsZeros(test)) iperfData[key] = null;
      }
      return { ...point, iperfData };
    }),
  };
}

/**
 * parseSurveyFile() - whatever is in a survey file, as a complete survey for
 * that floor plan. The floor plan name and image URL come from the name the
 * survey was asked for (older files stored a /media/... path that is no
 * longer served), keeping the stored spelling when it is the same file.
 */
export function parseSurveyFile(
  raw: Record<string, unknown>,
  floorPlan: string,
  sameFile: (a: string, b: string) => boolean = (a, b) => a === b,
): SurveyDocument {
  const survey = migrateMeasurementMode(
    migrateUnmeasuredTests(surveyFileSchema.parse(raw)),
  );
  const name =
    survey.floorplanImageName && sameFile(survey.floorplanImageName, floorPlan)
      ? survey.floorplanImageName
      : floorPlan;
  return {
    ...survey,
    floorplanImageName: name,
    floorplanImagePath: mediaUrlFor(name),
  };
}

/* ---------- request bodies (strict) ---------- */

/** What PATCH /api/settings accepts. Every field is optional. */
export const settingsPatchSchema = z
  .strictObject({
    measureSpeed: z.boolean(),
    iperfServerAdrs: z.string().trim(),
    testDuration: z.int().min(1).max(60),
    /** Replaces the whole list. */
    apMapping: z.array(z.strictObject(apMappingSchema.shape)),
    dimensions: z.strictObject({
      width: finite.positive(),
      height: finite.positive(),
    }),
    radiusDivider: finite.positive().nullable(),
    maxOpacity: finite.min(0).max(1),
    minOpacity: finite.min(0).max(1),
    blur: finite.min(0),
    gradient: gradientSchema,
    /** Per map; null removes that map's scale, maps not given are kept. */
    heatmapRanges: z
      .record(z.string(), z.unknown())
      .superRefine((ranges, ctx) => {
        for (const [key, scale] of Object.entries(ranges)) {
          if (!isHeatmapKey(key)) {
            ctx.addIssue({
              code: "custom",
              path: [key],
              message: "is not a heat map",
            });
          } else if (scale !== null) {
            const problem = scaleProblem(key, scale);
            if (problem) {
              ctx.addIssue({ code: "custom", path: [key], message: problem });
            }
          }
        }
      })
      .transform(
        (ranges) =>
          ranges as Partial<
            Record<HeatmapKey, z.output<typeof heatmapScaleSchema> | null>
          >,
      ),
    /** Only the commands given change. */
    iperfCommands: z.strictObject(iperfCommandsSchema.shape).partial(),
  })
  .partial();

export type SettingsPatch = z.output<typeof settingsPatchSchema>;

/**
 * POST /api/surveys/[name]/points. The server assigns the id unless a
 * free one is given; the browser sends "".
 */
export const addPointSchema = z.strictObject({
  ...pointFields,
  id: z.string().optional(),
});

export type NewSurveyPoint = z.output<typeof addPointSchema>;

/**
 * PATCH /api/surveys/[name]/points/[id]. The id cannot change; a label
 * of "" removes the point's name.
 */
export const pointPatchSchema = z.strictObject(pointFields).partial();

export type SurveyPointPatch = z.output<typeof pointPatchSchema>;

/** DELETE /api/surveys/[name]/points. Unknown ids are ignored. */
export const deletePointsSchema = z.strictObject({
  ids: z.array(z.string()),
});

/**
 * POST /api/settings (whole document, kept for older clients). Read like a
 * file, so an export from any version imports; it must name its floor plan.
 */
export const surveyImportSchema = z.looseObject({
  floorplanImageName: z.string().min(1),
});

/**
 * POST /api/settings/copy?from=&to=&parts= (the query string, as an object).
 * parts is a comma-separated list of COPY_PARTS names.
 */
export const copySettingsQuerySchema = z.strictObject({
  from: z.string().trim().min(1),
  to: z.string().trim().min(1),
  parts: z
    .string()
    .transform((s) => [
      ...new Set(
        s
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean),
      ),
    ])
    .pipe(
      z
        .array(
          z.enum(COPY_PART_NAMES as [CopyPart, ...CopyPart[]], {
            error: (issue) =>
              `"${String(issue.input)}" is not one of ${COPY_PART_NAMES.join(", ")}`,
          }),
        )
        .min(1, `name at least one of ${COPY_PART_NAMES.join(", ")}`),
    ),
});

/** POST /api/start-task?action=start */
export const startTaskSchema = z.strictObject({
  // the floor plan (survey) the point is saved to, and where
  survey: z.string().trim().min(1),
  x: finite.min(0),
  y: finite.min(0),
  settings: z.object({
    // missing: derived from the server (localhost or empty = signal only)
    measureSpeed: z.boolean().optional(),
    iperfServerAdrs: z.string(),
    testDuration: finite,
    // left out or "": the server uses the password it holds, if any
    // (sudo-session.ts; how MCP-started measurements get one)
    sudoerPassword: z.string().default(""),
    iperfCommands: iperfCommandsSchema,
  }),
});

/* ---------- usage counts (telemetry.ts) ---------- */

/**
 * data/usage-counts.json, read leniently: a broken field is dropped, so a
 * hand-edited file never stops the app. Not part of any survey.
 */
export const usageCountsFileSchema = z.object({
  /** false: turned off in Settings */
  enabled: z.boolean().optional().catch(undefined),
  /** random, made when usage counts are first on; removed when turned off */
  installId: z.uuid().optional().catch(undefined),
  /** the Install event was sent (never again, even with a new id) */
  installReported: z.boolean().optional().catch(undefined),
  /** UTC day (YYYY-MM-DD) of the last App start event */
  lastAppStartDay: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  lastSent: z
    .object({ event: z.string(), at: z.string() })
    .optional()
    .catch(undefined),
});

export type UsageCountsFile = z.output<typeof usageCountsFileSchema>;

/** PATCH /api/telemetry */
export const usageCountsPatchSchema = z.strictObject({
  enabled: z.boolean(),
});

/* ---------- e2e test scenarios (mock-scenario.ts) ---------- */

/** How the mock reports reading Wi-Fi, as the real scanners name it. */
export const MOCK_WIFI_METHODS = [
  "mock",
  "macos-helper",
  "wdutil",
  "wlan-api",
  "netsh-fallback",
  "iw",
  "iw-sudo",
] as const;

/**
 * PUT /api/e2e/scenario - how the mock backend behaves (e2e tests only).
 * Every field is optional; a missing one has its normal mock behaviour.
 */
export const mockScenarioSchema = z.strictObject({
  /**
   * ok; needs-sudo: refused without a sudo password (and with one other
   * than `sudoPassword`, if set); wrong-sudo: every password is refused;
   * not-connected: Wi-Fi is off; error: reading Wi-Fi fails (`wifiError`)
   */
  wifi: z
    .enum(["ok", "needs-sudo", "wrong-sudo", "not-connected", "error"])
    .optional(),
  /** the password needs-sudo accepts (any non-empty one if unset) */
  sudoPassword: z.string().max(200).optional(),
  /** the message of wifi: "error" */
  wifiError: z.string().min(1).max(500).optional(),
  /** what the Wi-Fi reading is recorded as, for diagnostics */
  wifiMethod: z.enum(MOCK_WIFI_METHODS).optional(),
  /** noise floor in dBm, or null for none (default: -90 to -95 dBm) */
  noise: z.number().int().min(-120).max(0).nullable().optional(),
  /** a fixed signal strength in percent (default: a random walk) */
  signal: z.number().int().min(1).max(100).optional(),
  /**
   * ok; missing: iperf3 is not installed; unreachable: the server doesn't
   * answer; fails-midway: the first test runs, the second one fails
   * (`iperfError`)
   */
  iperf: z.enum(["ok", "missing", "unreachable", "fails-midway"]).optional(),
  /** iperf3's "error" for fails-midway */
  iperfError: z.string().min(1).max(500).optional(),
  /** how long each step takes, in ms (default 150) */
  delayMs: z.number().int().min(0).max(30_000).optional(),
});

export type MockScenario = z.output<typeof mockScenarioSchema>;

/** One line per problem, for a 400 answer. */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const where = issue.path.join(".");
      if (issue.code === "unrecognized_keys") {
        const keys = issue.keys.join(", ");
        return where ? `${where}: unknown ${keys}` : `unknown field ${keys}`;
      }
      return where ? `${where}: ${issue.message}` : issue.message;
    })
    .join("; ");
}
