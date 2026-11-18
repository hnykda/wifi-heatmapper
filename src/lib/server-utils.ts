import "server-only";
import { spawn } from "child_process";
import { access, constants } from "fs/promises";
import path from "path";
import { getLogger } from "./logger";
import { abortError } from "./abort";
const logger = getLogger("server-utils");

export interface RunOptions {
  /** aborting it kills the child process; the call rejects with an AbortError */
  signal?: AbortSignal;
  /** written to the command's stdin, which is then closed (e.g. a sudo password) */
  input?: string;
}

export interface RunResult {
  stdout: string;
  stderr: string;
}

/** A command that failed. Like execFile's error: the output is attached. */
export type CommandError = Error & {
  code?: number | string | null;
  signal?: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  cmd: string;
};

/** How a command line is shown in logs and errors. Arguments only. */
export function showCommand(file: string, args: readonly string[]): string {
  return [file, ...args]
    .map((a) => (a === "" || /[\s"'\\]/.test(a) ? JSON.stringify(a) : a))
    .join(" ");
}

/**
 * execAsync(file, args) - run a program with an argument array and return
 * { stdout, stderr }, ends trimmed.
 *
 * There is no shell: `args` reach the program exactly as given, so a value
 * like `x; touch /tmp/pwned` is one argument, never a second command. Pipes
 * and redirects are done in JavaScript instead. On Windows no console window
 * is opened (the desktop app runs node without one).
 *
 * A non-zero exit rejects with a CommandError carrying stdout and stderr
 * (some tools print why they failed on stdout). `input` is written to stdin
 * and never logged; `signal` kills the program.
 */
export function execAsync(
  file: string,
  args: readonly string[] = [],
  { signal, input }: RunOptions = {},
): Promise<RunResult> {
  const shown = showCommand(file, args);
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError(signal));
    logger.debug("Executing command:", shown);
    const child = spawn(file, [...args], {
      windowsHide: true,
      signal,
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => err.push(chunk));
    if (input !== undefined && child.stdin) {
      // a program that exits without reading its stdin is not an error
      child.stdin.on("error", () => {});
      child.stdin.end(input);
    }

    let settled = false;
    const fail = (error: Error, code?: number | null, sig?: string | null) => {
      if (settled) return;
      settled = true;
      const stdout = Buffer.concat(out).toString();
      const stderr = Buffer.concat(err).toString();
      if (error.name === "AbortError") return reject(error);
      Object.assign(error, {
        code: code ?? (error as { code?: unknown }).code,
        signal: sig ?? null,
        stdout,
        stderr,
        cmd: shown,
      });
      logger.debug(`execAsync(${shown}) rejects with "${error}"`);
      reject(error);
    };

    // could not start (ENOENT: not installed), or aborted
    child.on("error", (error) => fail(error));
    child.on("close", (code, sig) => {
      if (settled) return;
      if (code === 0) {
        settled = true;
        const stdout = Buffer.concat(out).toString();
        logger.debug(`Command result: ${JSON.stringify(stdout)}`);
        resolve({
          stdout: stdout.trimEnd(),
          stderr: Buffer.concat(err).toString().trimEnd(),
        });
        return;
      }
      const stderr = Buffer.concat(err).toString().trim();
      fail(
        new Error(
          `Command failed: ${shown}${stderr ? `\n${stderr}` : ""}` +
            (sig ? ` (killed by ${sig})` : ""),
        ),
        code,
        sig,
      );
    });
  });
}

/**
 * findOnPath() - where a program is on PATH (like `command -v`), or null.
 * On Windows the PATHEXT extensions (.EXE, ...) are tried too.
 */
export async function findOnPath(name: string): Promise<string | null> {
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const exts =
    process.platform === "win32"
      ? ["", ...(process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")]
      : [""];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext);
      try {
        await access(candidate, constants.X_OK);
        return candidate;
      } catch {
        // not here
      }
    }
  }
  return null;
}

/**
 * delay a given number of milliseconds
 * @param ms:number - number of milliseconds to delay
 * @param signal - rejects with an AbortError as soon as it is aborted
 * @returns Promise<void>
 */
export async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError(signal));
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal!));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
