/**
 * server.ts - the wifi-heatmapper MCP server: tools and prompts.
 *
 * Step one: read surveys, help with setup, interpret results.
 * Step two: measure, with a person carrying the laptop (measure.ts):
 * start_measurement, wait_for_measurement, cancel_measurement. They run
 * commands on this machine, so they are marked as not read-only and the
 * client asks the person before each one.
 * Every tool goes through AppClient (the app's HTTP API); nothing here
 * touches the data directory or the sudo password. Keep read-only tools
 * free of side effects so they stay safe to call without asking.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  computeHeatmapGrid,
  displayUnit,
  HEATMAP_KEYS,
  heatmapPoints,
  influenceRadius,
  isGridHeatmapKey,
  parseHeatmapKey,
  toDisplayUnits,
} from "../lib/heatmap-grid";
import { resolveHeatmapRange, toDisplayRange } from "../lib/heatmap-scale";
import type { MeasurementTestType, SurveyPoint } from "../lib/types";
import { sanitizeFilename } from "../lib/utils";
import { POINT_LABEL_MAX } from "../lib/point-label";
import { COPY_PART_NAMES, type CopyPart } from "../lib/survey-ops";
import { measuresSpeed } from "../lib/measurement-mode";
import { buildIssueUrl, PASTE_HINT } from "../lib/diagnostics";
import {
  AppClient,
  AppRequestError,
  AppUnavailableError,
  StoredSurvey,
} from "./app-client";
import { checkSetup } from "./setup";
import {
  pickSafeSettings,
  SAFE_SETTING_KEYS,
  SettingsPatchError,
  toSettingsPatch,
} from "./settings-allowlist";
import { DEFAULT_THRESHOLDS, describePoint, summarizeSurvey } from "./survey";
import { registerPrompts } from "./prompts";
import {
  describeJob,
  isFinished,
  measurementSettings,
  nearbyPoint,
  pastPreflight,
  positionProblem,
  waitForJob,
} from "./measure";

const metricTitles: Record<MeasurementTestType, string> = {
  signalStrength: "Signal strength",
  snr: "Signal-to-noise ratio",
  tcpDownload: "TCP download",
  tcpUpload: "TCP upload",
  udpDownload: "UDP download",
  udpUpload: "UDP upload",
};

/** Promise.all over items, running at most `limit` of fn at once. */
async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

function ok(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

function fail(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

/** Turn app and validation errors into tool errors the agent can act on. */
async function guarded(
  run: () => Promise<CallToolResult>,
): Promise<CallToolResult> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof AppUnavailableError) return fail(err.message);
    if (err instanceof SettingsPatchError) {
      return fail(`Nothing was changed:\n- ${err.problems.join("\n- ")}`);
    }
    if (err instanceof AppRequestError) {
      return fail(`The app answered with an error: ${err.message}`);
    }
    return fail(err instanceof Error ? err.message : String(err));
  }
}

async function loadSurvey(client: AppClient, name: string) {
  const survey = await client.survey(name);
  if (!survey) {
    throw new Error(
      `No survey for "${name}". Call list_surveys for the names; a floor plan gets a survey once it has been opened in the app.`,
    );
  }
  return survey;
}

const nameArg = z
  .string()
  .min(1)
  .describe(
    'Floor plan name as list_surveys returns it, e.g. "EmptyFloorPlan.png"',
  );

export function createMcpServer(client: AppClient, version: string): McpServer {
  const server = new McpServer(
    { name: "wifi-heatmapper", title: "WiFi Heatmapper", version },
    {
      instructions:
        "Reads Wi-Fi surveys from a running wifi-heatmapper app on this computer: " +
        "signal strength and iperf3 throughput measured at points on a floor plan. " +
        "Start with list_surveys, then get_survey for the numbers and get_heatmap_grid " +
        "for a coarse map. Coordinates are floor-plan image pixels, origin top left. " +
        'Points have an id ("Point_3") and may have a label the person gave them ("Kitchen"): call points by their label when they have one. ' +
        "It can take measurements with a person carrying the laptop: agree on the spot with them, ask them to go there and " +
        "confirm before every start_measurement, then wait_for_measurement; one at a time (survey_walkthrough guides this). " +
        "It cannot see the rendered heat map images or handle the sudo password: never ask for it in chat, the person types it in the app's Settings. " +
        "If something looks like a bug in the app rather than a Wi-Fi problem (an error message, impossible readings " +
        "such as 0% signal or -100 dBm at every point or channel 0, no noise readings on macOS, Windows saying it " +
        "can't read Wi-Fi through the WLAN API), suggest reporting it and call report_problem: it returns a redacted summary and a " +
        "prefilled GitHub issue link for the person to open. It never posts anything.",
    },
  );

  server.registerTool(
    "list_surveys",
    {
      title: "List surveys",
      description:
        "Floor plans in the app and their surveys: point counts, when each was last saved, and whether throughput tests are on.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () =>
      guarded(async () => {
        const [floorPlans, surveyNames] = await Promise.all([
          client.floorPlans(),
          client.surveyNames(),
        ]);
        const surveyed = new Set(surveyNames);
        // A few at a time: hundreds of parallel requests make a dev
        // server drop connections ("fetch failed").
        const surveys = await mapWithLimit(
          surveyNames,
          4,
          // One damaged file must not hide the rest
          async (n) =>
            [
              n,
              await client.survey(n).catch(() => "unreadable" as const),
            ] as const,
        );
        const byName = new Map(surveys);
        type Entry = {
          name: string;
          hasSurvey: boolean;
          floorPlanMissing?: boolean;
          points?: number;
          enabledPoints?: number;
          throughputTests?: boolean;
          savedAt?: string | null;
          unreadable?: boolean;
        };
        const describe = (
          survey: StoredSurvey | "unreadable" | null | undefined,
        ): Partial<Entry> => {
          if (survey === "unreadable") return { unreadable: true };
          if (!survey) return {};
          const pts = survey.surveyPoints ?? [];
          return {
            points: pts.length,
            enabledPoints: pts.filter((p) => p.isEnabled !== false).length,
            throughputTests: measuresSpeed(survey),
            savedAt: survey.meta?.savedAt ?? null,
          };
        };
        const used = new Set<string>();
        const list: Entry[] = floorPlans.map((name) => {
          const surveyName = sanitizeFilename(name);
          used.add(surveyName);
          return {
            name,
            hasSurvey: surveyed.has(surveyName),
            ...describe(byName.get(surveyName)),
          };
        });
        // surveys whose floor plan image is gone
        for (const name of surveyNames) {
          if (!used.has(name)) {
            list.push({
              name,
              hasSurvey: true,
              floorPlanMissing: true,
              ...describe(byName.get(name)),
            });
          }
        }
        return ok({ app: client.baseUrl.origin, surveys: list });
      }),
  );

  server.registerTool(
    "get_survey",
    {
      title: "Get survey",
      description:
        "All points of a survey (id and the name the person gave it, if any, position in floor-plan pixels, signal %, RSSI dBm, SSID/BSSID, access point name, " +
        "iperf3 results, enabled or not) and a summary: min/median/max per metric over enabled points, " +
        "dead-zone, weak and slow points, and the access points seen. Throughput is in Mbps; null means the test did not run.",
      inputSchema: {
        name: nameArg,
        weakSignalPercent: z
          .number()
          .min(0)
          .max(100)
          .optional()
          .describe(
            `Signal below this is weak (default ${DEFAULT_THRESHOLDS.weakSignalPercent}%, about -70 dBm)`,
          ),
        deadSignalPercent: z
          .number()
          .min(0)
          .max(100)
          .optional()
          .describe(
            `Signal below this is a dead zone (default ${DEFAULT_THRESHOLDS.deadSignalPercent}%, about -85 dBm)`,
          ),
        slowDownloadMbps: z
          .number()
          .min(0)
          .optional()
          .describe(
            `TCP download below this is slow (default ${DEFAULT_THRESHOLDS.slowDownloadMbps} Mbps)`,
          ),
        includePoints: z
          .boolean()
          .optional()
          .describe("Set false to get only the summary (default true)"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) =>
      guarded(async () => {
        const survey = await loadSurvey(client, args.name);
        const points = (survey.surveyPoints ?? []).map((p) =>
          describePoint(p, survey.apMapping),
        );
        const summary = summarizeSurvey(points, {
          weakSignalPercent:
            args.weakSignalPercent ?? DEFAULT_THRESHOLDS.weakSignalPercent,
          deadSignalPercent:
            args.deadSignalPercent ?? DEFAULT_THRESHOLDS.deadSignalPercent,
          slowDownloadMbps:
            args.slowDownloadMbps ?? DEFAULT_THRESHOLDS.slowDownloadMbps,
        });
        return ok({
          name: args.name,
          floorPlan: {
            width: survey.dimensions?.width,
            height: survey.dimensions?.height,
            units: "pixels, origin top left",
          },
          throughputTests: measuresSpeed(survey)
            ? `on (server ${survey.iperfServerAdrs})`
            : "off (signal only)",
          savedAt: survey.meta?.savedAt ?? null,
          measuredWith: survey.meta
            ? { appVersion: survey.meta.appVersion, os: survey.meta.osName }
            : null,
          summary,
          ...(args.includePoints === false ? {} : { points }),
        });
      }),
  );

  server.registerTool(
    "get_settings",
    {
      title: "Get settings",
      description:
        "The settings of a survey that update_settings can change: iperf3 server, test duration, extra iperf3 options, " +
        "access point names, heat spot radius, opacity and fixed colour scales. The sudo password is never included.",
      inputSchema: { name: nameArg },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) =>
      guarded(async () => {
        const survey = await loadSurvey(client, args.name);
        const { radius, automatic } = influenceRadius({
          radiusDivider: survey.radiusDivider ?? null,
          surveyPoints: survey.surveyPoints ?? [],
        });
        return ok({
          name: args.name,
          settings: pickSafeSettings(survey),
          notes: {
            measureSpeed:
              "true: signal and speed (iperf3 throughput tests); false: signal only.",
            iperfServerAdrs:
              "The speed test (iperf3) server, used when measureSpeed is true.",
            udpTests:
              "true: each point also runs the fixed-rate (UDP) tests for jitter and lost packets; false: TCP download and upload only.",
            radiusDivider: `Heat spot radius in floor-plan pixels; null is automatic (currently ${radius}px${automatic ? ", automatic" : ""}).`,
            heatmapRanges:
              "Fixed colour scales per map, in display units (signal %, Mbps, ms, counts). Maps without one scale automatically.",
            sudoPassword:
              "Not available here. It is typed in the app and never saved.",
          },
        });
      }),
  );

  const scale = z.object({
    min: z.number(),
    max: z.number(),
    enabled: z.boolean(),
  });

  server.registerTool(
    "update_settings",
    {
      title: "Update settings",
      description:
        "Change allow-listed settings of a survey and save the survey file. Changes are real and apply to the next measurement. " +
        "Only the fields given change; apMapping replaces the whole list; heatmapRanges merges per map (null removes one). " +
        "Changes made in the app at the same time are kept.",
      inputSchema: {
        name: nameArg,
        measureSpeed: z
          .boolean()
          .optional()
          .describe(
            "true: measure signal and speed (needs an iperf3 server); false: signal only",
          ),
        iperfServerAdrs: z
          .string()
          .optional()
          .describe(
            'iperf3 server: a host name or IP address with an optional port, e.g. "192.168.1.10", "nas.local:5201" or "[fe80::1]:5201". Without measureSpeed, "localhost" turns speed tests off and any other server turns them on',
          ),
        testDuration: z
          .number()
          .int()
          .optional()
          .describe("Seconds per iperf3 test, 1 to 60"),
        udpTests: z
          .boolean()
          .optional()
          .describe(
            "true: also run the fixed-rate (UDP) download and upload tests, for jitter and lost packets (doubles the time per point); false: TCP download and upload only",
          ),
        iperfCommands: z
          .object({
            tcpDownload: z.array(z.string()).optional(),
            tcpUpload: z.array(z.string()).optional(),
            udpDownload: z.array(z.string()).optional(),
            udpUpload: z.array(z.string()).optional(),
          })
          .optional()
          .describe(
            'Extra iperf3 options per test, one argument per item, e.g. ["-b", "100M"] or ["-P", "4"]. The app sets the server, port, duration, -R, -u and -J itself. No shell is involved',
          ),
        apMapping: z
          .array(z.object({ apName: z.string(), macAddress: z.string() }))
          .optional()
          .describe("Access point names by BSSID; replaces the whole list"),
        radiusDivider: z
          .number()
          .nullable()
          .optional()
          .describe(
            "Heat spot radius in floor-plan pixels, or null for automatic",
          ),
        maxOpacity: z
          .number()
          .optional()
          .describe("0 to 1, at the strongest values"),
        minOpacity: z
          .number()
          .optional()
          .describe("0 to 1, at the weakest values"),
        heatmapRanges: z
          .record(z.string(), scale.nullable())
          .optional()
          .describe(
            `Fixed colour scales by map (${HEATMAP_KEYS.join(", ")}), in %, Mbps, ms or counts; null removes one`,
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    ({ name, ...patch }) =>
      guarded(async () => {
        const changes = Object.fromEntries(
          Object.entries(patch).filter(([, v]) => v !== undefined),
        );
        if (Object.keys(changes).length === 0) {
          return fail(
            `Nothing to change: give at least one of ${SAFE_SETTING_KEYS.join(", ")}. Other settings, and the sudo password, can only be changed in the app.`,
          );
        }
        const body = toSettingsPatch(changes);
        const survey = await loadSurvey(client, name);
        const before = pickSafeSettings(survey);
        // The app applies the patch to the file as it is now, so changes
        // made in the meantime (in the app or by another agent) are kept.
        const saved = await client.patchSettings(name, body);
        const after = pickSafeSettings(saved);
        const changed = Object.keys(changes).filter(
          (k) =>
            JSON.stringify(before[k as keyof typeof before]) !==
            JSON.stringify(after[k as keyof typeof after]),
        );
        return ok({
          name,
          saved: true,
          changed,
          settings: after,
          note: "If the app is open on this floor plan, it shows the change after its next save or a reload.",
        });
      }),
  );

  server.registerTool(
    "copy_settings",
    {
      title: "Copy settings",
      description:
        "Copy settings from one survey to another and save the target survey, e.g. to set up a second floor plan like the first. " +
        "parts: speed (measure signal only or signal and speed, iperf3 server, test duration, extra iperf3 options), " +
        "apNames (access point names), heatmapLook (heat spot radius, opacity, blur, colours, fixed colour scales). " +
        "Points, the floor plan, its size and the sudo password are never copied. Changes are real.",
      inputSchema: {
        from: nameArg.describe("Survey to copy from, as list_surveys names it"),
        to: nameArg.describe(
          "Survey to copy into, as list_surveys names it (created if the floor plan has none)",
        ),
        parts: z
          .array(z.enum(COPY_PART_NAMES as [CopyPart, ...CopyPart[]]))
          .min(1)
          .optional()
          .describe(
            `What to copy: ${COPY_PART_NAMES.join(", ")} (default ["speed"])`,
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args) =>
      guarded(async () => {
        const parts = [...new Set(args.parts ?? (["speed"] as CopyPart[]))];
        await loadSurvey(client, args.from); // a clear error if it's missing
        const before = await client.survey(args.to);
        const saved = await client.copySettings(args.from, args.to, parts);
        const was = before ? pickSafeSettings(before) : null;
        const after = pickSafeSettings(saved);
        const changed = (Object.keys(after) as (keyof typeof after)[]).filter(
          (k) => !was || JSON.stringify(was[k]) !== JSON.stringify(after[k]),
        );
        return ok({
          from: args.from,
          to: args.to,
          copied: parts,
          created: !before,
          changed: was ? changed : undefined,
          settings: after,
          note: "If the app is open on this floor plan, it shows the change after its next save or a reload.",
        });
      }),
  );

  server.registerTool(
    "check_setup",
    {
      title: "Check setup",
      description:
        "What the app can tell without measuring: app version and OS, mock mode, whether iperf3 is installed, " +
        "the macOS Wi-Fi helper and Location access, whether the app holds a sudo password (yes or no, never the password), " +
        "and (with a survey name) whether throughput tests are set up. Says what only a measurement can check.",
      inputSchema: { name: nameArg.optional() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => guarded(async () => ok(await checkSetup(client, args.name))),
  );

  server.registerTool(
    "get_heatmap_grid",
    {
      title: "Get heat map grid",
      description:
        "A coarse numeric heat map, computed the way the app draws it (inverse-distance weighting, power 3, " +
        "the app's influence radius) because the image itself is drawn in the browser. " +
        "values[row][column] in the map's units; null where no point is within the radius (blank on the map). " +
        "x and y are cell centres in floor-plan pixels.",
      inputSchema: {
        name: nameArg,
        metric: z
          .string()
          .default("signalStrength")
          .describe(`Which map: ${HEATMAP_KEYS.join(", ")}`),
        cells: z
          .number()
          .int()
          .min(2)
          .max(60)
          .default(20)
          .describe("Cells along the longer side of the floor plan (2 to 60)"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) =>
      guarded(async () => {
        const metric = args.metric ?? "signalStrength";
        if (!isGridHeatmapKey(metric)) {
          return fail(
            `Unknown metric "${metric}". Use one of: ${HEATMAP_KEYS.join(", ")}.`,
          );
        }
        const survey = await loadSurvey(client, args.name);
        const { width, height } = survey.dimensions ?? { width: 0, height: 0 };
        if (!(width > 1 && height > 1)) {
          return fail(
            "The floor plan size is not known yet. Open this floor plan in the app once, then try again.",
          );
        }
        const surveyPoints: SurveyPoint[] = survey.surveyPoints ?? [];
        const { metric: test, property } = parseHeatmapKey(metric);
        const raw = heatmapPoints(surveyPoints, metric);
        const unit = displayUnit(property);
        const points = raw.map((p) => ({
          ...p,
          value: toDisplayUnits(property, p.value),
        }));
        const { radius, automatic } = influenceRadius({
          radiusDivider: survey.radiusDivider ?? null,
          surveyPoints,
        });
        const digits = unit === "ms" ? 2 : 1;
        const grid = computeHeatmapGrid({
          points,
          width,
          height,
          radius,
          cells: args.cells ?? 20,
          round: (v) => Math.round(v * 10 ** digits) / 10 ** digits,
        });
        const savedScale = survey.heatmapRanges?.[metric];
        const range = toDisplayRange(
          property,
          resolveHeatmapRange(
            property,
            raw.map((p) => p.value),
            savedScale,
          ),
        );
        return ok({
          name: args.name,
          metric,
          title:
            test === "signalStrength"
              ? "Signal strength"
              : `${metricTitles[test]}, ${property}`,
          unit,
          pointsUsed: points.length,
          radius: { pixels: radius, automatic },
          floorPlan: { width, height },
          colourScale: {
            min: range.min,
            max: range.max,
            fixed: savedScale?.enabled === true,
            note: "Colours clamp to this range; values outside it show as the end colours.",
          },
          columns: grid.columns,
          rows: grid.rows,
          cellSize: {
            width: Math.round(grid.cellWidth * 10) / 10,
            height: Math.round(grid.cellHeight * 10) / 10,
          },
          x: grid.x.map((v) => Math.round(v)),
          y: grid.y.map((v) => Math.round(v)),
          values: grid.values,
        });
      }),
  );

  server.registerTool(
    "report_problem",
    {
      title: "Report a problem",
      description:
        "Prepare a bug report for the wifi-heatmapper developers: app version, OS, how the app runs, how Wi-Fi is read, " +
        "iperf3, the last measurement and the recent server log, with the sudo password removed and network names, MAC and " +
        "IP addresses replaced by placeholders (unless includeNetwork). Returns the summary and a prefilled GitHub issue link " +
        "for the person to open and submit. Nothing is posted. Use it for app bugs (errors, impossible readings), not for weak Wi-Fi.",
      inputSchema: {
        name: nameArg
          .optional()
          .describe("Floor plan name of the survey involved (optional)"),
        problem: z
          .string()
          .max(2000)
          .optional()
          .describe(
            "What went wrong, in a sentence or two: the error message or the odd readings",
          ),
        includeNetwork: z
          .boolean()
          .optional()
          .describe(
            "Keep network names, MAC and IP addresses (default false). Only if the person agrees.",
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) =>
      guarded(async () => {
        const report = await client.diagnostics({
          survey: args.name,
          problem: args.problem,
          includeNetwork: args.includeNetwork === true,
        });
        const link = buildIssueUrl(report);
        return ok({
          issueUrl: link.url,
          summary: report.summary,
          networkHidden: report.networkHidden,
          logLines: report.logLineCount,
          ...(link.complete
            ? {
                note: "The link carries the whole report, log included. Give it to the person to open, check and submit; nothing has been sent.",
              }
            : {
                note: `The report is too long for the link, which carries only the summary. Give the person the link and the full text below to paste where the issue says "${PASTE_HINT}". Nothing has been sent.`,
                fullDiagnostics: report.text,
              }),
        });
      }),
  );

  server.registerTool(
    "start_measurement",
    {
      title: "Start a measurement",
      description:
        "Measure Wi-Fi (and speed, if the survey has it on) at a spot on the floor plan, where the person is holding the laptop now, " +
        "and save it as a new point. Runs commands on this computer (Wi-Fi tools, iperf3). " +
        "Only after the person has confirmed they are at that spot and ready. One at a time. " +
        "Returns the job id; then call wait_for_measurement.",
      inputSchema: {
        survey: nameArg,
        x: z
          .number()
          .describe("Floor-plan pixels from the left (0 to the plan's width)"),
        y: z
          .number()
          .describe("Floor-plan pixels from the top (0 to the plan's height)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (args) =>
      guarded(async () => {
        const survey = await loadSurvey(client, args.survey);
        const x = Math.round(args.x);
        const y = Math.round(args.y);
        const problem = positionProblem(x, y, survey.dimensions);
        if (problem) return fail(`Nothing was measured. ${problem}`);
        // the name the page uses, so an open tab follows the job
        const name = survey.floorplanImageName || args.survey;
        const answer = await client.startMeasurement(
          name,
          x,
          y,
          measurementSettings(survey),
        );
        if (!answer.started) {
          const r = answer.running;
          return fail(
            `A measurement is already running (job ${r.id}, ${r.survey} at (${r.x}, ${r.y}), ${r.state}). ` +
              `Only one runs at a time. Wait for it with wait_for_measurement, or cancel it with cancel_measurement if the person agrees.`,
          );
        }
        // The first step checks that Wi-Fi can be read (and the sudo
        // password): wait for it, so a failure there is reported at once
        const job =
          (await waitForJob(client, answer.job.id, {
            timeoutMs: 5000,
            pollMs: 250,
            until: pastPreflight,
          })) ?? answer.job;
        if (isFinished(job)) {
          const { isError, value } = await describeJob(client, job);
          return isError ? { ...ok(value), isError: true } : ok(value);
        }
        const near = nearbyPoint(survey, x, y);
        return ok({
          jobId: job.id,
          survey: name,
          x,
          y,
          state: job.state,
          speedTest: measuresSpeed(survey) ? "on" : "off (signal only)",
          ...(near
            ? {
                note: `${near.name} is ${near.distancePixels} px away; this adds another point next to it.`,
              }
            : {}),
          next: "Call wait_for_measurement with this jobId. Ask the person to keep the laptop still until it is done.",
        });
      }),
  );

  server.registerTool(
    "wait_for_measurement",
    {
      title: "Wait for a measurement",
      description:
        "Wait (up to timeoutSeconds) for a measurement to finish, and return the saved point described like get_survey's points, " +
        "with a one-line summary, 'Saved without speed: <reason>' if the speed test was skipped, or why it failed. " +
        "timeoutSeconds 0 only checks. If it is still running when the time is up, call it again.",
      inputSchema: {
        jobId: z.string().min(1).describe("From start_measurement"),
        timeoutSeconds: z
          .number()
          .min(0)
          .max(300)
          .default(45)
          .describe(
            "How long to wait, 0 to 300 seconds (default 45; many clients give up on a call after 60)",
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args, extra) =>
      guarded(async () => {
        const progressToken = extra._meta?.progressToken;
        let step = 0;
        const job = await waitForJob(client, args.jobId, {
          timeoutMs: (args.timeoutSeconds ?? 45) * 1000,
          signal: extra.signal,
          onProgress: (j) => {
            if (progressToken === undefined || !j.progress) return;
            void extra
              .sendNotification({
                method: "notifications/progress",
                params: {
                  progressToken,
                  progress: ++step,
                  message: [j.progress.header, j.progress.status]
                    .filter(Boolean)
                    .join(": "),
                },
              })
              .catch(() => {});
          },
        });
        if (!job) {
          return fail(
            `The app doesn't know measurement "${args.jobId}". It keeps the last 20, and forgets them when it restarts.`,
          );
        }
        const { isError, value } = await describeJob(client, job);
        return isError ? { ...ok(value), isError: true } : ok(value);
      }),
  );

  server.registerTool(
    "update_point",
    {
      title: "Name a point",
      description:
        'Give a survey point a label (a name such as "Kitchen" or "Desk upstairs"), shown in the app instead of its id, ' +
        'or remove it with "". Only the label changes: the id and the measured values stay as they were. ' +
        "Useful right after wait_for_measurement, with the name the person uses for that spot.",
      inputSchema: {
        survey: nameArg,
        pointId: z
          .string()
          .min(1)
          .describe(
            'The point\'s id, e.g. "Point_3" (from get_survey or wait_for_measurement)',
          ),
        label: z
          .string()
          .max(POINT_LABEL_MAX)
          .describe(
            `The name, at most ${POINT_LABEL_MAX} characters; "" removes it`,
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args) =>
      guarded(async () => {
        const survey = await loadSurvey(client, args.survey);
        if (!(survey.surveyPoints ?? []).some((p) => p.id === args.pointId)) {
          return fail(
            `No point "${args.pointId}" in ${args.survey}. Call get_survey for the point ids.`,
          );
        }
        const name = survey.floorplanImageName || args.survey;
        const saved = await client.updatePoint(name, args.pointId, {
          label: args.label,
        });
        const point = saved.surveyPoints?.find((p) => p.id === args.pointId);
        return ok({
          survey: name,
          pointId: args.pointId,
          label: point?.label ?? null,
          note: "Saved. An open app tab shows the new name.",
        });
      }),
  );

  server.registerTool(
    "cancel_measurement",
    {
      title: "Cancel a measurement",
      description:
        "Stop a running measurement at once (its iperf3 too). Nothing is saved for it. Only stops the job named.",
      inputSchema: {
        jobId: z.string().min(1).describe("From start_measurement"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args) =>
      guarded(async () => {
        if (await client.stopMeasurement(args.jobId)) {
          return ok({
            jobId: args.jobId,
            cancelled: true,
            note: "Stopped. Nothing was saved for it.",
          });
        }
        const job = await client.measurement(args.jobId);
        if (!job) {
          return fail(`The app doesn't know measurement "${args.jobId}".`);
        }
        const why =
          job.state === "done"
            ? `It had already finished and was saved as ${job.pointId}.`
            : job.state === "saving"
              ? "It has finished measuring and is being saved; it can't be stopped now."
              : job.state === "cancelled"
                ? "It was already cancelled."
                : job.state === "error"
                  ? `It had already failed: ${job.error}`
                  : "It could not be stopped.";
        return ok({
          jobId: args.jobId,
          cancelled: false,
          state: job.state,
          note: why,
        });
      }),
  );

  registerPrompts(server);
  return server;
}
