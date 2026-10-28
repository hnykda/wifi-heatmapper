/**
 * sudo-session.ts - the sudo password the person typed in the app's
 * Settings, held by the server for measurements that don't bring one
 * (those an AI agent starts through the MCP server).
 *
 * - Memory only, for the lifetime of the server process: never written to
 *   a file or a log (it is registered with the logger's masking), never
 *   returned by any API, gone when the app restarts.
 * - Set by the page (PUT /api/sudo-password) when the field changes, and by
 *   a start request that carries one; cleared when the field is emptied
 *   (DELETE).
 * - Only ever used as `sudo -S` input for the app's fixed Wi-Fi commands
 *   (see sudo.ts); no request can choose what runs with it.
 *
 * Kept on globalThis because Next.js may load this module once per route
 * bundle.
 */
import "server-only";
import { rememberSecret } from "./logger";

const KEY = "__wifiHeatmapperSudoSession__";

function slot(): { password: string } {
  const g = globalThis as unknown as Record<string, { password: string }>;
  return (g[KEY] ??= { password: "" });
}

/** Hold this password ("" forgets it). */
export function holdSudoPassword(password: string): void {
  rememberSecret(password);
  slot().password = password;
}

/** The held password, or "". Server-side use only: never send it out. */
export function heldSudoPassword(): string {
  return slot().password;
}

export function hasHeldSudoPassword(): boolean {
  return slot().password !== "";
}

/**
 * The password a measurement uses: the one it was started with, else the
 * held one. A start that brings one makes it the held one.
 */
export function sudoPasswordFor(sent: string | undefined): string {
  if (sent) {
    holdSudoPassword(sent);
    return sent;
  }
  return heldSudoPassword();
}
