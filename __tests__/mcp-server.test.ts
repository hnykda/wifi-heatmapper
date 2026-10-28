/**
 * Builds the real MCP bundle (scripts/build-mcp.mjs), starts it over stdio
 * with the SDK's client, and points it at a fake wifi-heatmapper HTTP API.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { createServer, IncomingMessage, Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  getDefaultIperfResults,
  getDefaultWifiResults,
  iperfTestResult,
} from "@/lib/utils";
import { defaultIperfCommands } from "@/lib/iperfUtils";
import type {
  IperfResults,
  MeasurementJobStatus,
  SettingsPatch,
} from "@/lib/types";
import {
  copySettingsQuerySchema,
  parseSurveyFile,
  pointPatchSchema,
  settingsPatchSchema,
  startTaskSchema,
} from "@/lib/schema";
import {
  applySettingsPatch,
  copySettings,
  updatePoint,
} from "@/lib/survey-ops";
import { defaultSurvey } from "@/lib/survey-defaults";

const work = mkdtempSync(join(tmpdir(), "wifi-heatmapper-mcp-test-"));
const bundle = join(work, "mcp-server.mjs");

function surveyPoint(
  id: string,
  x: number,
  y: number,
  signal: number,
  mbps: number | null, // null: no speed test
) {
  const iperfData: IperfResults = {
    ...getDefaultIperfResults(),
    tcpDownload: mbps === null ? null : iperfTestResult(mbps * 1e6),
  };
  return {
    id,
    x,
    y,
    isEnabled: true,
    timestamp: 1_760_000_000_000,
    wifiData: {
      ...getDefaultWifiResults(),
      ssid: "Home",
      bssid: "aabbccddee01",
      signalStrength: signal,
      rssi: -60,
      channel: 36,
      band: 5,
    },
    iperfData,
  };
}

let files: Record<string, Record<string, unknown>>;
const patches: SettingsPatch[] = [];
const copies: URLSearchParams[] = [];
const diagnosticsQueries: URLSearchParams[] = [];
let diagnosticsLog = "[2026-10-28T09:00:00.000Z] [root:INFO] started";

/** What GET /api/diagnostics answers (the app redacts it). */
function fakeReport(q: URLSearchParams) {
  const hidden = q.get("network") !== "include";
  const summary = [
    "App version: 0.7.0",
    "Operating system: linux 6.8 (linux 6.8, x64)",
    `Network names and addresses: ${hidden ? "hidden" : "included"}`,
    ...(q.get("problem") ? [`Problem shown: ${q.get("problem")}`] : []),
  ].join("\n");
  return {
    networkHidden: hidden,
    version: "0.7.0",
    os: "linux 6.8 (linux 6.8, x64)",
    runMode: "from source (next start)",
    wifiMethod: "iw",
    problem: q.get("problem"),
    summary,
    logExcerpt: diagnosticsLog,
    logLineCount: diagnosticsLog.split("\n").length,
    text: `${summary}\n\nRecent log:\n${diagnosticsLog}`,
  };
}
let app: Server;
let url: string;

/**
 * The fake app's measurement jobs, like lib/measurement-job.ts: one at a
 * time, "Starting" until the preflight has passed, the point saved by the
 * server. `outcome` decides how the next job ends.
 */
type Outcome = "done" | "noSpeed" | "sudo" | "slow";
let outcome: Outcome = "done";
const jobs = new Map<string, MeasurementJobStatus>();
let current: MeasurementJobStatus | null = null;
const startBodies: Record<string, unknown>[] = [];
let sudoHeld = false;

function startJob(survey: string, x: number, y: number) {
  const job: MeasurementJobStatus = {
    id: `job${jobs.size + 1}`,
    survey,
    x,
    y,
    state: "running",
    startedAt: new Date().toISOString(),
    progress: { type: "update", header: "Starting", status: "" },
  };
  jobs.set(job.id, job);
  current = job;
  const how = outcome;
  const step = (ms: number, fn: () => void) =>
    setTimeout(() => job.state === "running" && fn(), ms);
  if (how === "sudo") {
    step(100, () => {
      job.state = "error";
      job.error =
        "Please set sudo password. It is required on macOS unless you build the Wi-Fi helper (npm run build:macos-helper).";
    });
    return job;
  }
  step(100, () => {
    job.progress = { type: "update", header: "Measuring Wi-Fi", status: "" };
  });
  if (how === "slow") return job;
  step(800, () => {
    const f = files[survey] as {
      surveyPoints: unknown[];
      nextPointNum: number;
    };
    const id = `Point_${f.nextPointNum++}`;
    f.surveyPoints.push({
      ...surveyPoint(id, x, y, 64, how === "noSpeed" ? null : 250),
    });
    job.state = "done";
    job.pointId = id;
    if (how === "noSpeed") {
      job.warning =
        "Can't reach the speed test server at 192.168.1.10:5201. Check that iperf3 -s is running there.";
    }
  });
  return job;
}

function body(req: IncomingMessage): Promise<string> {
  return new Promise((ok) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => ok(data));
  });
}

beforeAll(async () => {
  execFileSync(process.execPath, ["scripts/build-mcp.mjs", bundle], {
    stdio: "pipe",
  });
  files = {
    "Home.png": {
      floorplanImageName: "Home.png",
      floorplanImagePath: "/api/media/Home.png",
      surveyPoints: [
        surveyPoint("Point_1", 100, 100, 90, 400),
        surveyPoint("Point_2", 300, 100, 20, 5),
      ],
      iperfServerAdrs: "192.168.1.10",
      testDuration: 1,
      sudoerPassword: "hunter2", // an old file; must never come out
      apMapping: [{ apName: "Hall", macAddress: "aabbccddee*" }],
      nextPointNum: 3,
      dimensions: { width: 400, height: 200 },
      radiusDivider: 150,
      maxOpacity: 0.7,
      minOpacity: 0.2,
      blur: 0.99,
      gradient: { 0: "red", 1: "green" },
      iperfCommands: { ...defaultIperfCommands },
      meta: {
        savedAt: "2026-10-01T00:00:00.000Z",
        appVersion: "0.7.0",
        osName: "macOS",
      },
    },
  };
  app = createServer(async (req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    const send = (status: number, value: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(value));
    };
    if (u.pathname === "/api/status") {
      return send(200, {
        version: "0.7.0",
        nodeVersion: "v22",
        platform: "linux",
        osRelease: "6.8",
        osName: "linux 6.8",
        podman: false,
        docker: false,
        mockMode: false,
        iperf3Version: null,
        dataDir: "/data",
        desktopApp: false,
        macosHelper: null,
      });
    }
    if (u.pathname === "/api/sudo-password" && req.method === "GET") {
      return send(200, { held: sudoHeld });
    }
    if (u.pathname === "/api/start-task") {
      const action = u.searchParams.get("action");
      if (action === "start" && req.method === "POST") {
        const raw = JSON.parse(await body(req));
        startBodies.push(raw);
        const parsed = startTaskSchema.safeParse(raw);
        if (!parsed.success) return send(400, { error: "Invalid request" });
        if (current && current.state === "running") {
          return send(409, {
            error: "A measurement is already running. Wait for it to finish.",
            jobId: current.id,
            job: current,
          });
        }
        const { survey, x, y } = parsed.data;
        const job = startJob(survey, x, y);
        return send(200, { jobId: job.id, job });
      }
      if (action === "stop" && req.method === "POST") {
        const { jobId } = JSON.parse(await body(req));
        const job = current;
        if (!job || job.state !== "running" || job.id !== jobId) {
          return send(200, { stopped: false });
        }
        job.state = "cancelled";
        job.error = "Measurement cancelled";
        return send(200, { stopped: true });
      }
      if (action === "status") {
        const job = jobs.get(u.searchParams.get("id") ?? "");
        return job ? send(200, job) : send(404, { error: "No measurement" });
      }
    }
    if (u.pathname === "/api/diagnostics") {
      diagnosticsQueries.push(u.searchParams);
      return send(200, fakeReport(u.searchParams));
    }
    if (u.pathname === "/api/media") {
      return send(200, { files: ["Home.png", "Empty.png"] });
    }
    if (u.pathname === "/api/settings" && req.method === "GET") {
      if (u.searchParams.get("list") === "true") {
        return send(200, { surveys: Object.keys(files) });
      }
      const f = files[u.searchParams.get("name") ?? ""];
      return f ? send(200, f) : send(404, { error: "Survey not found" });
    }
    if (u.pathname === "/api/settings" && req.method === "PATCH") {
      // what the real route does: strict body, merged into the stored file
      const name = u.searchParams.get("name") ?? "";
      const parsed = settingsPatchSchema.safeParse(JSON.parse(await body(req)));
      if (!parsed.success) return send(400, { error: "Invalid request" });
      patches.push(parsed.data);
      const stored = parseSurveyFile(files[name], name);
      const saved = applySettingsPatch(stored, parsed.data);
      files[name] = saved;
      return send(200, saved);
    }
    const pointPath = u.pathname.match(
      /^\/api\/surveys\/([^/]+)\/points\/([^/]+)$/,
    );
    if (pointPath && req.method === "PATCH") {
      // what the real route does: strict body, 404 for an unknown point
      const [name, id] = pointPath.slice(1).map(decodeURIComponent);
      const parsed = pointPatchSchema.safeParse(JSON.parse(await body(req)));
      if (!parsed.success) return send(400, { error: "Invalid request" });
      if (!files[name]) return send(404, { error: "No survey" });
      const saved = updatePoint(
        parseSurveyFile(files[name], name),
        id,
        parsed.data,
      );
      if (!saved) return send(404, { error: `No point "${id}"` });
      files[name] = parseSurveyFile(
        saved as unknown as Record<string, unknown>,
        name,
      );
      return send(200, files[name]);
    }
    if (u.pathname === "/api/settings/copy" && req.method === "POST") {
      // what the real route does: strict query, source read, target saved
      copies.push(u.searchParams);
      const q = copySettingsQuerySchema.safeParse(
        Object.fromEntries(u.searchParams),
      );
      if (!q.success) return send(400, { error: "Invalid request" });
      const { from, to, parts } = q.data;
      if (!files[from]) return send(404, { error: "There is no survey" });
      const target = files[to]
        ? parseSurveyFile(files[to], to)
        : defaultSurvey(to);
      const saved = copySettings(
        target,
        parseSurveyFile(files[from], from),
        parts,
      );
      files[to] = saved;
      return send(200, saved);
    }
    send(404, { error: "not here" });
  });
  await new Promise<void>((ok) => app.listen(0, "127.0.0.1", ok));
  const addr = app.address();
  url = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
}, 60_000);

afterAll(async () => {
  await new Promise((ok) => app?.close(ok));
  rmSync(work, { recursive: true, force: true });
});

async function connect(env: Record<string, string>) {
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [bundle],
      env: { PATH: process.env.PATH ?? "", ...env },
      stderr: "pipe",
    }),
  );
  return client;
}

function json(result: unknown) {
  const r = result as CallToolResult;
  expect(r.isError, JSON.stringify(r.content)).toBeFalsy();
  const first = r.content[0];
  return JSON.parse(first.type === "text" ? first.text : "null");
}

describe("MCP server over stdio against a fake app", () => {
  let client: Client;
  beforeAll(async () => {
    client = await connect({ WIFI_HEATMAPPER_URL: url });
  }, 30_000);
  afterAll(async () => client?.close());

  it("lists the tools and prompts", async () => {
    const listed = (await client.listTools()).tools;
    const tools = listed.map((t) => t.name).sort();
    expect(tools).toEqual([
      "cancel_measurement",
      "check_setup",
      "copy_settings",
      "get_heatmap_grid",
      "get_settings",
      "get_survey",
      "list_surveys",
      "report_problem",
      "start_measurement",
      "update_point",
      "update_settings",
      "wait_for_measurement",
    ]);
    // measuring is a side effect: clients ask the person first
    for (const name of ["start_measurement", "cancel_measurement"]) {
      expect(listed.find((t) => t.name === name)?.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: false,
      });
    }
    expect(
      listed.find((t) => t.name === "wait_for_measurement")?.annotations
        ?.readOnlyHint,
    ).toBe(true);
    const prompts = (await client.listPrompts()).prompts.map((p) => p.name);
    expect(prompts.sort()).toEqual([
      "analyse_survey",
      "compare_surveys",
      "plan_survey",
      "survey_walkthrough",
    ]);
    const walk = await client.getPrompt({
      name: "survey_walkthrough",
      arguments: { name: "Home.png", rooms: "kitchen, office" },
    });
    const walkText = walk.messages[0].content;
    expect(walkText.type === "text" && walkText.text).toMatch(
      /confirm before every start_measurement/,
    );
    expect(walkText.type === "text" && walkText.text).toContain("kitchen");
    const p = await client.getPrompt({
      name: "analyse_survey",
      arguments: { name: "Home.png" },
    });
    const text = p.messages[0].content;
    expect(text.type === "text" && text.text).toContain("get_survey");
    expect(text.type === "text" && text.text).toContain("report_problem");
    expect(client.getInstructions()).toMatch(/report_problem/);
  });

  it("report_problem returns a redacted summary and an issue link, posting nothing", async () => {
    const count = patches.length;
    const r = json(
      await client.callTool({
        name: "report_problem",
        arguments: { name: "Home.png", problem: "Every point reads 0%" },
      }),
    );
    const q = diagnosticsQueries.at(-1)!;
    expect(q.get("network")).toBeNull(); // hidden unless asked
    expect(q.get("survey")).toBe("Home.png");
    expect(q.get("problem")).toBe("Every point reads 0%");
    expect(r.networkHidden).toBe(true);
    expect(r.summary).toContain("App version: 0.7.0");
    expect(
      r.issueUrl.startsWith(
        "https://github.com/hnykda/wifi-heatmapper/issues/new?template=bug_report.yml&",
      ),
    ).toBe(true);
    const params = new URL(r.issueUrl).searchParams;
    expect(params.get("version")).toBe("0.7.0");
    expect(params.get("title")).toBe("Problem: Every point reads 0%");
    expect(params.get("diagnostics")).toContain("Recent log:");
    expect(r.fullDiagnostics).toBeUndefined();
    expect(patches.length).toBe(count); // nothing written

    json(
      await client.callTool({
        name: "report_problem",
        arguments: { includeNetwork: true },
      }),
    );
    expect(diagnosticsQueries.at(-1)!.get("network")).toBe("include");
  });

  it("report_problem with a long log: summary in the link, full text to paste", async () => {
    diagnosticsLog = Array.from(
      { length: 200 },
      (_, i) =>
        `[2026-10-28T09:00:00.000Z] [root:INFO] line ${i} ${"x".repeat(80)}`,
    ).join("\n");
    try {
      const r = json(
        await client.callTool({ name: "report_problem", arguments: {} }),
      );
      expect(r.issueUrl.length).toBeLessThanOrEqual(7500);
      expect(new URL(r.issueUrl).searchParams.get("diagnostics")).toContain(
        "Paste the copied diagnostics here.",
      );
      expect(r.fullDiagnostics).toContain("line 199");
    } finally {
      diagnosticsLog = "[2026-10-28T09:00:00.000Z] [root:INFO] started";
    }
  });

  it("list_surveys combines floor plans and surveys", async () => {
    const r = json(
      await client.callTool({ name: "list_surveys", arguments: {} }),
    );
    expect(r.surveys).toEqual([
      {
        name: "Home.png",
        hasSurvey: true,
        points: 2,
        enabledPoints: 2,
        throughputTests: true,
        savedAt: "2026-10-01T00:00:00.000Z",
      },
      { name: "Empty.png", hasSurvey: false },
    ]);
  });

  it("get_survey returns points and a summary, never the password", async () => {
    const result = await client.callTool({
      name: "get_survey",
      arguments: { name: "Home.png" },
    });
    expect(JSON.stringify(result)).not.toContain("hunter2");
    const r = json(result);
    expect(r.points).toHaveLength(2);
    expect(r.points[0]).toMatchObject({
      id: "Point_1",
      apName: "Hall",
      signalPercent: 90,
      tcpDownload: { mbps: 400 },
      tcpUpload: null,
    });
    expect(r.summary.deadZonePointIds).toEqual(["Point_2"]);
    expect(r.summary.slowDownloadPointIds).toEqual(["Point_2"]);
    expect(r.summary.accessPoints[0]).toMatchObject({
      apName: "Hall",
      points: 2,
    });

    const missing = (await client.callTool({
      name: "get_survey",
      arguments: { name: "Nope.png" },
    })) as CallToolResult;
    expect(missing.isError).toBe(true);
  });

  it("update_point names a point, get_survey shows it, '' removes it", async () => {
    const named = json(
      await client.callTool({
        name: "update_point",
        arguments: {
          survey: "Home.png",
          pointId: "Point_2",
          label: "  Garden shed ",
        },
      }),
    );
    expect(named).toMatchObject({ pointId: "Point_2", label: "Garden shed" });
    const survey = json(
      await client.callTool({
        name: "get_survey",
        arguments: { name: "Home.png" },
      }),
    );
    expect(survey.points.map((p: { label: string | null }) => p.label)).toEqual(
      [null, "Garden shed"],
    );
    // the measurement itself is untouched
    expect(survey.points[1]).toMatchObject({
      id: "Point_2",
      signalPercent: 20,
    });

    const cleared = json(
      await client.callTool({
        name: "update_point",
        arguments: { survey: "Home.png", pointId: "Point_2", label: "" },
      }),
    );
    expect(cleared.label).toBeNull();

    const unknown = (await client.callTool({
      name: "update_point",
      arguments: { survey: "Home.png", pointId: "Point_9", label: "x" },
    })) as CallToolResult;
    expect(unknown.isError).toBe(true);
    expect(JSON.stringify(unknown.content)).toMatch(/No point .*Point_9/);

    const tooLong = (await client.callTool({
      name: "update_point",
      arguments: {
        survey: "Home.png",
        pointId: "Point_2",
        label: "x".repeat(61),
      },
    })) as CallToolResult;
    expect(tooLong.isError).toBe(true);
  });

  it("get_heatmap_grid computes a grid in display units", async () => {
    const r = json(
      await client.callTool({
        name: "get_heatmap_grid",
        arguments: {
          name: "Home.png",
          metric: "tcpDownload-bitsPerSecond",
          cells: 4,
        },
      }),
    );
    expect(r).toMatchObject({
      unit: "Mbps",
      pointsUsed: 2,
      radius: { pixels: 150, automatic: false },
      columns: 4,
      rows: 2,
      x: [50, 150, 250, 350],
      y: [50, 150],
      colourScale: { min: 0, max: 400, fixed: false },
    });
    // the cell centred on (150, 50) is nearer Point_1 (400 Mbps)
    expect(r.values[0][1]).toBeGreaterThan(300);
    expect(r.values[0][2]).toBeLessThan(100);

    const bad = (await client.callTool({
      name: "get_heatmap_grid",
      arguments: { name: "Home.png", metric: "noise" },
    })) as CallToolResult;
    expect(bad.isError).toBe(true);
  });

  it("check_setup reports iperf3 missing while throughput tests are on", async () => {
    const r = json(
      await client.callTool({
        name: "check_setup",
        arguments: { name: "Home.png" },
      }),
    );
    expect(r.iperf3.installed).toBe(false);
    expect(r.problems.join(" ")).toMatch(/iperf3 is not installed/);
    expect(r.notes.join(" ")).toMatch(/Not checked here/);
  });

  it("update_settings merges allow-listed fields and refuses the rest", async () => {
    const r = json(
      await client.callTool({
        name: "update_settings",
        arguments: {
          name: "Home.png",
          testDuration: 3,
          heatmapRanges: {
            signalStrength: { min: 0, max: 100, enabled: true },
          },
        },
      }),
    );
    expect(r.changed.sort()).toEqual(["heatmapRanges", "testDuration"]);
    // only the changes go to the app, which merges them into the file
    expect(patches.at(-1)).toEqual({
      testDuration: 3,
      heatmapRanges: { signalStrength: { min: 0, max: 100, enabled: true } },
    });
    const saved = files["Home.png"] as Record<string, unknown>;
    expect(saved).not.toHaveProperty("sudoerPassword");
    expect(saved).toMatchObject({
      testDuration: 3,
      iperfServerAdrs: "192.168.1.10",
      radiusDivider: 150,
      heatmapRanges: { signalStrength: { min: 0, max: 100, enabled: true } },
    });
    expect((saved.surveyPoints as unknown[]).length).toBe(2);
    expect(r.settings.testDuration).toBe(3);

    const count = patches.length;
    const refused = (await client.callTool({
      name: "update_settings",
      arguments: { name: "Home.png", iperfServerAdrs: "x; rm -rf ~" },
    })) as CallToolResult;
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused.content)).toMatch(/Nothing was changed/);
    expect(patches.length).toBe(count);
  });

  it("copy_settings copies speed settings by default, and other parts when asked", async () => {
    const r = json(
      await client.callTool({
        name: "copy_settings",
        arguments: { from: "Home.png", to: "Empty.png" },
      }),
    );
    expect(copies.at(-1)?.get("parts")).toBe("speed");
    expect(r).toMatchObject({ copied: ["speed"], created: true });
    expect(r.settings).toMatchObject({
      measureSpeed: true,
      iperfServerAdrs: "192.168.1.10",
      apMapping: [],
      radiusDivider: null,
    });
    const saved = files["Empty.png"] as Record<string, unknown>;
    expect(saved.surveyPoints).toEqual([]);
    expect(saved).not.toHaveProperty("sudoerPassword");

    const again = json(
      await client.callTool({
        name: "copy_settings",
        arguments: {
          from: "Home.png",
          to: "Empty.png",
          parts: ["apNames", "heatmapLook"],
        },
      }),
    );
    expect(again.created).toBe(false);
    expect(again.changed.sort()).toEqual([
      "apMapping",
      "heatmapRanges", // set by the update_settings test
      "radiusDivider",
    ]);
    expect(files["Empty.png"]).toMatchObject({
      apMapping: [{ apName: "Hall", macAddress: "aabbccddee*" }],
      radiusDivider: 150,
      gradient: { 0: "red", 1: "green" },
      dimensions: { width: 100, height: 100 },
    });
  });

  it("copy_settings refuses a missing source, and copies any speed settings the app accepts", async () => {
    const count = copies.length;
    const missing = (await client.callTool({
      name: "copy_settings",
      arguments: { from: "Nope.png", to: "Empty.png" },
    })) as CallToolResult;
    expect(missing.isError).toBe(true);
    expect(JSON.stringify(missing.content)).toMatch(/No survey for/);

    files["Odd.png"] = {
      ...files["Home.png"],
      floorplanImageName: "Odd.png",
      iperfCommands: {
        ...defaultIperfCommands,
        tcpDownload: ["--title", "a; rm -rf ~"],
      },
    };
    // no shell is involved, so these are just iperf3 arguments
    json(
      await client.callTool({
        name: "copy_settings",
        arguments: { from: "Odd.png", to: "Empty.png" },
      }),
    );
    expect(copies.length).toBe(count + 1);
    expect(
      (files["Empty.png"] as { iperfCommands: Record<string, string[]> })
        .iperfCommands.tcpDownload,
    ).toEqual(["--title", "a; rm -rf ~"]);
    delete files["Odd.png"];
  });
});

describe("measuring over MCP against a fake app", () => {
  let client: Client;
  beforeAll(async () => {
    client = await connect({ WIFI_HEATMAPPER_URL: url });
  }, 30_000);
  afterAll(async () => client?.close());

  const call = (name: string, args: Record<string, unknown>) =>
    client.callTool({ name, arguments: args }) as Promise<CallToolResult>;
  const text = (r: CallToolResult) =>
    r.content[0].type === "text" ? r.content[0].text : "";

  it("starts a measurement, waits for it and returns the saved point", async () => {
    outcome = "done";
    const before = (files["Home.png"].surveyPoints as unknown[]).length;
    const started = json(
      await call("start_measurement", { survey: "Home.png", x: 200.4, y: 150 }),
    );
    expect(started).toMatchObject({
      survey: "Home.png",
      x: 200,
      y: 150,
      state: "running",
      speedTest: "on",
    });
    // the speed settings of the survey, and never a password
    const sent = startBodies.at(-1)!;
    expect(sent).not.toHaveProperty("settings.sudoerPassword");
    expect(sent.settings).toMatchObject({
      measureSpeed: true,
      iperfServerAdrs: "192.168.1.10",
    });

    const done = json(
      await call("wait_for_measurement", {
        jobId: started.jobId,
        timeoutSeconds: 10,
      }),
    );
    expect(done).toMatchObject({
      jobId: started.jobId,
      state: "done",
      pointId: `Point_${before + 1}`,
      point: { x: 200, y: 150, signalPercent: 64, tcpDownload: { mbps: 250 } },
    });
    expect(done.summary).toMatch(/^Signal 64% \(-60 dBm\) from Hall/);
    expect(done.savedWithoutSpeed).toBeUndefined();
    expect((files["Home.png"].surveyPoints as unknown[]).length).toBe(
      before + 1,
    );
  });

  it("says when a point was saved without speed", async () => {
    outcome = "noSpeed";
    const started = json(
      await call("start_measurement", { survey: "Home.png", x: 50, y: 50 }),
    );
    const done = json(
      await call("wait_for_measurement", { jobId: started.jobId }),
    );
    expect(done.savedWithoutSpeed).toMatch(
      /^Saved without speed: Can't reach the speed test server/,
    );
    expect(done.point.tcpDownload).toBeNull();
  });

  it("refuses a spot outside the floor plan", async () => {
    const count = startBodies.length;
    const r = await call("start_measurement", {
      survey: "Home.png",
      x: 401,
      y: 10,
    });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/outside the floor plan, which is 400 x 200/);
    expect(startBodies.length).toBe(count);
  });

  it("runs one at a time (409), and cancels only the job named", async () => {
    outcome = "slow";
    const started = json(
      await call("start_measurement", { survey: "Home.png", x: 10, y: 10 }),
    );
    const busy = await call("start_measurement", {
      survey: "Home.png",
      x: 20,
      y: 20,
    });
    expect(busy.isError).toBe(true);
    expect(text(busy)).toMatch(
      new RegExp(`already running \\(job ${started.jobId}.*cancel_measurement`),
    );

    const still = json(
      await call("wait_for_measurement", {
        jobId: started.jobId,
        timeoutSeconds: 0,
      }),
    );
    expect(still).toMatchObject({
      state: "running",
      progress: { step: "Measuring Wi-Fi" },
    });

    const cancelled = json(
      await call("cancel_measurement", { jobId: started.jobId }),
    );
    expect(cancelled).toMatchObject({ cancelled: true });
    const after = json(
      await call("wait_for_measurement", { jobId: started.jobId }),
    );
    expect(after).toMatchObject({ state: "cancelled" });
    const again = json(
      await call("cancel_measurement", { jobId: started.jobId }),
    );
    expect(again).toMatchObject({ cancelled: false, state: "cancelled" });
  });

  it("asks for the sudo password in the app, never in chat", async () => {
    outcome = "sudo";
    const r = await call("start_measurement", {
      survey: "Home.png",
      x: 30,
      y: 30,
    });
    expect(r.isError).toBe(true);
    const body = JSON.parse(text(r));
    expect(body).toMatchObject({
      state: "error",
      sudoPasswordNeeded: true,
      reason:
        "This computer needs the sudo password to read Wi-Fi. Enter it once in the app's Settings (it stays in memory), then try again.",
    });
    expect(body.note).toMatch(/Don't ask for the password in chat/);
    // nothing in the tools takes a password
    const tools = (await client.listTools()).tools;
    expect(JSON.stringify(tools.map((t) => t.inputSchema))).not.toMatch(
      /password/i,
    );

    const setup = json(await call("check_setup", {}));
    expect(setup.sudoPasswordHeld).toBe(false);
    sudoHeld = true;
    expect(json(await call("check_setup", {})).sudoPasswordHeld).toBe(true);
    sudoHeld = false;
  });

  it("says when a job is unknown", async () => {
    for (const name of ["wait_for_measurement", "cancel_measurement"]) {
      const r = await call(name, { jobId: "nope" });
      expect(r.isError, name).toBe(true);
      expect(text(r)).toMatch(/doesn't know measurement "nope"/);
    }
  });
});

describe("MCP server startup", () => {
  it("refuses a non-loopback app URL", () => {
    const r = spawnSync(process.execPath, [bundle], {
      env: {
        ...process.env,
        WIFI_HEATMAPPER_URL: "http://10.1.2.3:3000",
        WIFI_HEATMAPPER_MCP_ALLOW_REMOTE: "",
      },
      encoding: "utf8",
      input: "",
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Refusing to talk to 10.1.2.3:3000/);
  });

  it("says when the app is not running", async () => {
    const client = await connect({ WIFI_HEATMAPPER_URL: "http://127.0.0.1:9" });
    const r = (await client.callTool({
      name: "list_surveys",
      arguments: {},
    })) as CallToolResult;
    await client.close();
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r.content)).toMatch(/Is the app running/);
  });
});
