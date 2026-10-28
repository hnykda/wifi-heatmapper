import { Logger } from "tslog";
import {
  hideSudoPassword,
  PASSWORD_PLACEHOLDER,
  SUDO_ECHO_MASK,
} from "./redact";

/**
 * Recent log lines, kept in memory (never written to a file) so a bug report
 * can include them. Shared through globalThis: Next.js may load this module
 * more than once (route handlers, instrumentation).
 */
export const LOG_BUFFER_MAX_LINES = 300;
export const LOG_BUFFER_MAX_BYTES = 64 * 1024;
const MAX_LINE_LENGTH = 2000;

const BUFFER_KEY = "__wifiHeatmapperLogBuffer__";
const SECRETS_KEY = "__wifiHeatmapperLogSecrets__";

type LogBuffer = { lines: string[]; bytes: number };

function buffer(): LogBuffer {
  const g = globalThis as unknown as Record<string, LogBuffer | undefined>;
  if (!g[BUFFER_KEY]) g[BUFFER_KEY] = { lines: [], bytes: 0 };
  return g[BUFFER_KEY]!;
}

function secrets(): string[] {
  const g = globalThis as unknown as Record<string, string[] | undefined>;
  if (!g[SECRETS_KEY]) g[SECRETS_KEY] = [];
  return g[SECRETS_KEY]!;
}

/**
 * rememberSecret() - the sudo password the measurement uses, so that it is
 * masked in log lines even if something logs it by accident. Memory only;
 * only the last few are kept.
 */
export function rememberSecret(value: string | undefined | null): void {
  if (!value || value.length < 3) return;
  const list = secrets();
  if (list.includes(value)) return;
  list.push(value);
  if (list.length > 3) list.shift();
}

/** The secrets to mask (for the diagnostics redactor). */
export function knownSecrets(): string[] {
  return [...secrets()];
}

function maskSecrets(text: string): string {
  for (const s of secrets()) text = text.split(s).join(PASSWORD_PLACEHOLDER);
  return hideSudoPassword(text);
}

function formatArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg && typeof arg === "object" && "message" in arg && "name" in arg) {
    // tslog's error object, or a plain Error
    const e = arg as { name: unknown; message: unknown };
    return `${e.name}: ${e.message}`;
  }
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

/** Format one tslog log object as a line like the console shows. */
export function formatLogObject(logObj: Record<string, unknown>): string {
  const meta = (logObj._meta ?? {}) as {
    date?: Date;
    name?: string;
    logLevelName?: string;
  };
  const rest = Object.entries(logObj).filter(([k]) => k !== "_meta");
  const numeric = rest.every(([k]) => /^\d+$/.test(k));
  const message = numeric
    ? rest.map(([, v]) => formatArg(v)).join(" ")
    : formatArg(Object.fromEntries(rest));
  const date =
    meta.date instanceof Date
      ? meta.date.toISOString()
      : new Date().toISOString();
  return `[${date}] [${meta.name ?? "root"}:${meta.logLevelName ?? "LOG"}] ${message}`;
}

/** Add a line, dropping the oldest beyond the line and size limits. */
export function appendLogLine(line: string): void {
  const buf = buffer();
  let text = maskSecrets(line);
  if (text.length > MAX_LINE_LENGTH) {
    text = `${text.slice(0, MAX_LINE_LENGTH)} … (${text.length - MAX_LINE_LENGTH} more characters)`;
  }
  buf.lines.push(text);
  buf.bytes += text.length + 1;
  while (
    buf.lines.length > LOG_BUFFER_MAX_LINES ||
    (buf.bytes > LOG_BUFFER_MAX_BYTES && buf.lines.length > 1)
  ) {
    buf.bytes -= buf.lines.shift()!.length + 1;
  }
}

/** The recent log lines, oldest first. */
export function recentLogLines(): string[] {
  return [...buffer().lines];
}

/** For tests. */
export function clearLogBuffer(): void {
  const buf = buffer();
  buf.lines = [];
  buf.bytes = 0;
}

const rootLogger = new Logger({
  name: "root",
  // 0: silly, 1: trace, 2: debug, 3: info, 4: warn, 5: error, 6: fatal
  minLevel: parseInt(process.env.LOG_LEVEL || "3"),
  hideLogPositionForProduction: true,
  prettyLogTemplate: "[{{rawIsoStr}}] [{{name}}:{{logLevelName}}] ",
  stylePrettyLogs: false,
  // never print the sudo password, even at debug level
  maskValuesOfKeys: ["password", "sudoerPassword"],
  maskValuesOfKeysCaseInsensitive: true,
  maskValuesRegEx: [SUDO_ECHO_MASK],
});

// Attached before any sub-logger exists: sub-loggers copy the transports.
rootLogger.attachTransport((logObj) => {
  try {
    appendLogLine(formatLogObject(logObj as Record<string, unknown>));
  } catch {
    // the log buffer must never break logging
  }
});

export function getLogger(name: string) {
  return rootLogger.getSubLogger({ name });
}
