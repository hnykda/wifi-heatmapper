/**
 * diagnostics-server.ts - collect the facts for a bug report on the server
 * and build it with diagnostics.ts. Server-only; used by GET /api/diagnostics.
 */
import os from "os";
import { getAppStatus } from "./app-info";
import { findOnPath } from "./server-utils";
import * as surveyStore from "./survey-store";
import { hasSpeedData } from "./measurement-mode";
import { knownSecrets, recentLogLines } from "./logger";
import { usageCountsSummary } from "./telemetry";
import {
  lastMeasurement,
  lastWifiMethod,
  seenNetworks,
} from "./diagnostics-state";
import {
  buildDiagnostics,
  DiagnosticsInput,
  DiagnosticsReport,
  PROBLEM_MAX_LENGTH,
} from "./diagnostics";
import type { AppStatus } from "./types";

export interface CollectOptions {
  /** floor plan name of the survey open in the app */
  survey?: string | null;
  /** the error the app showed */
  problem?: string | null;
  /** false: include network names and addresses */
  hideNetwork?: boolean;
}

function runMode(status: AppStatus): string {
  if (status.desktopApp) return "desktop app";
  if (status.podman) return "Podman";
  if (status.docker) return "Docker";
  if (process.env.NODE_ENV === "development") {
    return "from source, development server (next dev)";
  }
  return "from source (next start)";
}

function expectedWifiMethod(status: AppStatus): string {
  if (status.mockMode) return "mock (synthetic readings)";
  switch (status.platform) {
    case "darwin":
      return status.macosHelper
        ? "macOS Wi-Fi helper (CoreWLAN), wdutil with sudo if it fails"
        : "wdutil with sudo (the Wi-Fi helper is not built)";
    case "win32":
      return "Windows WLAN API, netsh if it fails";
    case "linux":
      return "iw (with sudo if it is refused)";
    default:
      return `unsupported platform ${status.platform}`;
  }
}

async function hasCommand(name: string): Promise<boolean> {
  return (await findOnPath(name)) !== null;
}

type SurveyFacts = {
  survey: DiagnosticsInput["survey"];
  ssids: string[];
  bssids: string[];
  hosts: string[];
};

async function readSurvey(name: string): Promise<SurveyFacts | null> {
  try {
    // read like the app does, so older files get measureSpeed by the same rule
    const data = await surveyStore.read(name);
    if (!data) return null; // no survey yet
    const points = data.surveyPoints;
    return {
      survey: {
        name,
        points: points.length,
        speedPoints: points.filter(hasSpeedData).length,
        speedTests: data.measureSpeed,
        iperfServer: data.iperfServerAdrs,
        testDuration: data.testDuration,
        udpTests: data.udpTests,
      },
      ssids: points.map((p) => p.wifiData.ssid),
      bssids: [
        ...points.map((p) => p.wifiData.bssid),
        ...data.apMapping.map((m) => m.macAddress),
      ],
      hosts: data.iperfServerAdrs ? [data.iperfServerAdrs] : [],
    };
  } catch {
    return null; // unreadable: report without it
  }
}

export async function collectDiagnostics(
  options: CollectOptions = {},
): Promise<DiagnosticsReport> {
  const status = await getAppStatus();
  const facts = options.survey ? await readSurvey(options.survey) : null;
  const method = lastWifiMethod();
  const tools: Record<string, boolean> = {};
  if (status.platform === "linux" && !status.mockMode) {
    const [iw, nmcli] = await Promise.all([
      hasCommand("iw"),
      hasCommand("nmcli"),
    ]);
    tools.iw = iw;
    tools.nmcli = nmcli;
  }

  const input: DiagnosticsInput = {
    generatedAt: new Date().toISOString(),
    app: {
      version: status.version,
      nodeVersion: status.nodeVersion,
      platform: status.platform,
      arch: os.arch(),
      osName: status.osName,
      osRelease: status.osRelease,
      runMode: runMode(status),
      mockMode: status.mockMode,
      dataDir: status.dataDir,
      usageCounts: await usageCountsSummary(),
    },
    wifi: {
      method: method?.method ?? null,
      detail: method?.detail ?? null,
      at: method?.at ?? null,
      expected: expectedWifiMethod(status),
      tools,
    },
    iperf3Version: status.iperf3Version,
    survey: facts?.survey ?? null,
    lastMeasurement: lastMeasurement(),
    problem: options.problem?.slice(0, PROBLEM_MAX_LENGTH) ?? null,
    logLines: recentLogLines(),
  };

  const seen = seenNetworks();
  return buildDiagnostics(
    input,
    {
      secrets: knownSecrets(),
      ssids: [...seen.ssids, ...(facts?.ssids ?? [])],
      bssids: [...seen.bssids, ...(facts?.bssids ?? [])],
      hosts: facts?.hosts ?? [],
      homeDir: os.homedir(),
      hostname: os.hostname(),
    },
    { hideNetwork: options.hideNetwork !== false },
  );
}
