/**
 * sudo.ts - check the sudo password (macOS without the Wi-Fi helper, Linux
 * when iw needs it).
 *
 * The check runs once per password value, not on every measurement: a
 * password that worked is remembered as a hash (in memory only, never the
 * password itself). A password that failed is checked again next time, so
 * fixing it in Settings works at once.
 */
import { createHash } from "crypto";
import { execAsync } from "./server-utils";

const KEY = "__wifiHeatmapperSudoChecked__";

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

/** true if sudo accepts the password (checked once per value). */
export async function checkSudoPassword(password: string): Promise<boolean> {
  const h = hash(password);
  if (store().verified === h) return true;
  try {
    await execAsync(`echo ${password} | sudo -S ls`);
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
