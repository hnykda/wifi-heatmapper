/**
 * sudo.ts - run a command with sudo (macOS without the Wi-Fi helper, Linux
 * when iw needs it), and check the sudo password.
 *
 * The password goes to sudo on stdin (`sudo -S -p ""`), never on a command
 * line, so it is not in `ps` output, a shell, a log or an error message.
 *
 * The check runs once per password value, not on every measurement: a
 * password that worked is remembered as a hash (in memory only, never the
 * password itself). A password that failed is checked again next time, so
 * fixing it in Settings works at once.
 */
import "server-only";
import { createHash } from "crypto";
import { execAsync, RunOptions, RunResult } from "./server-utils";

const KEY = "__wifiHeatmapperSudoChecked__";

/** The preflight reason when sudo refuses the password (MCP matches it). */
export const SUDO_PASSWORD_INVALID = "Please enter a valid sudo password.";

/** The macOS preflight reason when wdutil needs a password and has none. */
export function sudoPasswordMissing(desktopApp: boolean): string {
  return desktopApp
    ? "Please set sudo password. The app's Wi-Fi helper did not work, so macOS needs it."
    : "Please set sudo password. It is required on macOS unless you build the Wi-Fi helper (npm run build:macos-helper).";
}

function hash(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

function store(): { verified: string | null } {
  const g = globalThis as unknown as Record<
    string,
    { verified: string | null }
  >;
  return (g[KEY] ??= { verified: null });
}

/**
 * The arguments for sudo: read the password from stdin (-S) without a
 * prompt (-p ""), then the command. `extra` goes before the command.
 */
export function sudoArgs(
  command: readonly string[],
  extra: readonly string[] = [],
): string[] {
  return [...extra, "-S", "-p", "", ...command];
}

/** Run `command` (program and arguments) with sudo and this password. */
export function runWithSudo(
  password: string,
  command: readonly string[],
  options: Omit<RunOptions, "input"> = {},
): Promise<RunResult> {
  return execAsync("sudo", sudoArgs(command), {
    ...options,
    input: `${password}\n`,
  });
}

/** true if sudo accepts the password (checked once per value). */
export async function checkSudoPassword(password: string): Promise<boolean> {
  const h = hash(password);
  if (store().verified === h) return true;
  try {
    // -k: ignore a cached sudo login, so the password itself is checked
    await execAsync("sudo", sudoArgs(["true"], ["-k"]), {
      input: `${password}\n`,
    });
    store().verified = h;
    return true;
  } catch {
    return false;
  }
}

/** Forget the verified password (tests; or when sudo later refuses it). */
export function forgetSudoPassword(): void {
  store().verified = null;
}
