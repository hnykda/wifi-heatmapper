"use client";
/**
 * useMeasurement - start, follow and cancel the server's measurement job
 * (lib/measurement-job.ts) for the survey shown.
 *
 * Progress comes from the event stream (/api/events), which every tab
 * receives; a status poll keyed by the job id covers a stream that drops.
 * The server saves the point itself, so this only asks the survey to
 * reload when the job is done. A job started in another tab for the same
 * survey is followed too.
 */
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import type {
  MeasurementEvent,
  MeasurementFields,
  MeasurementJobStatus,
  PartialHeatmapSettings,
} from "@/lib/types";
import { onMeasurementEvent } from "@/lib/measurement-events";

export type MeasurementPhase =
  "idle" | "connecting" | "running" | "done" | "cancelled" | "error";

export interface WatchedJob {
  id: string | null; // null until the server has answered the start
  survey: string;
  x: number;
  y: number;
}

export interface MeasurementView {
  job: WatchedJob | null;
  phase: MeasurementPhase;
  header: string;
  fields: MeasurementFields | null;
  warning: string;
  message: string; // why it failed or was cancelled
}

const POLL_INTERVAL_MS = 1500;
/** Status polls that may fail in a row before we give up. */
const MAX_POLL_FAILURES = 5;

const IDLE: MeasurementView = {
  job: null,
  phase: "idle",
  header: "",
  fields: null,
  warning: "",
  message: "",
};

/** Stop one job; never another tab's next one. */
async function stopJob(jobId: string) {
  await fetch("/api/start-task?action=stop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId }),
  }).catch(() => {});
}

type StatusAnswer =
  | { kind: "ok"; status: MeasurementJobStatus }
  | { kind: "gone" } // the server doesn't know the job (restarted?)
  | { kind: "failed" };

/** Ask for one job's status. Never rejects. */
async function fetchStatus(jobId: string): Promise<StatusAnswer> {
  try {
    const res = await fetch(
      `/api/start-task?action=status&id=${encodeURIComponent(jobId)}`,
    );
    if (res.status === 404) return { kind: "gone" };
    if (!res.ok) return { kind: "failed" };
    return { kind: "ok", status: (await res.json()) as MeasurementJobStatus };
  } catch {
    return { kind: "failed" };
  }
}

/** Ask the server to start a job. Never rejects. */
async function requestStart(
  survey: string,
  x: number,
  y: number,
  settings: PartialHeatmapSettings,
): Promise<{ jobId: string } | { error: string }> {
  try {
    const res = await fetch("/api/start-task?action=start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ survey, x, y, settings }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || typeof body?.jobId !== "string") {
      return { error: body?.error ?? `The server answered ${res.status}.` };
    }
    return { jobId: body.jobId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

const isActive = (phase: MeasurementPhase) =>
  phase === "connecting" || phase === "running";

export function useMeasurement(
  survey: string,
  onSaved: (pointId: string) => void,
) {
  const [view, setView] = useState<MeasurementView>(IDLE);
  // the same as view, readable from callbacks (always set with setView)
  const viewRef = useRef(view);
  const surveyRef = useRef(survey);
  useEffect(() => {
    surveyRef.current = survey;
  }, [survey]);
  const saved = useEffectEvent(onSaved);
  // events for a job whose start hasn't answered yet
  const early = useRef(new Map<string, MeasurementEvent>());

  // apply, adopt and onEvent keep their identity on purpose: the effects
  // below subscribe with them.

  /** Apply one event of the job being watched. */
  const apply = useCallback((event: MeasurementEvent) => {
    const current = viewRef.current;
    if (!current.job || event.jobId !== current.job.id) return;
    if (!isActive(current.phase)) return; // finished, cancelled here
    const next: MeasurementView = {
      ...current,
      phase: "running",
      header: event.header || current.header,
      fields: event.fields ?? current.fields,
      warning: event.warning ?? "",
    };
    if (event.type === "done") {
      next.phase =
        event.state === "done"
          ? "done"
          : event.state === "cancelled"
            ? "cancelled"
            : "error";
      next.message = next.phase === "done" ? "" : event.status;
    }
    viewRef.current = next;
    setView(next);
  }, []);

  /** Follow a job this tab didn't start (another tab, or before a reload). */
  const adopt = useCallback(
    (event: MeasurementEvent | null) => {
      if (!event?.jobId || event.type === "done") return;
      if (viewRef.current.phase !== "idle") return;
      if (event.survey !== surveyRef.current) return;
      const next: MeasurementView = {
        ...IDLE,
        job: {
          id: event.jobId,
          survey: event.survey,
          x: event.x ?? 0,
          y: event.y ?? 0,
        },
        phase: "running",
      };
      viewRef.current = next;
      setView(next);
      apply(event);
    },
    [apply],
  );

  const onEvent = useCallback(
    (event: MeasurementEvent) => {
      if (!event.jobId) return; // ready, heartbeat
      const job = viewRef.current.job;
      if (job && job.id === null) {
        early.current.set(event.jobId, event);
        return;
      }
      if (!job) return adopt(event);
      apply(event);
    },
    [adopt, apply],
  );

  // The page's event stream, for as long as the floor plan is shown
  useEffect(() => onMeasurementEvent(onEvent), [onEvent]);

  // A measurement already running for this survey (reload, another tab)
  useEffect(() => {
    let cancelled = false;
    fetch("/api/start-task?action=status")
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { job: MeasurementJobStatus | null } | null) => {
        if (!cancelled && body?.job) adopt(body.job.progress);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [survey, adopt]);

  // Status poll for the job being watched
  const jobId = view.job?.id ?? null;
  const active = isActive(view.phase);
  useEffect(() => {
    if (!jobId || !active) return;
    const poll = { failures: 0 };
    const timer = setInterval(async () => {
      const answer = await fetchStatus(jobId);
      if (answer.kind === "ok") {
        poll.failures = 0;
        const { status } = answer;
        const wasActive = isActive(viewRef.current.phase);
        if (status.progress) apply(status.progress);
        // The survey provider reloads on the "done" event; this covers a
        // job whose end only the poll saw
        if (
          wasActive &&
          status.state === "done" &&
          status.pointId &&
          status.survey === surveyRef.current
        ) {
          saved(status.pointId);
        }
        return;
      }
      poll.failures += 1;
      const gone = answer.kind === "gone";
      if (gone || poll.failures >= MAX_POLL_FAILURES) {
        const current = viewRef.current;
        if (current.job?.id !== jobId || !isActive(current.phase)) return;
        const next: MeasurementView = {
          ...current,
          phase: "error",
          message: gone
            ? "The server no longer knows this measurement. Was it restarted?"
            : "Lost contact with the server. Is it still running?",
        };
        viewRef.current = next;
        setView(next);
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [jobId, active, apply]);

  const start = async (
    x: number,
    y: number,
    settings: PartialHeatmapSettings,
  ) => {
    if (isActive(viewRef.current.phase)) return;
    const job: WatchedJob = { id: null, survey: surveyRef.current, x, y };
    const starting: MeasurementView = {
      ...IDLE,
      job,
      phase: "connecting",
      header: "Starting",
    };
    viewRef.current = starting;
    setView(starting);
    early.current.clear();
    const fail = (message: string) => {
      const next: MeasurementView = {
        ...viewRef.current,
        phase: "error",
        message,
      };
      viewRef.current = next;
      setView(next);
    };
    const answer = await requestStart(job.survey, x, y, settings);
    if ("error" in answer) return fail(answer.error);
    if (viewRef.current.job !== job) return; // dismissed meanwhile
    if (viewRef.current.phase === "cancelled") {
      // cancelled before the server answered: stop it now
      await stopJob(answer.jobId);
      return;
    }
    const running: MeasurementView = {
      ...viewRef.current,
      job: { ...job, id: answer.jobId },
      phase: "running",
    };
    viewRef.current = running;
    setView(running);
    const buffered = early.current.get(answer.jobId);
    early.current.clear();
    if (buffered) apply(buffered);
  };

  const cancel = async () => {
    const current = viewRef.current;
    if (!isActive(current.phase)) return;
    const next: MeasurementView = {
      ...current,
      phase: "cancelled",
      header: "Cancelled",
      message: "Measurement cancelled",
    };
    viewRef.current = next;
    setView(next);
    // no id yet: start() stops it when the server answers
    if (current.job?.id) await stopJob(current.job.id);
  };

  const dismiss = () => {
    viewRef.current = IDLE;
    setView(IDLE);
  };

  return { ...view, measuring: isActive(view.phase), start, cancel, dismiss };
}
