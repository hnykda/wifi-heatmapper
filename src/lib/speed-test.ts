/**
 * speed-test.ts - whether a measurement runs the speed test, and why not.
 *
 * Shared by every OS: the per-OS scanners only read Wi-Fi. A missing
 * iperf3, a missing or unreachable server, or an iperf3 run that fails
 * never stops the signal reading from being saved; the reason comes back
 * as a warning instead.
 */
import type { PartialHeatmapSettings, WifiActions } from "./types";
import { execAsync } from "./server-utils";
import { isMockMode } from "./app-info";
import { measuresSpeed, parseServerAddress } from "./measurement-mode";
import { badAddressReason } from "./iperf-server-check";

export interface SpeedTestPlan {
  /** run the iperf3 tests at this spot */
  run: boolean;
  /** true when the survey measures signal only (nothing to warn about) */
  signalOnly: boolean;
  /** why the speed test is skipped although the survey wants one, or "" */
  warning: string;
}

export const IPERF3_MISSING =
  "iperf3 is not installed on this computer, so the speed test was skipped. Install iperf3, or switch to signal only in Settings.";

/** iperf3 --version, or null if it is not installed. Mock mode has none. */
export async function iperf3Version(): Promise<string | null> {
  if (isMockMode()) return "mock";
  try {
    const { stdout } = await execAsync("iperf3 --version");
    return stdout.split("\n")[0].trim() || "iperf3";
  } catch {
    return null;
  }
}

/**
 * planSpeedTest() - decide, before measuring, whether to run the speed test.
 * Checks, in order: the survey's choice, the server address, the test
 * duration, iperf3 on this computer, and whether the server answers.
 */
export async function planSpeedTest(
  settings: PartialHeatmapSettings,
  actions: Pick<WifiActions, "checkIperfServer">,
): Promise<SpeedTestPlan> {
  if (!measuresSpeed(settings)) {
    return { run: false, signalOnly: true, warning: "" };
  }
  const skip = (warning: string): SpeedTestPlan => ({
    run: false,
    signalOnly: false,
    warning,
  });

  if (!parseServerAddress(settings.iperfServerAdrs)) {
    return skip(
      `${badAddressReason(settings.iperfServerAdrs)} The speed test was skipped. Set the server in Settings, or switch to signal only.`,
    );
  }
  if (!(settings.testDuration > 0)) {
    return skip(
      "The speed test duration must be at least 1 second. The speed test was skipped.",
    );
  }
  if (!(await iperf3Version())) {
    return skip(IPERF3_MISSING);
  }
  const reachable = await actions.checkIperfServer(settings);
  if (reachable.reason) {
    return skip(`${reachable.reason} The speed test was skipped.`);
  }
  return { run: true, signalOnly: false, warning: "" };
}

/** The warning when iperf3 started but a test failed part way. */
export function speedTestFailedWarning(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  // iperf3 -J prints its error inside the JSON on stdout ("the server is
  // busy running a test"); exec's message starts with "Command failed: ..."
  const stdout =
    typeof (error as { stdout?: unknown })?.stdout === "string"
      ? (error as { stdout: string }).stdout
      : "";
  const iperfError = /"error"\s*:\s*"([^"]+)"/.exec(`${stdout}\n${raw}`)?.[1];
  const detail = (iperfError ?? raw.split("\n")[0]).trim();
  return `The speed test failed (${detail}). The signal reading was saved without speed.`;
}
