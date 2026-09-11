/**
 * app-info.ts - facts about this running instance of wifi-heatmapper.
 * Server-only. Exposed to the browser through GET /api/status.
 */
import os from "os";
import isDocker from "is-docker";
import pkg from "../../package.json";
import { execAsync } from "./server-utils";
import { getDataDir } from "./server-paths";
import { AppStatus } from "./types";

export const APP_VERSION: string = pkg.version;

export function isMockMode(): boolean {
  const v = process.env.WIFI_HEATMAPPER_MOCK;
  return !!v && v !== "0" && v.toLowerCase() !== "false";
}

let cached: Promise<AppStatus> | null = null;

export function getAppStatus(): Promise<AppStatus> {
  if (!cached) cached = buildAppStatus();
  return cached;
}

async function buildAppStatus(): Promise<AppStatus> {
  let iperf3Version: string | null = null;
  try {
    const { stdout } = await execAsync("iperf3 --version");
    iperf3Version = stdout.split("\n")[0].trim();
  } catch {
    iperf3Version = null;
  }
  return {
    version: APP_VERSION,
    nodeVersion: process.version,
    platform: os.platform(),
    osRelease: os.release(),
    osName: describeOS(),
    docker: isDocker(),
    mockMode: isMockMode(),
    iperf3Version,
    dataDir: getDataDir(),
  };
}

/**
 * describeOS() - a human-friendly OS name, e.g. "macOS Sequoia 15.5",
 * "Windows 11 Enterprise" or "linux 6.8.0".
 */
export function describeOS(): string {
  const platform = os.platform();
  if (platform === "darwin") {
    return `macOS ${macOSName()}`.trim();
  }
  if (platform === "win32") {
    return os.version();
  }
  return `${platform} ${os.release()}`;
}

const MACOS_NAMES: Record<number, string> = {
  11: "Big Sur",
  12: "Monterey",
  13: "Ventura",
  14: "Sonoma",
  15: "Sequoia",
  26: "Tahoe",
};

function macOSName(): string {
  // os.release() is the Darwin kernel version; macOS major = darwin major - 9
  // (Darwin 24 -> macOS 15). From macOS 26 Apple aligned the numbers (Darwin 25 -> macOS 26).
  const darwinMajor = parseInt(os.release().split(".")[0], 10);
  if (Number.isNaN(darwinMajor)) return "";
  const major = darwinMajor >= 25 ? darwinMajor + 1 : darwinMajor - 9;
  const name = MACOS_NAMES[major];
  return name ? `${name} (${major})` : `(${major})`;
}
