/**
 * app-client.ts - the MCP server's only way to the app: its local HTTP API.
 *
 * The MCP server never reads or writes the data directory itself. Everything
 * goes through the running app, so the app stays the one owner of its files
 * (src/lib/server-paths.ts) and of the measurement process.
 *
 * It never sends, receives or keeps the sudo password: a measurement it
 * starts uses the one the person typed in the app (src/lib/sudo-session.ts).
 */
import type {
  AppStatus,
  HeatmapSettings,
  MacosHelperStatus,
  MeasurementJobStatus,
  SettingsPatch,
  SurveyPointPatch,
} from "../lib/types";
import type { DiagnosticsReport } from "../lib/diagnostics";
import type { CopyPart } from "../lib/survey-ops";

export const DEFAULT_APP_URL = "http://localhost:3000";
export const ALLOW_REMOTE_ENV = "WIFI_HEATMAPPER_MCP_ALLOW_REMOTE";

/** The speed settings a measurement is started with (never a password). */
export interface MeasurementSettings {
  measureSpeed: boolean;
  iperfServerAdrs: string;
  testDuration: number;
  udpTests: boolean;
  iperfCommands: Record<string, string[]>;
}

export type StartAnswer =
  | { started: true; job: MeasurementJobStatus }
  | { started: false; running: MeasurementJobStatus; error: string };

/** A survey file as the app returns it, minus anything secret. */
export type StoredSurvey = Omit<HeatmapSettings, "sudoerPassword">;

export class AppUnavailableError extends Error {}
export class AppRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** the parsed JSON answer, if there was one */
    readonly body?: unknown,
  ) {
    super(message);
  }
}

function isTruthyEnv(value: string | undefined): boolean {
  return !!value && value !== "0" && value.toLowerCase() !== "false";
}

/** localhost, 127.0.0.0/8 and ::1. */
export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1" || host === "0:0:0:0:0:0:0:1") return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

/**
 * resolveAppUrl() - where the app is, from WIFI_HEATMAPPER_URL.
 *
 * Only loopback addresses are accepted unless
 * WIFI_HEATMAPPER_MCP_ALLOW_REMOTE=1: the app runs shell commands (iperf3,
 * and sudo on some systems) with settings it is given, so it should only
 * ever be driven from the machine it runs on.
 */
export function resolveAppUrl(
  env: Record<string, string | undefined> = process.env,
): URL {
  const raw = (env.WIFI_HEATMAPPER_URL || DEFAULT_APP_URL).trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      `WIFI_HEATMAPPER_URL is not a valid URL: "${raw}". Example: http://localhost:3000`,
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`WIFI_HEATMAPPER_URL must start with http:// or https://`);
  }
  if (!isLoopbackHost(url.hostname) && !isTruthyEnv(env[ALLOW_REMOTE_ENV])) {
    throw new Error(
      `Refusing to talk to ${url.host}: only this computer (localhost, 127.0.0.1, ::1) is allowed. ` +
        `The app runs commands on the machine it runs on, so it should not be driven over the network. ` +
        `Set ${ALLOW_REMOTE_ENV}=1 to override.`,
    );
  }
  url.pathname = url.pathname.replace(/\/+$/, "") + "/";
  url.search = "";
  url.hash = "";
  return url;
}

/** Never let the sudo password out, even if an old file still has one. */
export function stripSecrets<T extends object>(
  settings: T,
): Omit<T, "sudoerPassword"> {
  const { sudoerPassword: _ignored, ...rest } = settings as T & {
    sudoerPassword?: unknown;
  };
  return rest;
}

export interface AppClientOptions {
  baseUrl: URL;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class AppClient {
  readonly baseUrl: URL;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: AppClientOptions) {
    this.baseUrl = options.baseUrl;
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const url = new URL(path.replace(/^\//, ""), this.baseUrl);
    try {
      return await this.fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new AppUnavailableError(
        `Can't reach wifi-heatmapper at ${this.baseUrl.origin} (${reason}). ` +
          `Is the app running? Start it with "npm run dev" (or open the desktop app), ` +
          `and set WIFI_HEATMAPPER_URL if it uses another address or port.`,
      );
    }
  }

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.request(path, init);
    const text = await res.text();
    let body: unknown = undefined;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      // not JSON: probably not wifi-heatmapper on that port
      throw new AppRequestError(
        `Unexpected answer from ${this.baseUrl.origin}/${path.replace(/^\//, "")} ` +
          `(HTTP ${res.status}, not JSON). Is WIFI_HEATMAPPER_URL pointing at wifi-heatmapper?`,
        res.status,
      );
    }
    if (!res.ok) {
      const message =
        body && typeof body === "object" && "error" in body
          ? String((body as { error: unknown }).error)
          : `HTTP ${res.status}`;
      throw new AppRequestError(message, res.status, body);
    }
    return body as T;
  }

  status(): Promise<AppStatus> {
    return this.json<AppStatus>("api/status");
  }

  /** The bug report; network names and addresses hidden unless asked. */
  diagnostics(options: {
    survey?: string;
    problem?: string;
    includeNetwork?: boolean;
  }): Promise<DiagnosticsReport> {
    const params = new URLSearchParams();
    if (options.survey) params.set("survey", options.survey);
    if (options.problem) params.set("problem", options.problem);
    if (options.includeNetwork) params.set("network", "include");
    const query = params.toString();
    return this.json<DiagnosticsReport>(
      `api/diagnostics${query ? `?${query}` : ""}`,
    );
  }

  macosHelper(): Promise<MacosHelperStatus> {
    return this.json<MacosHelperStatus>("api/macos-helper");
  }

  async floorPlans(): Promise<string[]> {
    return (await this.json<{ files: string[] }>("api/media")).files ?? [];
  }

  async surveyNames(): Promise<string[]> {
    return (
      (await this.json<{ surveys: string[] }>("api/settings?list=true"))
        .surveys ?? []
    );
  }

  /** The survey for a floor plan, or null if it has none yet. */
  async survey(name: string): Promise<StoredSurvey | null> {
    try {
      const raw = await this.json<HeatmapSettings>(
        `api/settings?name=${encodeURIComponent(name)}`,
      );
      return stripSecrets(raw);
    } catch (err) {
      if (err instanceof AppRequestError && err.status === 404) return null;
      throw err;
    }
  }

  /**
   * Change settings of a survey (PATCH /api/settings). The app applies the
   * patch to the file under its lock and returns the saved survey.
   */
  async patchSettings(
    name: string,
    patch: SettingsPatch,
  ): Promise<StoredSurvey> {
    const saved = await this.json<StoredSurvey>(
      `api/settings?name=${encodeURIComponent(name)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      },
    );
    return stripSecrets(saved);
  }

  /**
   * Change one point (PATCH /api/surveys/[name]/points/[id]), e.g. its
   * label; returns the saved survey. 404 if there is no such point.
   */
  async updatePoint(
    survey: string,
    id: string,
    patch: SurveyPointPatch,
  ): Promise<StoredSurvey> {
    const saved = await this.json<StoredSurvey>(
      `api/surveys/${encodeURIComponent(survey)}/points/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      },
    );
    return stripSecrets(saved);
  }

  /**
   * Copy parts of one survey's settings into another
   * (POST /api/settings/copy); returns the saved target survey.
   */
  async copySettings(
    from: string,
    to: string,
    parts: readonly CopyPart[],
  ): Promise<StoredSurvey> {
    const query = new URLSearchParams({ from, to, parts: parts.join(",") });
    const saved = await this.json<StoredSurvey>(`api/settings/copy?${query}`, {
      method: "POST",
    });
    return stripSecrets(saved);
  }

  /**
   * Start measuring at a spot (POST /api/start-task?action=start). The app
   * answers 409 with the running job while another one measures.
   */
  async startMeasurement(
    survey: string,
    x: number,
    y: number,
    settings: MeasurementSettings,
  ): Promise<StartAnswer> {
    try {
      const body = await this.json<{ job: MeasurementJobStatus }>(
        "api/start-task?action=start",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ survey, x, y, settings }),
        },
      );
      return { started: true, job: body.job };
    } catch (err) {
      if (err instanceof AppRequestError && err.status === 409 && err.body) {
        const running = (err.body as { job?: MeasurementJobStatus }).job;
        if (running) return { started: false, running, error: err.message };
      }
      throw err;
    }
  }

  /** One job, or null if the app doesn't know it (any more). */
  async measurement(id: string): Promise<MeasurementJobStatus | null> {
    try {
      return await this.json<MeasurementJobStatus>(
        `api/start-task?action=status&id=${encodeURIComponent(id)}`,
      );
    } catch (err) {
      if (err instanceof AppRequestError && err.status === 404) return null;
      throw err;
    }
  }

  /** Stop this job (and no other); true if it was stopped. */
  async stopMeasurement(id: string): Promise<boolean> {
    const body = await this.json<{ stopped: boolean }>(
      "api/start-task?action=stop",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: id }),
      },
    );
    return body.stopped === true;
  }

  /**
   * Does the app hold a sudo password typed in its Settings? Only yes or
   * no ever comes back; null for an app too old to say.
   */
  async sudoPasswordHeld(): Promise<boolean | null> {
    try {
      const body = await this.json<{ held?: unknown }>("api/sudo-password");
      return typeof body.held === "boolean" ? body.held : null;
    } catch (err) {
      if (err instanceof AppRequestError && err.status === 404) return null;
      throw err;
    }
  }
}
