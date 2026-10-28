/**
 * telemetry.ts - anonymous usage counts, sent from the server (never the
 * browser) to the project's self-hosted Plausible (Events API).
 *
 * What is sent, and nothing else (docs/guide/privacy.md lists it too):
 *
 *   Install      once, the first time usage counts are on
 *   App start    at most once a day, when the server starts
 *   Measurement  once per saved measurement point
 *
 *   props: version, os (macos | windows | linux | other), arch,
 *          runs_as (desktop | docker | podman | browser);
 *          Measurement also speed_test (on | off): whether the
 *          survey runs iperf3 speed tests. Never any measured value.
 *
 * buildEvent() is the only place an event body is made, from fixed fields:
 * no survey data (network names, addresses, results, file names) ever
 * reaches it. The random install id only goes in the User-Agent header,
 * which Plausible uses with the IP address for a daily-salted visitor hash
 * and stores neither of; so each install counts as one visitor a day.
 *
 * Off with WIFI_HEATMAPPER_TELEMETRY=0 (false, off, no), DO_NOT_TRACK,
 * the Settings toggle, and always in mock mode, CI, unit tests and the
 * development server (unless WIFI_HEATMAPPER_TELEMETRY=1). When off,
 * nothing is sent and no install id is made; turning it off in Settings
 * deletes the id.
 *
 * Sending never blocks or fails anything: it runs in the background with a
 * short timeout, and any error is dropped (logged at debug level only).
 *
 * The state (setting, id, last sent) lives in data/usage-counts.json
 * (server-paths.ts), cached on globalThis because Next.js may load this
 * module more than once.
 */
import "server-only";
import { randomUUID } from "crypto";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import isDocker from "is-docker";
import isPodman from "is-podman";
import pkg from "../../package.json";
import { getLogger } from "./logger";
import { getUsageCountsPath } from "./server-paths";
import { UsageCountsFile, usageCountsFileSchema } from "./schema";
import {
  shouldShowNotice,
  TELEMETRY_ENV,
  UsageCountsInfo,
  UsageCountsOffReason,
} from "./usage-counts";

const logger = getLogger("usage-counts");

export const DEFAULT_TELEMETRY_URL = "https://plan.danielhnyk.cz";
export const DEFAULT_TELEMETRY_DOMAIN = "app.wifi-heatmapper.danielalder.cz";
export const TELEMETRY_URL_ENV = "WIFI_HEATMAPPER_TELEMETRY_URL";
export const TELEMETRY_DOMAIN_ENV = "WIFI_HEATMAPPER_TELEMETRY_DOMAIN";
export const SEND_TIMEOUT_MS = 3000;
export const INSTALL_ID_PLACEHOLDER = "<random install id>";

type Env = Record<string, string | undefined>;

/* ---------- off switches ---------- */

const OFF_VALUES = ["0", "false", "off", "no"];
const ON_VALUES = ["1", "true", "on", "yes"];
const norm = (v: string | undefined) => (v ?? "").trim().toLowerCase();
const isSet = (v: string | undefined) =>
  norm(v) !== "" && !OFF_VALUES.includes(norm(v));

/** Why the environment turns usage counts off, or null if it allows them. */
export function envOffReason(
  env: Env = process.env,
): Exclude<UsageCountsOffReason, "setting"> | null {
  const flag = norm(env[TELEMETRY_ENV]);
  if (OFF_VALUES.includes(flag)) return "env";
  if (isSet(env.DO_NOT_TRACK)) return "dnt";
  if (isSet(env.WIFI_HEATMAPPER_MOCK)) return "mock";
  if (isSet(env.CI)) return "ci";
  const explicitOn = ON_VALUES.includes(flag);
  if (env.NODE_ENV === "development" && !explicitOn) return "dev";
  if ((env.NODE_ENV === "test" || env.VITEST) && !explicitOn) return "test";
  return null;
}

/* ---------- the event ---------- */

export type EventName = "Install" | "App start" | "Measurement";

export interface Facts {
  version: string;
  os: "macos" | "windows" | "linux" | "other";
  arch: string;
  runs_as: "desktop" | "docker" | "podman" | "browser";
}

export interface MeasurementProps {
  /** whether the survey runs speed tests (iperf3); never a result */
  speed_test: "on" | "off";
}

export interface PlausibleEvent {
  name: EventName;
  url: string;
  domain: string;
  props: Facts | (Facts & MeasurementProps);
}

function osName(platform: string): Facts["os"] {
  if (platform === "darwin") return "macos";
  if (platform === "win32") return "windows";
  if (platform === "linux") return "linux";
  return "other";
}

/** version, OS, CPU and how the app runs. Nothing else about the machine. */
export function runtimeFacts(env: Env = process.env): Facts {
  return {
    version: pkg.version,
    os: osName(os.platform()),
    arch: os.arch(),
    // the desktop shell always sets this; npm, Docker and e2e never do
    runs_as: env.WIFI_HEATMAPPER_RESOURCES_DIR
      ? "desktop"
      : isPodman()
        ? "podman"
        : isDocker()
          ? "docker"
          : "browser",
  };
}

const SLUGS: Record<EventName, string> = {
  Install: "install",
  "App start": "app-start",
  Measurement: "measurement",
};

/**
 * buildEvent() - the JSON body of one event. Every prop is copied by name
 * from fixed values, so nothing else can slip in.
 */
export function buildEvent(
  name: EventName,
  facts: Facts,
  domain: string,
  measurement?: MeasurementProps,
): PlausibleEvent {
  const base: Facts = {
    version: String(facts.version),
    os: facts.os,
    arch: String(facts.arch),
    runs_as: facts.runs_as,
  };
  return {
    name,
    url: `app://wifi-heatmapper/${SLUGS[name]}`,
    domain,
    props:
      name === "Measurement" && measurement
        ? { ...base, speed_test: measurement.speed_test }
        : base,
  };
}

export function userAgent(version: string, installId: string): string {
  return `wifi-heatmapper/${version} (${installId})`;
}

/** WIFI_HEATMAPPER_TELEMETRY_URL may be the Plausible base URL or its /api/event. */
export function eventEndpoint(env: Env = process.env): string {
  const raw = (env[TELEMETRY_URL_ENV] || DEFAULT_TELEMETRY_URL).trim();
  try {
    const url = new URL(raw);
    if (url.pathname === "/" || url.pathname === "")
      url.pathname = "/api/event";
    return url.toString();
  } catch {
    return `${DEFAULT_TELEMETRY_URL}/api/event`;
  }
}

export function eventDomain(env: Env = process.env): string {
  return env[TELEMETRY_DOMAIN_ENV]?.trim() || DEFAULT_TELEMETRY_DOMAIN;
}

/* ---------- state on disk ---------- */

interface Store {
  state: UsageCountsFile | null; // null: not read yet
  queue: Promise<unknown>;
}

const KEY = "__wifiHeatmapperUsageCounts__";
function store(): Store {
  const g = globalThis as unknown as Record<string, Store | undefined>;
  return (g[KEY] ??= { state: null, queue: Promise.resolve() });
}

async function readState(): Promise<UsageCountsFile> {
  const s = store();
  if (s.state) return s.state;
  let parsed: UsageCountsFile = {};
  try {
    const raw = JSON.parse(await readFile(getUsageCountsPath(), "utf-8"));
    const result = usageCountsFileSchema.safeParse(raw);
    if (result.success) parsed = result.data;
  } catch {
    // missing or unreadable: start empty
  }
  s.state ??= parsed;
  return s.state;
}

/** Change the state and save it, one change at a time. */
function update(
  fn: (state: UsageCountsFile) => UsageCountsFile,
): Promise<UsageCountsFile> {
  const s = store();
  const next = s.queue.then(async () => {
    const changed = fn({ ...(await readState()) });
    s.state = changed;
    try {
      const file = getUsageCountsPath();
      await mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmp, JSON.stringify(changed, null, 2));
      await rename(tmp, file);
    } catch (err) {
      logger.debug(`could not save usage counts state: ${err}`);
    }
    return changed;
  });
  s.queue = next.catch(() => undefined);
  return next;
}

/** Why usage counts are off (env first, then the Settings toggle), or null. */
export async function offReason(
  env: Env = process.env,
): Promise<UsageCountsOffReason | null> {
  const fromEnv = envOffReason(env);
  if (fromEnv) return fromEnv;
  return (await readState()).enabled === false ? "setting" : null;
}

export async function isEnabled(env: Env = process.env): Promise<boolean> {
  return (await offReason(env)) === null;
}

/* ---------- sending ---------- */

const today = (now: Date) => now.toISOString().slice(0, 10);

/**
 * send() - one event, if usage counts are on. Resolves true once Plausible
 * accepted it; never throws.
 */
export async function send(
  name: EventName,
  measurement?: MeasurementProps,
  env: Env = process.env,
): Promise<boolean> {
  try {
    if (!(await isEnabled(env))) return false;
    let state = await readState();
    if (!state.installId) {
      const installId = randomUUID();
      state = await update((s) => ({
        ...s,
        installId: s.installId ?? installId,
      }));
    }
    const facts = runtimeFacts(env);
    const event = buildEvent(name, facts, eventDomain(env), measurement);
    const res = await fetch(eventEndpoint(env), {
      method: "POST",
      headers: {
        "User-Agent": userAgent(facts.version, state.installId!),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.debug(`usage count "${name}" not accepted: HTTP ${res.status}`);
      return false;
    }
    if (res.headers.get("x-plausible-dropped") === "1") {
      logger.debug(`usage count "${name}" was dropped by the server`);
    }
    await update((s) => ({
      ...s,
      lastSent: { event: name, at: new Date().toISOString() },
    }));
    logger.debug(`usage count "${name}" sent`);
    return true;
  } catch (err) {
    logger.debug(`usage count "${name}" not sent: ${err}`);
    return false;
  }
}

/**
 * At server start: Install (until it has been sent once), then App start
 * (at most once a UTC day). In the background; never throws.
 */
export async function reportAppStart(
  env: Env = process.env,
  now: Date = new Date(),
): Promise<void> {
  try {
    if (!(await isEnabled(env))) return;
    if (!(await readState()).installReported) {
      if (await send("Install", undefined, env)) {
        await update((s) => ({ ...s, installReported: true }));
      }
    }
    const day = today(now);
    if ((await readState()).lastAppStartDay === day) return;
    if (await send("App start", undefined, env)) {
      await update((s) => ({ ...s, lastAppStartDay: day }));
    }
  } catch (err) {
    logger.debug(`usage counts at start failed: ${err}`);
  }
}

/** A measurement point was saved. Fire and forget. */
export function reportMeasurement(
  { speedTests }: { speedTests: boolean },
  env: Env = process.env,
): void {
  void send(
    "Measurement",
    {
      speed_test: speedTests ? "on" : "off",
    },
    env,
  );
}

/* ---------- Settings and the notice ---------- */

/** Turn usage counts on or off here. Off deletes the install id. */
export async function setEnabled(enabled: boolean): Promise<void> {
  await update((s) => {
    const next: UsageCountsFile = { ...s, enabled };
    if (!enabled) delete next.installId;
    return next;
  });
}

export async function dismissNotice(): Promise<void> {
  await update((s) => ({
    ...s,
    noticeDismissedAt: s.noticeDismissedAt ?? new Date().toISOString(),
  }));
}

/** What GET /api/telemetry answers. Never contains the install id. */
export async function usageCountsInfo(
  env: Env = process.env,
): Promise<UsageCountsInfo> {
  const state = await readState();
  const reason = await offReason(env);
  const facts = runtimeFacts(env);
  const enabled = reason === null;
  return {
    enabled,
    setting: state.enabled !== false,
    offReason: reason,
    showNotice: shouldShowNotice({
      enabled,
      noticeDismissedAt: state.noticeDismissedAt,
    }),
    lastSent: state.lastSent ?? null,
    sample: {
      endpoint: eventEndpoint(env),
      headers: {
        "User-Agent": userAgent(facts.version, INSTALL_ID_PLACEHOLDER),
        "Content-Type": "application/json",
      },
      body: buildEvent("Measurement", facts, eventDomain(env), {
        speed_test: "on",
      }),
    },
  };
}

/** For bug reports: on, or off and why. Never the install id. */
export async function usageCountsSummary(
  env: Env = process.env,
): Promise<string> {
  try {
    const reason = await offReason(env);
    return reason ? `off (${reason})` : "on";
  } catch {
    return "unknown";
  }
}

/** Tests only: forget the cached state. */
export function resetUsageCountsCache(): void {
  const s = store();
  s.state = null;
  s.queue = Promise.resolve();
}
