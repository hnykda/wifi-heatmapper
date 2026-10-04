/**
 * app-info.ts - facts about this running instance of wifi-heatmapper.
 * Server-only. Exposed to the browser through GET /api/status.
 */
import { execFileSync } from "child_process";
import os from "os";
import isDocker from "is-docker";
import isPodman from "is-podman";
import pkg from "../../package.json";
import { execAsync } from "./server-utils";
import { getDataDir } from "./server-paths";
import { AppStatus } from "./types";
import { findMacosHelper } from "./macos-helper";

export const APP_VERSION: string = pkg.version;

export function isMockMode(): boolean {
  const v = process.env.WIFI_HEATMAPPER_MOCK;
  return !!v && v !== "0" && v.toLowerCase() !== "false";
}

let cached: Promise<Omit<AppStatus, "macosHelper">> | null = null;

export async function getAppStatus(): Promise<AppStatus> {
  if (!cached) cached = buildAppStatus();
  const base = await cached;
  // not cached: the helper may be built while the server runs
  const helper = base.mockMode ? null : findMacosHelper();
  return { ...base, macosHelper: helper?.display ?? null };
}

async function buildAppStatus(): Promise<Omit<AppStatus, "macosHelper">> {
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
    podman: isPodman(),
    docker: isDocker(),
    mockMode: isMockMode(),
    iperf3Version,
    dataDir: getDataDir(),
    // the desktop shell always sets this; npm, Docker and e2e never do
    desktopApp: Boolean(process.env.WIFI_HEATMAPPER_RESOURCES_DIR),
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
  // Ask the system: the Darwin kernel version no longer maps to the macOS
  // version by a fixed offset (Darwin 25 is macOS 26, Darwin 27 is macOS 27).
  let major = NaN;
  try {
    const version = execFileSync("sw_vers", ["-productVersion"], {
      encoding: "utf8",
      timeout: 2000,
    });
    major = parseInt(version.trim().split(".")[0], 10);
  } catch {
    // fall back to the kernel version, right up to macOS 26
    const darwinMajor = parseInt(os.release().split(".")[0], 10);
    major = darwinMajor >= 25 ? darwinMajor + 1 : darwinMajor - 9;
  }
  if (Number.isNaN(major)) return "";
  const name = MACOS_NAMES[major];
  return name ? `${name} (${major})` : `(${major})`;
}
