/**
 * iperfUtils.ts - the iperf3 command for each speed test.
 *
 * The app builds the command itself, as an argument array (no shell):
 *
 *   iperf3 -c <server> [-p <port>] -t <duration> [-R] [-u] <extra...> -J
 *
 * -R (download), -u (UDP) and -J (JSON, which the app parses) belong to the
 * test; the server, port and duration come from Settings. A survey only
 * stores the extra options per test (`iperfCommands`, kept under that name
 * for older files): by default `-b 100M` for the fixed-rate UDP tests.
 *
 * Shared by the server, the browser (Settings) and the MCP server: no
 * Node-only imports here.
 */
import type { IperfCommands } from "./types";

export type IperfTest = keyof IperfCommands;

export const IPERF_TESTS: readonly IperfTest[] = [
  "tcpDownload",
  "tcpUpload",
  "udpDownload",
  "udpUpload",
];

/** The extra iperf3 options of each test, by default. */
export const defaultIperfCommands: IperfCommands = {
  tcpDownload: [],
  tcpUpload: [],
  udpDownload: ["-b", "100M"],
  udpUpload: ["-b", "100M"],
};

const isDownload = (test: IperfTest) => test.endsWith("Download");
const isUdp = (test: IperfTest) => test.startsWith("udp");

/** The options the app sets itself, with what each one does. */
const MANAGED_OPTIONS: Record<string, string> = {
  "-c": "the server, from Settings",
  "--client": "the server, from Settings",
  "-p": "the port, from the server address",
  "--port": "the port, from the server address",
  "-t": "the test duration, from Settings",
  "--time": "the test duration, from Settings",
  "-J": "the JSON output the app reads",
  "--json": "the JSON output the app reads",
  "-R": "download or upload, by test",
  "--reverse": "download or upload, by test",
  "-u": "TCP or UDP, by test",
  "--udp": "TCP or UDP, by test",
  "-s": "server mode",
  "--server": "server mode",
};

/** The fixed part of a test's command, for display: `iperf3 -c ...`. */
export function iperfFixedPart(test: IperfTest): {
  before: string;
  after: string;
} {
  return {
    before: [
      "iperf3 -c <server> -t <duration>",
      ...(isDownload(test) ? ["-R"] : []),
      ...(isUdp(test) ? ["-u"] : []),
    ].join(" "),
    after: "-J",
  };
}

/**
 * iperfArgs() - the arguments for one test (without "iperf3" itself).
 * @param host - the server, passed as one argument whatever it contains
 * @param port - "" for iperf3's default
 */
export function iperfArgs(
  test: IperfTest,
  host: string,
  port: string,
  duration: number,
  extra: readonly string[] = defaultIperfCommands[test],
): string[] {
  return [
    "-c",
    host,
    ...(port ? ["-p", port] : []),
    "-t",
    String(duration),
    ...(isDownload(test) ? ["-R"] : []),
    ...(isUdp(test) ? ["-u"] : []),
    ...extra,
    "-J",
  ];
}

/** Why these extra options can't be used, or null. */
export function iperfArgsProblem(args: readonly string[]): string | null {
  if (args.length > 40) return "has too many options";
  for (const arg of args) {
    if (arg.length > 200) return "has an option that is too long";
    if (/[\0\r\n]/.test(arg)) return "has a line break in an option";
    // --long or --long=value; -x, -xvalue or -xy (the first letter counts)
    const name = arg.startsWith("--")
      ? arg.split("=")[0]
      : /^-[A-Za-z]/.test(arg)
        ? arg.slice(0, 2)
        : "";
    if (name && MANAGED_OPTIONS[name]) {
      return `sets ${name} (${MANAGED_OPTIONS[name]}), which the app sets itself`;
    }
  }
  return null;
}

/* ---------- options as text (the Settings field) ---------- */

/** Shell syntax that means an old template was more than iperf3 options. */
const SHELL_SYNTAX = /[|&;<>()$`\\*?[\]{}~!#\n]/;

/**
 * splitArgs() - split typed options into arguments: spaces separate them,
 * "double" or 'single' quotes keep spaces in one. No shell rules beyond
 * that: nothing is expanded. Returns null if a quote is not closed.
 */
export function splitArgs(text: string): string[] | null {
  const args: string[] = [];
  let current = "";
  let inArg = false;
  let quote: '"' | "'" | null = null;
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      inArg = true;
    } else if (/\s/.test(ch)) {
      if (inArg) args.push(current);
      current = "";
      inArg = false;
    } else {
      current += ch;
      inArg = true;
    }
  }
  if (quote) return null;
  if (inArg) args.push(current);
  return args;
}

/** The arguments as text for the Settings field (quoted where needed). */
export function formatArgs(args: readonly string[]): string {
  return args
    .map((a) =>
      a === "" || /[\s"']/.test(a)
        ? a.includes('"')
          ? `'${a}'`
          : `"${a}"`
        : a,
    )
    .join(" ");
}

/* ---------- migration of old command templates ---------- */

/**
 * migrateIperfTemplate() - the extra options in an old command template
 * (before 0.8 a survey stored whole command lines such as
 * "iperf3 -c {server} {port} -t {duration} -R -J", run through a shell).
 *
 * The parts the app now sets itself are dropped; what is left are the
 * extra options. Returns null, with the reason, when the template can't be
 * read that way: shell syntax (pipes, redirects, variables, quotes), a
 * program other than iperf3, or no {server}. The caller then uses the
 * default options.
 */
export function migrateIperfTemplate(
  template: string,
): { args: string[] } | { args: null; reason: string } {
  const text = template.trim();
  // placeholders are the only braces a template may have
  const withoutPlaceholders = text.replace(/\{(server|port|duration)\}/g, "");
  if (SHELL_SYNTAX.test(withoutPlaceholders) || /["']/.test(text)) {
    return { args: null, reason: "it contains shell syntax" };
  }
  const tokens = text.split(/\s+/);
  const program = tokens.shift() ?? "";
  if (!/(^|[/\\])iperf3(\.exe)?$/i.test(program)) {
    return { args: null, reason: `it runs "${program}", not iperf3` };
  }
  if (!tokens.includes("{server}")) {
    return { args: null, reason: "it has no {server}" };
  }
  const args: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^\{(server|port|duration)\}$/.test(t)) continue;
    // options the app sets, with their value: only the placeholder
    // (a fixed port or duration now comes from the settings)
    const placeholder: Record<string, string> = {
      "-c": "{server}",
      "--client": "{server}",
      "-p": "{port}",
      "--port": "{port}",
      "-t": "{duration}",
      "--time": "{duration}",
    };
    if (placeholder[t]) {
      if (tokens[i + 1] !== placeholder[t]) {
        return {
          args: null,
          reason: `it sets ${t} ${tokens[i + 1] ?? ""}`.trim() + " itself",
        };
      }
      i++;
      continue;
    }
    if (["-J", "--json", "-R", "--reverse", "-u", "--udp"].includes(t)) {
      continue;
    }
    args.push(t);
  }
  const problem = iperfArgsProblem(args);
  if (problem) return { args: null, reason: `it ${problem}` };
  return { args };
}
