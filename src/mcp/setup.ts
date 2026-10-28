/**
 * setup.ts - check_setup: what the running app can tell about this machine
 * without taking a measurement.
 *
 * The app's real preflight (can it read Wi-Fi, is a sudo password needed,
 * does the iperf3 server answer) only runs as the first step of a
 * measurement (POST /api/start-task), so it is not called here;
 * start_measurement reports what it finds.
 */
import type { AppStatus, MacosHelperStatus } from "../lib/types";
import type { AppClient } from "./app-client";
import { measuresSpeed } from "../lib/measurement-mode";
import { SUDO_NEEDED } from "./measure";

export interface SetupReport {
  app: {
    url: string;
    version: string;
    os: string;
    platform: string;
    mockMode: boolean;
    desktopApp: boolean;
    docker: boolean;
    dataDir: string;
  };
  iperf3: { installed: boolean; version: string | null };
  macosHelper?: MacosHelperStatus;
  /** whether the app holds a sudo password typed in its Settings; null if it can't say */
  sudoPasswordHeld: boolean | null;
  survey?: {
    name: string;
    found: boolean;
    throughputTests?: boolean;
    iperfServer?: string;
    testDuration?: number;
    points?: number;
  };
  problems: string[];
  notes: string[];
}

/** Pure: turn what the app reported into problems and notes. */
export function assessSetup(
  status: AppStatus,
  helper: MacosHelperStatus | undefined,
  survey: SetupReport["survey"] | undefined,
  sudoHeld: boolean | null = null,
): { problems: string[]; notes: string[] } {
  const problems: string[] = [];
  const notes: string[] = [];

  if (status.mockMode) {
    notes.push(
      "Mock mode is on: measurements are synthetic. Restart without WIFI_HEATMAPPER_MOCK for real readings.",
    );
  }

  const throughputOn = survey?.found && survey.throughputTests;
  if (!status.iperf3Version && !status.mockMode) {
    (throughputOn ? problems : notes).push(
      "iperf3 is not installed on this computer, so speed tests are skipped (the signal is still measured). Install it, or switch the survey to signal only (measureSpeed false).",
    );
  }

  if (status.platform === "darwin" && !status.mockMode) {
    if (!helper?.available) {
      const build = status.desktopApp
        ? ""
        : " Or build the Wi-Fi helper (`npm run build:macos-helper`), which needs no password.";
      if (sudoHeld) {
        notes.push(
          "The macOS Wi-Fi helper is not available, so readings use wdutil with the sudo password the app holds (typed in Settings; memory only). SSID/BSSID may show as redacted." +
            build,
        );
      } else {
        problems.push(
          `The macOS Wi-Fi helper is not available, so readings use wdutil, which needs the sudo password. ${SUDO_NEEDED}${build}`,
        );
      }
    } else if (!helper.locationAuthorized) {
      problems.push(
        'Location access for the Wi-Fi helper is not granted, so SSID and BSSID are missing. Click "Allow Location access" in the Settings tab.',
      );
    }
  }
  if (status.platform === "win32" && !status.mockMode) {
    notes.push(
      'On Windows 11 24H2 and later, SSID and BSSID need Location services and "Let desktop apps access your location" turned on.',
    );
  }
  if (status.platform === "linux" && !status.mockMode) {
    notes.push(
      status.docker || status.podman
        ? "In Docker the app reads Wi-Fi with iw and needs no sudo password."
        : `On Linux the app reads Wi-Fi with iw, usually without a password; if iw is refused, the first measurement says so. The app ${sudoHeld ? "holds" : "does not hold"} a sudo password (typed in Settings; memory only).`,
    );
  }

  if (survey && !survey.found) {
    problems.push(
      `No survey for "${survey.name}". Open that floor plan in the app first.`,
    );
  } else if (survey) {
    if (!survey.throughputTests) {
      notes.push(
        "This survey measures signal only (measureSpeed is false). To add speed, run `iperf3 -s` on another computer wired to the router, set its address and measureSpeed true.",
      );
    }
    if (survey.points === 0) notes.push("This survey has no points yet.");
  }

  notes.push(
    "Not checked here: whether the iperf3 server answers, whether Wi-Fi can be read, and (on Linux) whether a sudo password is needed. The app checks these when a measurement starts; start_measurement reports what it finds within a few seconds.",
  );
  return { problems, notes };
}

export async function checkSetup(
  client: AppClient,
  name?: string,
): Promise<SetupReport> {
  const status = await client.status();
  let helper: MacosHelperStatus | undefined;
  if (status.platform === "darwin" && !status.mockMode) {
    helper = await client.macosHelper().catch((err) => ({
      available: false,
      path: null,
      error: String(err),
    }));
  }

  let survey: SetupReport["survey"];
  if (name) {
    const s = await client.survey(name);
    survey = s
      ? {
          name,
          found: true,
          throughputTests: measuresSpeed(s),
          iperfServer: s.iperfServerAdrs,
          testDuration: s.testDuration,
          points: s.surveyPoints?.length ?? 0,
        }
      : { name, found: false };
  }

  const sudoHeld = await client.sudoPasswordHeld().catch(() => null);
  const { problems, notes } = assessSetup(status, helper, survey, sudoHeld);
  return {
    app: {
      url: client.baseUrl.origin,
      version: status.version,
      os: status.osName,
      platform: status.platform,
      mockMode: status.mockMode,
      desktopApp: status.desktopApp,
      docker: status.docker || status.podman,
      dataDir: status.dataDir,
    },
    iperf3: {
      installed: !!status.iperf3Version,
      version: status.iperf3Version,
    },
    ...(helper ? { macosHelper: helper } : {}),
    sudoPasswordHeld: sudoHeld,
    ...(survey ? { survey } : {}),
    problems,
    notes,
  };
}
