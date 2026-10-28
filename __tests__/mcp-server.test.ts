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
import type { IperfResults } from "@/lib/types";

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
const posts: Record<string, unknown>[] = [];
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
    if (u.pathname === "/api/settings" && req.method === "POST") {
      const s = JSON.parse(await body(req));
      posts.push(s);
      files[s.floorplanImageName] = s;
      return send(200, { status: "success" });
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
      "get_heatmap_grid",
      "get_settings",
      "get_survey",
      "list_surveys",
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
    const saved = posts.at(-1)!;
    expect(saved).not.toHaveProperty("sudoerPassword");
    expect(saved).toMatchObject({
      testDuration: 3,
      iperfServerAdrs: "192.168.1.10",
      radiusDivider: 150,
      heatmapRanges: { signalStrength: { min: 0, max: 100, enabled: true } },
    });
    expect((saved.surveyPoints as unknown[]).length).toBe(2);

    const count = posts.length;
    const refused = (await client.callTool({
      name: "update_settings",
      arguments: { name: "Home.png", iperfServerAdrs: "x; rm -rf ~" },
    })) as CallToolResult;
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused.content)).toMatch(/Nothing was changed/);
    expect(posts.length).toBe(count);
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
