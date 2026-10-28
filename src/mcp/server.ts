/**
 * server.ts - the wifi-heatmapper MCP server: tools and prompts.
 *
 * Step one: read surveys, help with setup, interpret results.
 * Every tool goes through AppClient (the app's HTTP API); nothing here
 * touches the data directory.
 *
 * Step two (not built yet) adds measuring: a tool that POSTs
 * /api/start-task?action=start, follows /api/start-task?action=results and
 * adds the point to the survey. It will need its own confirmation story,
 * because it runs iperf3 (and maybe sudo) on this machine. Keep read-only
 * tools free of side effects so they stay safe to call without asking.
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
import { measuresSpeed } from "../lib/measurement-mode";
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
        "This server cannot take measurements, see the rendered heat map images, or handle the sudo password.",
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
        "All points of a survey (position in floor-plan pixels, signal %, RSSI dBm, SSID/BSSID, access point name, " +
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
        "The settings of a survey that update_settings can change: iperf3 server, test duration, iperf3 commands, " +
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
            'iperf3 server, e.g. "192.168.1.10" or "192.168.1.10:5201". Without measureSpeed, "localhost" turns speed tests off and any other server turns them on',
          ),
        testDuration: z
          .number()
          .int()
          .optional()
          .describe("Seconds per iperf3 test, 1 to 60"),
        iperfCommands: z
          .object({
            tcpDownload: z.string().optional(),
            tcpUpload: z.string().optional(),
            udpDownload: z.string().optional(),
            udpUpload: z.string().optional(),
          })
          .optional()
          .describe(
            "iperf3 command templates with {server}, {port}, {duration}; plain arguments only, must include -J",
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
    "check_setup",
    {
      title: "Check setup",
      description:
        "What the app can tell without measuring: app version and OS, mock mode, whether iperf3 is installed, " +
        "the macOS Wi-Fi helper and Location access, and (with a survey name) whether throughput tests are set up. " +
        "Says what can only be checked by taking a measurement in the app.",
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

  registerPrompts(server);
  return server;
}
