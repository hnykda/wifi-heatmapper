/**
 * prompts.ts - MCP prompts: short, grounded in the tools.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GetPromptResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

function user(text: string): GetPromptResult {
  return { messages: [{ role: "user", content: { type: "text", text } }] };
}

export function analyseSurveyPrompt(name: string): string {
  return `Analyse the Wi-Fi survey "${name}" from wifi-heatmapper.

1. Call get_survey for "${name}". Call get_heatmap_grid for signalStrength, for snr if the points have noise readings, and, if throughput was measured, for tcpDownload-bitsPerSecond.
2. Report, citing point ids and floor-plan coordinates (pixels, origin top left):
   - dead zones and weak areas (from the summary and the null or low cells of the grid);
   - which access point (apName or BSSID, band, channel) serves which part of the plan;
   - throughput bottlenecks: points with good signal but low throughput point at the AP, its uplink, interference or the iperf3 server, not coverage;
   - concrete suggestions: where to move an AP or add one, band or channel changes, where more points are needed.
3. Say clearly what the data can't show: walls and materials, other floors, interference sources, client-specific behaviour, anything between points or outside the radius, and that one reading per point is a snapshot.
4. Watch for readings that point at a bug in the app rather than the Wi-Fi: 0% signal or -100 dBm at many points, channel 0, the same reading everywhere, noise missing on macOS (it should be there), or errors. If you see one, say so and offer to call report_problem, which prepares a redacted bug report and a prefilled GitHub issue link (it posts nothing).
Keep it short. Use the app's units (%, dBm, Mbps).`;
}

export function compareSurveysPrompt(before: string, after: string): string {
  return `Compare two wifi-heatmapper surveys: "${before}" (before) and "${after}" (after).

1. Call get_survey for both. Use the same metrics and thresholds for both.
2. Compare the summaries: median and minimum signal, dead-zone and weak point counts, TCP/UDP throughput, and which access points serve how many points.
3. If both use the same floor plan size, call get_heatmap_grid with the same metric and cells for both and compare cell by cell: where it got better, where worse.
4. If the person will look at the heat maps side by side, suggest fixed colour scales (heatmapRanges, set with update_settings on both surveys, same min and max) so the colours mean the same thing. Ask before changing settings.
5. Note anything that makes the comparison unfair: different point positions or counts, disabled points, throughput measured in one survey only, different iperf3 servers or test durations.
Keep it short.`;
}

export function planSurveyPrompt(name?: string): string {
  const target = name ? ` for "${name}"` : "";
  return `Help plan a Wi-Fi survey with wifi-heatmapper${target}.

1. Call check_setup${name ? ` with name "${name}"` : ""} and list_surveys, and fix any problems first.
2. Suggest how many points and how far apart: roughly one point every 2 to 3 metres (or one or two per room), denser near walls, doorways and where coverage is expected to drop, plus a point near each access point. Use get_survey on an existing survey to see its floor plan size in pixels.
3. Where to stand: at the marked spot, holding the laptop as it is normally used, the same height each time, not blocking it with your body; wait for each measurement to finish before moving.
4. Throughput: run \`iperf3 -s\` on a computer that is wired to the router (not on Wi-Fi), and set its address with update_settings (iperfServerAdrs, measureSpeed true). Keep test duration short (1 to 3 s) for a survey. measureSpeed false measures signal only.
5. Measuring: the person carries the laptop. They can click each spot on the floor plan in the app, or you can guide them spot by spot and start each measurement (the survey_walkthrough prompt).
Keep it short and practical.`;
}

export function surveyWalkthroughPrompt(name: string, rooms?: string): string {
  const roomHint = rooms ? ` Rooms the person mentioned: ${rooms}.` : "";
  return `Guide me through measuring the Wi-Fi survey "${name}" with wifi-heatmapper. I carry the laptop; you start the measurements.${roomHint}

1. Call check_setup with name "${name}" and get_survey for "${name}". Fix problems first. If a sudo password is needed, tell me to type it in the app's Settings; never ask for it here.
2. Plan the spots in floor-plan pixels (origin top left, inside the plan's width and height): a rough grid about 2 to 3 m apart, or one or two per room, skipping spots that already have a point. With existing points, call get_heatmap_grid (signalStrength) and add spots where cells are null (unmeasured) or weak. I can't see pixels: describe each spot by room or landmark and ask me to correct you; I may also pick the spots.
3. For each spot: say where to go ("Go to the kitchen, put the laptop where you'd use it, tell me when you're there"). Wait for me to confirm before every start_measurement; never start one I haven't confirmed. Then wait_for_measurement and tell me the result in plain words (signal %, and speed if measured; mention "Saved without speed" and its reason). If it fails, say why and what to do; don't retry on your own.
4. One at a time. If I say stop, call cancel_measurement. If the app tab is open on this floor plan, I can watch the map fill in.
5. At the end, summarise weak areas briefly and offer analyse_survey.
Keep each message short.`;
}

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "analyse_survey",
    {
      title: "Analyse a survey",
      description:
        "Dead zones, weak areas, which access point serves where, throughput bottlenecks and suggestions",
      argsSchema: {
        name: z.string().describe("Floor plan name (list_surveys)"),
      },
    },
    ({ name }) => user(analyseSurveyPrompt(name)),
  );

  server.registerPrompt(
    "compare_surveys",
    {
      title: "Compare two surveys",
      description: "Before and after, with the same metrics",
      argsSchema: {
        before: z.string().describe("Floor plan name of the earlier survey"),
        after: z.string().describe("Floor plan name of the later survey"),
      },
    },
    ({ before, after }) => user(compareSurveysPrompt(before, after)),
  );

  server.registerPrompt(
    "plan_survey",
    {
      title: "Plan a survey",
      description:
        "How many points, how far apart, where to stand, and the iperf3 server",
      argsSchema: {
        name: z.string().optional().describe("Floor plan name (optional)"),
      },
    },
    ({ name }) => user(planSurveyPrompt(name)),
  );

  server.registerPrompt(
    "survey_walkthrough",
    {
      title: "Walk through a survey",
      description:
        "The agent guides you spot by spot while you carry the laptop, and measures after you confirm each spot",
      argsSchema: {
        name: z.string().describe("Floor plan name (list_surveys)"),
        rooms: z
          .string()
          .optional()
          .describe(
            "Rooms to cover, e.g. 'kitchen, office, bedroom' (optional)",
          ),
      },
    },
    ({ name, rooms }) => user(surveyWalkthroughPrompt(name, rooms)),
  );
}
