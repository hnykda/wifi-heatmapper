/**
 * usage-counts.ts - what the browser needs to know about usage counts
 * (anonymous telemetry): the answer of GET /api/telemetry, why it is off,
 * and when to show the first-run notice.
 *
 * Pure, no Node APIs. The server side (sending, the install id) is in
 * telemetry.ts.
 */

/** The env var that turns usage counts off (0, false, off) or on in `npm run dev` (1). */
export const TELEMETRY_ENV = "WIFI_HEATMAPPER_TELEMETRY";

/**
 * Why usage counts are off, or null when they are on.
 * - env: WIFI_HEATMAPPER_TELEMETRY=0 (or false, off, no)
 * - dnt: DO_NOT_TRACK is set
 * - mock: WIFI_HEATMAPPER_MOCK (made-up measurements, e2e tests)
 * - ci: CI is set
 * - dev: the development server (npm run dev), unless WIFI_HEATMAPPER_TELEMETRY=1
 * - test: unit tests (NODE_ENV=test), unless WIFI_HEATMAPPER_TELEMETRY=1
 * - setting: turned off in Settings
 */
export type UsageCountsOffReason =
  "env" | "dnt" | "mock" | "ci" | "dev" | "test" | "setting";

export interface UsageCountsSample {
  /** where events go */
  endpoint: string;
  /** the request headers; the install id is shown as a placeholder */
  headers: Record<string, string>;
  /** the exact JSON body of a Measurement event from this computer */
  body: unknown;
}

/** GET and PATCH /api/telemetry */
export interface UsageCountsInfo {
  /** events are sent */
  enabled: boolean;
  /** the Settings toggle (true unless turned off there) */
  setting: boolean;
  /** why it is off, null when on */
  offReason: UsageCountsOffReason | null;
  /** show the first-run notice */
  showNotice: boolean;
  /** the last event that was sent, if any */
  lastSent: { event: string; at: string } | null;
  sample: UsageCountsSample;
}

/** Plain-language explanation of why usage counts are off. */
export function describeOffReason(
  reason: UsageCountsOffReason,
  { desktopApp = false }: { desktopApp?: boolean } = {},
): string {
  switch (reason) {
    case "env":
      return `Off: ${TELEMETRY_ENV} is set to turn it off.`;
    case "dnt":
      return "Off: DO_NOT_TRACK is set on this computer.";
    case "mock":
      return desktopApp
        ? "Off in mock mode: the measurements are made up, so nothing is counted."
        : "Off in mock mode (WIFI_HEATMAPPER_MOCK): the measurements are made up, so nothing is counted.";
    case "ci":
      return "Off: CI is set, so this looks like an automated test run.";
    case "dev":
      return `Off in the development server (npm run dev). Set ${TELEMETRY_ENV}=1 to send them anyway.`;
    case "test":
      return "Off while tests run.";
    case "setting":
      return "Off: you turned it off here.";
  }
}

/** Reasons the Settings toggle can't change: an env var or the mode decides. */
export function isLockedOff(reason: UsageCountsOffReason | null): boolean {
  return reason !== null && reason !== "setting";
}

/**
 * The first-run notice shows while usage counts are on and nobody has
 * dismissed it on this computer yet (dismissing, "Turn off" and
 * "What's sent" all count).
 */
export function shouldShowNotice(state: {
  enabled: boolean;
  noticeDismissedAt?: string;
}): boolean {
  return state.enabled && !state.noticeDismissedAt;
}

/** Why usage counts exist, in the developer's words (notice and Settings). */
export const USAGE_COUNTS_WHY =
  "I build wifi-heatmapper on my own, and I only keep working on it if people actually use it. Anonymous counts of installs, app starts and measurements tell me that, and honestly keep me motivated.";

export const USAGE_COUNTS_PROMISE =
  "Nothing identifies you: no IP address is stored, and no network names or results are sent. You can turn it off any time.";

/** The guide page that lists everything that is sent. */
export const PRIVACY_DOC_PATH = "docs/privacy";
