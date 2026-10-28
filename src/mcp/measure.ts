/**
 * measure.ts - step two: measurements an agent starts, with a person
 * carrying the laptop.
 *
 * The app does the work (src/lib/measurement-job.ts): a start returns a
 * job id, one job runs at a time (409 otherwise), the server saves the
 * point and the status answers by job id. This file starts, follows and
 * cancels jobs over that API and turns the outcome into plain words.
 *
 * The sudo password never passes through here. A start carries none, and
 * the app uses the one typed in its Settings, if any. When the machine
 * needs one and the app doesn't have it, the job fails in its first step
 * (the preflight) and sudoProblem() turns that into SUDO_NEEDED.
 */
import type { MeasurementJobStatus } from "../lib/types";
import { measuresSpeed } from "../lib/measurement-mode";
import type {
  AppClient,
  MeasurementSettings,
  StoredSurvey,
} from "./app-client";
import { pickSafeSettings } from "./settings-allowlist";
import { describePoint, type PointRecord } from "./survey";

export const SUDO_NEEDED =
  "This computer needs the sudo password to read Wi-Fi. Enter it once in the app's Settings (it stays in memory), then try again.";
export const SUDO_WRONG =
  "The sudo password the app has was refused. Enter the right one in the app's Settings (it stays in memory), then try again.";
/** For the agent: what not to do about either. */
export const SUDO_NOT_IN_CHAT =
  "Don't ask for the password in chat: this server can't pass it on. The person types it in the app.";

/**
 * The plain message for a job error about the sudo password, or null.
 * Matches the preflight reasons of wifiScanner-macos.ts and
 * wifiScanner-linux.ts.
 */
export function sudoProblem(error: string | undefined): string | null {
  if (!error || !/sudo password/i.test(error)) return null;
  return /valid sudo password/i.test(error) ? SUDO_WRONG : SUDO_NEEDED;
}

/** Why (x, y) can't be measured on this survey, or null. */
export function positionProblem(
  x: number,
  y: number,
  dimensions: { width?: number; height?: number } | undefined,
): string | null {
  const width = dimensions?.width ?? 0;
  const height = dimensions?.height ?? 0;
  if (!(width > 1 && height > 1)) {
    return "The floor plan size is not known yet. Open this floor plan in the app once, then try again.";
  }
  if (x < 0 || y < 0 || x > width || y > height) {
    return `(${x}, ${y}) is outside the floor plan, which is ${width} x ${height} pixels (x 0 to ${width}, y 0 to ${height}, origin top left).`;
  }
  return null;
}

/** The survey's speed settings, as the app's own page sends them. */
export function measurementSettings(survey: StoredSurvey): MeasurementSettings {
  const s = pickSafeSettings(survey);
  return {
    measureSpeed: s.measureSpeed,
    iperfServerAdrs: s.iperfServerAdrs,
    testDuration: s.testDuration,
    udpTests: s.udpTests,
    iperfCommands: s.iperfCommands,
  };
}

/** The closest existing point within `within` pixels, if any. */
export function nearbyPoint(
  survey: StoredSurvey,
  x: number,
  y: number,
  within = 15,
): { id: string; name: string; distancePixels: number } | null {
  let best: { id: string; name: string; distancePixels: number } | null = null;
  for (const p of survey.surveyPoints ?? []) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= within && (!best || d < best.distancePixels)) {
      const name = p.label ? `${p.id} ("${p.label}")` : p.id;
      best = { id: p.id, name, distancePixels: Math.round(d) };
    }
  }
  return best;
}

export const isFinished = (job: MeasurementJobStatus) =>
  job.state === "done" || job.state === "error" || job.state === "cancelled";

export interface WaitOptions {
  timeoutMs: number;
  pollMs?: number;
  /** stops waiting (not the job), e.g. the client cancelled the call */
  signal?: AbortSignal;
  onProgress?: (job: MeasurementJobStatus) => void;
  /** stop waiting early once this is true of the running job */
  until?: (job: MeasurementJobStatus) => boolean;
}

/**
 * The job has got past its first step (the preflight: can Wi-Fi be read,
 * is the sudo password there), which is when most failures show.
 * measurement-job.ts publishes "Starting" until the measurement reports.
 */
export const pastPreflight = (job: MeasurementJobStatus) =>
  !!job.progress && job.progress.header !== "Starting";

/**
 * Poll the job until it has finished or the time is up. Returns its last
 * status, or null if the app doesn't know it.
 */
export async function waitForJob(
  client: AppClient,
  id: string,
  { timeoutMs, pollMs = 750, signal, onProgress, until }: WaitOptions,
): Promise<MeasurementJobStatus | null> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const job = await client.measurement(id);
    if (!job || isFinished(job) || until?.(job)) return job;
    onProgress?.(job);
    const left = end - Date.now();
    if (left <= 0 || signal?.aborted) return job;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(done, Math.min(pollMs, left));
      function done() {
        clearTimeout(timer);
        signal?.removeEventListener("abort", done);
        resolve();
      }
      signal?.addEventListener("abort", done, { once: true });
    });
  }
}

const mbps = (t: { mbps: number } | null) => (t ? `${t.mbps} Mbps` : null);

/** One sentence about a point, for the person. */
export function plainResult(point: PointRecord): string {
  const where = point.apName || point.ssid || "the network";
  const parts = [
    `Signal ${point.signalPercent}% (${point.rssiDbm} dBm) from ${where}` +
      (point.channel
        ? `, channel ${point.channel} (${point.bandGHz} GHz)`
        : ""),
  ];
  const down = mbps(point.tcpDownload);
  const up = mbps(point.tcpUpload);
  if (down || up) {
    parts.push(
      `download ${down ?? "not measured"}, upload ${up ?? "not measured"}`,
    );
  }
  return `${parts.join("; ")}.`;
}

/** What wait_for_measurement (and start_measurement) answer for a job. */
export async function describeJob(
  client: AppClient,
  job: MeasurementJobStatus,
): Promise<{ isError: boolean; value: Record<string, unknown> }> {
  const base = {
    jobId: job.id,
    survey: job.survey,
    x: job.x,
    y: job.y,
    state: job.state,
  };
  if (job.state === "running" || job.state === "saving") {
    return {
      isError: false,
      value: {
        ...base,
        progress: job.progress
          ? { step: job.progress.header, status: job.progress.status }
          : null,
        note:
          job.state === "saving"
            ? "Measured; the app is saving the point. Call wait_for_measurement again."
            : "Still measuring. Ask the person to keep the laptop still, and call wait_for_measurement again.",
      },
    };
  }
  if (job.state === "cancelled") {
    return {
      isError: false,
      value: { ...base, note: "Cancelled. Nothing was saved." },
    };
  }
  if (job.state === "error") {
    const sudo = sudoProblem(job.error);
    return {
      isError: true,
      value: {
        ...base,
        reason: sudo ?? job.error ?? "The measurement failed.",
        ...(sudo
          ? { sudoPasswordNeeded: true, note: SUDO_NOT_IN_CHAT }
          : {
              note: "Nothing was saved. If the reason looks like a bug in the app rather than the Wi-Fi, offer report_problem.",
            }),
      },
    };
  }

  // done: the app saved the point; read it back to describe it
  const survey = await client.survey(job.survey);
  const point = survey?.surveyPoints?.find((p) => p.id === job.pointId);
  const record = point ? describePoint(point, survey?.apMapping) : null;
  return {
    isError: false,
    value: {
      ...base,
      pointId: job.pointId ?? null,
      ...(job.warning
        ? { savedWithoutSpeed: `Saved without speed: ${job.warning}` }
        : {}),
      ...(survey && !job.warning && !measuresSpeed(survey)
        ? { speed: "not measured: this survey measures signal only" }
        : {}),
      ...(record ? { summary: plainResult(record), point: record } : {}),
      ...(!record
        ? { note: "Saved, but the point could not be read back." }
        : {}),
    },
  };
}
