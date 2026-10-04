/**
 * macos-helper.ts - find and run the macOS Wi-Fi helper
 * (native/macos-wifi-helper, built with `npm run build:macos-helper`).
 * Server-only.
 *
 * The helper reads Wi-Fi with CoreWLAN, so no sudo is needed. macOS only
 * reveals SSID/BSSID to it after the user allows Location access for
 * "WiFi Heatmapper Helper" (see native/macos-wifi-helper/README.md).
 */
import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { getMacosHelperCandidates, MACOS_HELPER_BINARY } from "./server-paths";
import {
  HelperDocument,
  HelperLocation,
  parseHelperDocument,
  parseHelperLocation,
} from "./macos-helper-parse";
import { MacosHelperStatus } from "./types";
import { getLogger } from "./logger";

const logger = getLogger("macos-helper");

export type MacosHelperCommand = "info" | "scan" | "status" | "authorize";

/** What the UI shows about the helper (GET /api/macos-helper). */
export type MacosHelperState = MacosHelperStatus & Partial<HelperLocation>;

function executableFor(candidate: string): string {
  return candidate.endsWith(".app")
    ? path.join(candidate, "Contents", "MacOS", MACOS_HELPER_BINARY)
    : candidate;
}

/**
 * findMacosHelper - the first helper executable that exists, or null.
 * Cheap (a few stat calls), so callers may use it on every request: a helper
 * built while the server runs is picked up without a restart.
 */
export function findMacosHelper(): { exe: string; display: string } | null {
  if (os.platform() !== "darwin") return null;
  for (const candidate of getMacosHelperCandidates()) {
    const exe = executableFor(candidate);
    try {
      fs.accessSync(exe, fs.constants.X_OK);
      return { exe, display: candidate };
    } catch {
      // try the next one
    }
  }
  return null;
}

/**
 * runMacosHelper - run one helper command and return its JSON document.
 * Rejects when the helper is missing, times out, prints no JSON, or reports
 * an error.
 */
export function runMacosHelper(
  command: MacosHelperCommand,
  args: string[] = [],
  timeoutMs = 20_000,
): Promise<HelperDocument> {
  const found = findMacosHelper();
  if (!found) {
    return Promise.reject(new Error("The macOS Wi-Fi helper is not built."));
  }
  const started = Date.now();
  return new Promise((resolve, reject) => {
    execFile(
      found.exe,
      [command, ...args],
      { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        logger.debug(
          `${command} took ${Date.now() - started} ms (exit ${error?.code ?? 0})`,
        );
        // The helper prints JSON even when it exits non-zero
        if (stdout && stdout.trim()) {
          try {
            resolve(parseHelperDocument(stdout));
          } catch (err) {
            reject(err);
          }
          return;
        }
        const why = error?.killed
          ? `timed out after ${timeoutMs / 1000} s`
          : stderr?.trim() || error?.message || "no output";
        reject(new Error(`The macOS Wi-Fi helper failed: ${why}`));
      },
    );
  });
}

/** getMacosHelperState - is the helper usable, and may it see SSIDs? */
export async function getMacosHelperState(): Promise<MacosHelperState> {
  const found = findMacosHelper();
  if (!found) return { available: false, path: null };
  try {
    const location = parseHelperLocation(await runMacosHelper("status"));
    return { available: true, path: found.display, ...location };
  } catch (err) {
    logger.warn(`Helper at ${found.display} does not work: ${err}`);
    return {
      available: false,
      path: found.display,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * requestLocationAccess - run `authorize`: macOS shows its "allow location"
 * prompt for WiFi Heatmapper Helper (only the first time; after that the
 * answer is remembered). Waits up to `timeoutSeconds` for the user. If access
 * was refused earlier, opens System Settings > Location Services instead.
 */
export async function requestLocationAccess(
  timeoutSeconds = 60,
): Promise<MacosHelperState> {
  const found = findMacosHelper();
  if (!found) return { available: false, path: null };
  const doc = await runMacosHelper(
    "authorize",
    ["--timeout", String(timeoutSeconds), "--open-settings"],
    (timeoutSeconds + 15) * 1000,
  );
  return {
    available: true,
    path: found.display,
    prompted: doc.prompted === true,
    ...parseHelperLocation(doc),
  };
}
