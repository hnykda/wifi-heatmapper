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
import { getDefaultIperfResults, getDefaultWifiResults } from "@/lib/utils";
import { defaultIperfCommands } from "@/lib/iperfUtils";
import type { IperfResults, SettingsPatch } from "@/lib/types";
import {
  copySettingsQuerySchema,
  parseSurveyFile,
  settingsPatchSchema,
} from "@/lib/schema";
import { applySettingsPatch, copySettings } from "@/lib/survey-ops";
import { defaultSurvey } from "@/lib/survey-defaults";

const work = mkdtempSync(join(tmpdir(), "wifi-heatmapper-mcp-test-"));
const bundle = join(work, "mcp-server.mjs");

function surveyPoint(
  id: string,
  x: number,
  y: number,
  signal: number,
  mbps: number,
) {
  const iperfData = JSON.parse(
    JSON.stringify(getDefaultIperfResults()), // its four tests share one object
  ) as IperfResults;
  iperfData.tcpDownload.bitsPerSecond = mbps * 1e6;
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

  it("lists the step-one tools and prompts", async () => {
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(tools).toEqual([
      "check_setup",
      "copy_settings",
      "get_heatmap_grid",
      "get_settings",
      "get_survey",
      "list_surveys",
      "report_problem",
      "update_settings",
    ]);
    const prompts = (await client.listPrompts()).prompts.map((p) => p.name);
    expect(prompts.sort()).toEqual([
      "analyse_survey",
      "compare_surveys",
      "plan_survey",
    ]);
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

  it("copy_settings refuses a missing source and speed settings with shell syntax", async () => {
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
    const refused = (await client.callTool({
      name: "copy_settings",
      arguments: { from: "Odd.png", to: "Empty.png" },
    })) as CallToolResult;
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused.content)).toMatch(
      /Nothing was changed.*tcpDownload/,
    );
    expect(copies.length).toBe(count);

    // without the speed settings it may copy the rest
    json(
      await client.callTool({
        name: "copy_settings",
        arguments: { from: "Odd.png", to: "Empty.png", parts: ["apNames"] },
      }),
    );
    expect(copies.length).toBe(count + 1);
    delete files["Odd.png"];
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
