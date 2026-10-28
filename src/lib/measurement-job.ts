/**
 * measurement-job.ts - a measurement is a job the server owns.
 *
 * One job runs at a time. It is started for a spot (survey, x, y), runs the
 * measurement (iperfRunner.runSurveyTests) with its own AbortController,
 * and when it finishes the server saves the point itself through
 * survey-store, so closing or reloading the tab doesn't lose it. A
 * cancelled job never saves anything.
 *
 * Progress goes to every open /api/events stream (a set of listeners), and
 * every event names its job, so a tab only follows the job it is watching.
 * GET /api/start-task?action=status&id=... answers for one job.
 *
 * Kept on globalThis because Next.js may load this module once per route
 * bundle; every route must see the same job and listeners.
 */
import { nanoid } from "nanoid";
import type {
  MeasurementEvent,
  MeasurementJobStatus,
  MeasurementState,
  PartialHeatmapSettings,
} from "./types";
import type { MeasureOptions, MeasureResult } from "./iperfRunner";
import * as store from "./survey-store";
import { addPoint } from "./survey-ops";
import { recordMeasurement } from "./diagnostics-state";
import { measuresSpeed } from "./measurement-mode";
import { getLogger } from "./logger";

const logger = getLogger("measurement-job");

/** A job that runs longer than this is stopped (and reports an error). */
export const MEASUREMENT_TIMEOUT_MS = 10 * 60 * 1000;
/** How long a start waits for a cancelled job to finish stopping. */
const CANCEL_GRACE_MS = 5000;
/** Finished jobs kept for status requests. */
const KEEP_FINISHED = 20;

export type Runner = (
  settings: PartialHeatmapSettings,
  options: MeasureOptions,
) => Promise<MeasureResult>;

interface Job {
  id: string;
  survey: string;
  x: number;
  y: number;
  state: MeasurementState;
  startedAt: string;
  progress: MeasurementEvent | null;
  pointId?: string;
  warning?: string;
  error?: string;
  abortController: AbortController;
  /** resolves when the measurement code has returned (after a cancel too) */
  settled: Promise<void>;
  isSettled: boolean;
}

type Listener = (event: MeasurementEvent) => void;

interface Hub {
  current: Job | null;
  jobs: Map<string, Job>;
  listeners: Set<Listener>;
}

const KEY = "__wifiHeatmapperMeasurementJobs__";

function hub(): Hub {
  const g = globalThis as unknown as Record<string, Hub | undefined>;
  return (g[KEY] ??= { current: null, jobs: new Map(), listeners: new Set() });
}

const isFinished = (state: MeasurementState) =>
  state === "done" || state === "error" || state === "cancelled";

function snapshot(job: Job): MeasurementJobStatus {
  return {
    id: job.id,
    survey: job.survey,
    x: job.x,
    y: job.y,
    state: job.state,
    startedAt: job.startedAt,
    progress: job.progress,
    ...(job.pointId ? { pointId: job.pointId } : {}),
    ...(job.warning ? { warning: job.warning } : {}),
    ...(job.error ? { error: job.error } : {}),
  };
}

/* ---------- listeners (one per open /api/events stream) ---------- */

/** Receive every measurement event; returns the function to stop. */
export function subscribe(listener: Listener): () => void {
  hub().listeners.add(listener);
  return () => {
    hub().listeners.delete(listener);
  };
}

export function listenerCount(): number {
  return hub().listeners.size;
}

function broadcast(event: MeasurementEvent) {
  for (const listener of [...hub().listeners]) {
    try {
      listener(event);
    } catch (err) {
      logger.debug(`dropping a listener that failed: ${err}`);
      hub().listeners.delete(listener);
    }
  }
}

function publish(job: Job, event: MeasurementEvent) {
  const full: MeasurementEvent = {
    ...event,
    jobId: job.id,
    survey: job.survey,
    x: job.x,
    y: job.y,
    state: job.state,
  };
  job.progress = full;
  broadcast(full);
}

/* ---------- status ---------- */

/** One job (running or recently finished), or null. */
export function getJob(id: string): MeasurementJobStatus | null {
  const job = hub().jobs.get(id);
  return job ? snapshot(job) : null;
}

/** The job that is measuring or saving now, or null. */
export function currentJob(): MeasurementJobStatus | null {
  const job = hub().current;
  return job && !isFinished(job.state) ? snapshot(job) : null;
}

/* ---------- start / stop ---------- */

export interface StartRequest {
  survey: string;
  x: number;
  y: number;
  settings: PartialHeatmapSettings;
}

export type StartResult =
  | { ok: true; job: MeasurementJobStatus }
  | { ok: false; running: MeasurementJobStatus };

async function defaultRunner(
  settings: PartialHeatmapSettings,
  options: MeasureOptions,
): Promise<MeasureResult> {
  // imported here: it reads the OS's Wi-Fi tools when it loads
  const { runSurveyTests } = await import("./iperfRunner");
  return runSurveyTests(settings, options);
}

/**
 * Start measuring at a spot. Refused (ok: false, the running job) while
 * another job measures or saves. A job that was just cancelled gets a few
 * seconds to finish stopping first.
 */
export async function startMeasurement(
  request: StartRequest,
  runner: Runner = defaultRunner,
): Promise<StartResult> {
  const previous = hub().current;
  if (previous && previous.state === "cancelled" && !previous.isSettled) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      previous.settled,
      new Promise((resolve) => (timer = setTimeout(resolve, CANCEL_GRACE_MS))),
    ]);
    clearTimeout(timer);
  }
  // nothing async from here on, so two starts can't both pass this check
  const busy = hub().current;
  if (busy && !(isFinished(busy.state) && busy.isSettled)) {
    return { ok: false, running: snapshot(busy) };
  }

  let markSettled = () => {};
  const job: Job = {
    id: nanoid(10),
    survey: request.survey,
    x: request.x,
    y: request.y,
    state: "running",
    startedAt: new Date().toISOString(),
    progress: null,
    abortController: new AbortController(),
    settled: new Promise<void>((resolve) => (markSettled = resolve)),
    isSettled: false,
  };
  const all = hub().jobs;
  all.set(job.id, job);
  for (const id of [...all.keys()].slice(
    0,
    Math.max(0, all.size - KEEP_FINISHED),
  )) {
    if (all.get(id) !== job) all.delete(id);
  }
  hub().current = job;

  publish(job, { type: "update", header: "Starting", status: "" });
  void run(job, request.settings, runner).finally(() => {
    job.isSettled = true;
    markSettled();
  });
  return { ok: true, job: snapshot(job) };
}

/**
 * Stop the running job (only the one named, if an id is given). Kills its
 * iperf3 at once. A job that is already saving can't be stopped.
 * @returns true if a job was stopped
 */
export function stopMeasurement(id?: string): boolean {
  const job = hub().current;
  if (!job || job.state !== "running") return false;
  if (id && job.id !== id) return false;
  logger.info(`Measurement ${job.id} cancelled`);
  job.abortController.abort(new Error("cancelled"));
  finish(job, "cancelled", { error: "Measurement cancelled" });
  return true;
}

/* ---------- the job itself ---------- */

function finish(
  job: Job,
  state: "done" | "error" | "cancelled",
  details: { pointId?: string; warning?: string; error?: string } = {},
  fields = job.progress?.fields,
) {
  if (isFinished(job.state)) return; // e.g. cancelled while it was ending
  job.state = state;
  Object.assign(job, details);
  const header =
    state === "done"
      ? details.warning
        ? "Saved without speed"
        : "Measurement complete"
      : state === "cancelled"
        ? "Cancelled"
        : "Error";
  publish(job, {
    type: "done",
    header,
    status:
      state === "done"
        ? (job.progress?.status ?? "")
        : (details.error ?? "The measurement failed."),
    ...(fields ? { fields } : {}),
    ...(details.warning ? { warning: details.warning } : {}),
    ...(details.pointId ? { pointId: details.pointId } : {}),
  });
}

async function run(job: Job, settings: PartialHeatmapSettings, runner: Runner) {
  const { signal } = job.abortController;
  const speedTests = measuresSpeed(settings);
  const fail = (error: string, fields?: MeasureResult["fields"]) => {
    if (isFinished(job.state)) return;
    recordMeasurement({ ok: false, speedTests, error });
    finish(job, "error", { error }, fields);
  };
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    job.abortController.abort(new Error("timeout"));
  }, MEASUREMENT_TIMEOUT_MS);

  let result: MeasureResult;
  try {
    result = await runner(settings, {
      signal,
      emit: (event) => {
        // a cancelled job's last steps are not shown
        if (!isFinished(job.state)) publish(job, event);
      },
    });
  } catch (err) {
    if (timedOut) fail("The measurement did not finish in time.");
    else if (signal.aborted) finish(job, "cancelled");
    else fail(err instanceof Error ? err.message : String(err));
    return;
  } finally {
    clearTimeout(timer);
  }

  // cancelled while the last step ran: never save
  if (signal.aborted || isFinished(job.state)) {
    if (timedOut) fail("The measurement did not finish in time.");
    else finish(job, "cancelled");
    return;
  }
  const { wifiData, iperfData, status, warning, fields } = result;
  if (status) return fail(status, fields);
  if (!wifiData || !iperfData) {
    return fail("The measurement returned no data.", fields);
  }

  job.state = "saving";
  let pointId = "";
  try {
    await store.mutate(job.survey, (survey) => {
      const next = addPoint(survey, {
        id: "",
        x: job.x,
        y: job.y,
        wifiData,
        iperfData,
        timestamp: Date.now(),
        isEnabled: true,
      });
      pointId = next.surveyPoints[next.surveyPoints.length - 1].id;
      return next;
    });
  } catch (err) {
    logger.error(`Could not save measurement ${job.id}: ${err}`);
    return fail(`The measurement could not be saved: ${err}`, fields);
  }
  recordMeasurement({
    ok: true,
    speedTests,
    ...(warning ? { note: `Saved without speed: ${warning}` } : {}),
  });
  finish(job, "done", { pointId, ...(warning ? { warning } : {}) }, fields);
}

/** Tests only: forget every job and listener. */
export function resetMeasurementJobs(): void {
  const h = hub();
  h.current?.abortController.abort(new Error("reset"));
  h.current = null;
  h.jobs.clear();
  h.listeners.clear();
}
