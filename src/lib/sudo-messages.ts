/**
 * The reasons a measurement gives when it needs the sudo password. Shared
 * by the server (sudo.ts, the scanners) and the measurement panel, which
 * asks for the password when it sees one. The MCP server matches them too.
 */

/** The preflight reason when sudo refuses the password. */
export const SUDO_PASSWORD_INVALID = "Please enter a valid sudo password.";

const MISSING = "Please set sudo password.";

/** The macOS preflight reason when wdutil needs a password and has none. */
export function sudoPasswordMissing(desktopApp: boolean): string {
  return desktopApp
    ? `${MISSING} The app's Wi-Fi helper did not work, so macOS needs it.`
    : `${MISSING} It is required on macOS unless you build the Wi-Fi helper (npm run build:macos-helper).`;
}

/** Did this measurement fail for want of a (correct) sudo password? */
export function needsSudoPassword(reason: string): boolean {
  return reason.includes(MISSING) || reason.includes(SUDO_PASSWORD_INVALID);
}
