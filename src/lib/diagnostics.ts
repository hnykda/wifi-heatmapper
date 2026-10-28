/**
 * diagnostics.ts - the bug report: what goes into it, how it is redacted,
 * and the prefilled GitHub issue link.
 *
 * Pure (no Node APIs), so the browser and the MCP server can use it too.
 * The server collects the facts (diagnostics-server.ts, GET /api/diagnostics)
 * and builds the report here; the report dialog and the MCP report_problem
 * tool turn it into an issue link with buildIssueUrl().
 */
import { createRedactor, RedactOptions } from "./redact";

export const REPO_URL = "https://github.com/hnykda/wifi-heatmapper";
export const SITE_URL = "https://wifi-heatmapper.danielalder.cz";
export const RELEASES_URL = `${REPO_URL}/releases`;
export const ISSUE_TEMPLATE = "bug_report.yml";
/** GitHub refuses very long URLs; stay well under its ~8 KB limit. */
export const ISSUE_URL_MAX_LENGTH = 7500;
export const PASTE_HINT = "Paste the copied diagnostics here.";
/** The longest app error message a report keeps. */
export const PROBLEM_MAX_LENGTH = 2000;

/** Field ids of .github/ISSUE_TEMPLATE/bug_report.yml */
export const ISSUE_FIELDS = {
  whatHappened: "what-happened",
  expected: "expected",
  steps: "steps",
  version: "version",
  os: "os",
  runMode: "run-mode",
  wifiMethod: "wifi-method",
  diagnostics: "diagnostics",
} as const;

export interface DiagnosticsInput {
  generatedAt: string; // ISO time
  app: {
    version: string;
    nodeVersion: string;
    platform: string; // darwin | win32 | linux
    arch: string;
    osName: string;
    osRelease: string;
    /** "desktop app", "Docker", "from source (next start)", ... */
    runMode: string;
    mockMode: boolean;
    dataDir: string;
    /** "on", or "off (reason)"; never the install id */
    usageCounts?: string;
  };
  wifi: {
    /** the method the last reading used, null before the first one */
    method: string | null;
    detail?: string | null;
    at?: string | null;
    /** what the app will try, for when nothing was read yet */
    expected: string;
    /** helper tools found on this system, e.g. { iw: true, nmcli: false } */
    tools?: Record<string, boolean>;
  };
  iperf3Version: string | null; // null: not installed
  survey: {
    name: string;
    points: number;
    /** points with at least one speed test that ran (a 0 Mbps one counts) */
    speedPoints?: number;
    speedTests: boolean;
    iperfServer: string;
    testDuration: number;
  } | null;
  lastMeasurement: {
    at: string;
    ok: boolean;
    speedTests: boolean;
    error?: string;
    note?: string;
  } | null;
  /** the error the app showed, when the report starts from one */
  problem?: string | null;
  logLines: string[];
}

/** What only the redactor sees: never part of the report itself. */
export type RedactionContext = Omit<RedactOptions, "hideNetwork">;

export interface DiagnosticsReport {
  /** network names and addresses replaced by placeholders */
  networkHidden: boolean;
  version: string;
  os: string;
  runMode: string;
  wifiMethod: string;
  problem: string | null;
  /** the facts, one per line, no log */
  summary: string;
  logExcerpt: string;
  logLineCount: number;
  /** everything shared: summary, then the log */
  text: string;
}

function describeWifi(wifi: DiagnosticsInput["wifi"]): string {
  if (!wifi.method) return `not read yet (expected: ${wifi.expected})`;
  return wifi.detail ? `${wifi.method} (${wifi.detail})` : wifi.method;
}

/**
 * buildDiagnostics() - the report, redacted. The sudo password is always
 * removed; with hideNetwork, network names, MAC and IP addresses are
 * replaced by placeholders.
 */
export function buildDiagnostics(
  input: DiagnosticsInput,
  context: RedactionContext,
  { hideNetwork }: { hideNetwork: boolean },
): DiagnosticsReport {
  const redact = createRedactor({ ...context, hideNetwork });
  const { app, wifi, survey, lastMeasurement: last } = input;

  const os = `${app.osName} (${app.platform} ${app.osRelease}, ${app.arch})`;
  const runMode = app.mockMode ? `${app.runMode}, mock mode` : app.runMode;
  const wifiMethod = describeWifi(wifi);
  const problem = input.problem
    ? input.problem.slice(0, PROBLEM_MAX_LENGTH).trim()
    : null;

  const lines: [string, string][] = [
    ["App version", app.version],
    ["Operating system", os],
    ["Runs as", runMode],
    ["Node", app.nodeVersion],
    ["Wi-Fi reading", wifiMethod],
  ];
  if (wifi.method && wifi.at) lines.push(["Wi-Fi last read", wifi.at]);
  if (wifi.tools && Object.keys(wifi.tools).length > 0) {
    lines.push([
      "Wi-Fi tools",
      Object.entries(wifi.tools)
        .map(([tool, found]) => `${tool} ${found ? "found" : "not found"}`)
        .join(", "),
    ]);
  }
  lines.push(["iperf3", input.iperf3Version ?? "not installed"]);
  if (survey) {
    lines.push([
      "Measuring",
      survey.speedTests
        ? `Signal and speed (server ${survey.iperfServer || "not set"}, ${survey.testDuration} s)`
        : "Signal only",
    ]);
    lines.push([
      "Survey points",
      survey.speedTests && survey.speedPoints !== undefined
        ? `${survey.points} (${survey.speedPoints} with speed)`
        : String(survey.points),
    ]);
  } else {
    lines.push(["Measuring", "unknown (no survey open)"]);
  }
  if (last) {
    lines.push([
      "Last measurement",
      last.ok
        ? `worked at ${last.at}`
        : `failed at ${last.at}: ${last.error ?? "no reason given"}`,
    ]);
    if (last.note) lines.push(["Measurement note", last.note]);
  } else {
    lines.push(["Last measurement", "none since the app started"]);
  }
  if (problem) lines.push(["Problem shown", problem]);
  lines.push(["Data folder", app.dataDir]);
  if (app.usageCounts) lines.push(["Usage counts", app.usageCounts]);
  lines.push([
    "Network names and addresses",
    hideNetwork ? "hidden" : "included",
  ]);
  lines.push(["Generated", input.generatedAt]);

  const summary = redact(
    lines.map(([k, v]) => `${k}: ${v.replace(/\s*\n\s*/g, " ")}`).join("\n"),
  );
  const logExcerpt = redact(input.logLines.join("\n"));
  const text =
    `${summary}\n\n` +
    (input.logLines.length > 0
      ? `Recent log (last ${input.logLines.length} lines):\n${logExcerpt}`
      : "Recent log: empty");

  return {
    networkHidden: hideNetwork,
    version: app.version,
    os: redact(os),
    runMode,
    wifiMethod: redact(wifiMethod),
    problem: problem ? redact(problem) : null,
    summary,
    logExcerpt,
    logLineCount: input.logLines.length,
    text,
  };
}

export interface IssueLink {
  url: string;
  /** false: the diagnostics were too long, the link says to paste them */
  complete: boolean;
}

function encodeQuery(params: [string, string][]): string {
  return params
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

/** slice() that never leaves half of a surrogate pair (encodeURIComponent throws on it) */
function safeSlice(s: string, end: number): string {
  const cut = s.slice(0, end);
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
}

function issueTitle(problem: string | null): string {
  if (!problem) return "";
  const first = problem.split("\n")[0].trim();
  const short =
    first.length > 80 ? `${safeSlice(first, 79).trimEnd()}…` : first;
  return `Problem: ${short}`;
}

/**
 * buildIssueUrl() - a link to a new issue with the bug report form filled in
 * from the report. The whole report (with the log) goes in if the link stays
 * under maxLength; otherwise only the summary, with a request to paste the
 * copied diagnostics. Anything still too long is shortened.
 */
export function buildIssueUrl(
  report: DiagnosticsReport,
  { maxLength = ISSUE_URL_MAX_LENGTH }: { maxLength?: number } = {},
): IssueLink {
  const base = `${REPO_URL}/issues/new?`;
  const fields = (diagnostics: string): [string, string][] => [
    ["template", ISSUE_TEMPLATE],
    ["title", issueTitle(report.problem)],
    [
      ISSUE_FIELDS.whatHappened,
      report.problem ? `The app said:\n\n${report.problem}\n\n` : "",
    ],
    [ISSUE_FIELDS.version, report.version],
    [ISSUE_FIELDS.os, report.os],
    [ISSUE_FIELDS.runMode, report.runMode],
    [ISSUE_FIELDS.wifiMethod, report.wifiMethod],
    [ISSUE_FIELDS.diagnostics, diagnostics],
  ];
  const build = (params: [string, string][]) => base + encodeQuery(params);

  const full = build(fields(report.text));
  if (full.length <= maxLength) return { url: full, complete: true };

  // Too long: the summary and a request to paste, then shorten whatever is
  // longest until it fits.
  const params = fields(`${report.summary}\n\n${PASTE_HINT}`);
  let url = build(params);
  const protectedKeys = new Set(["template", ISSUE_FIELDS.version]);
  while (url.length > maxLength) {
    const excess = url.length - maxLength;
    let longest = -1;
    for (let i = 0; i < params.length; i++) {
      if (protectedKeys.has(params[i][0])) continue;
      if (
        longest < 0 ||
        encodeURIComponent(params[i][1]).length >
          encodeURIComponent(params[longest][1]).length
      ) {
        longest = i;
      }
    }
    const [key, value] = params[longest];
    if (value.length === 0) break; // nothing left to shorten
    const encodedPerChar =
      encodeURIComponent(value).length / Math.max(1, value.length);
    const cut = Math.max(10, Math.ceil(excess / encodedPerChar) + 2);
    const keep = Math.max(0, value.length - cut);
    // the paste request stays at the end of the diagnostics
    const tail = key === ISSUE_FIELDS.diagnostics ? `…\n\n${PASTE_HINT}` : "…";
    params[longest] = [
      key,
      keep > tail.length ? safeSlice(value, keep - tail.length) + tail : "",
    ];
    url = build(params);
  }
  return { url, complete: false };
}

/** The guide page for each tab of the app (on the website). */
export const DOCS_FOR_TAB: Record<string, string> = {
  settings: "using-the-app#settings",
  floorplan: "using-the-app#floor-plan",
  heatmaps: "using-the-app#heat-maps",
  points: "using-the-app#survey-points",
};

export function docsUrl(tab?: string): string {
  const page = (tab && DOCS_FOR_TAB[tab]) || "using-the-app";
  return `${SITE_URL}/docs/${page}`;
}
