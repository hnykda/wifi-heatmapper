import net from "node:net";
import { PartialHeatmapSettings, WifiScanResults } from "./types";
import {
  DEFAULT_IPERF_PORT,
  formatServerAddress,
  parseServerAddress,
} from "./measurement-mode";

/**
 * canConnect() - open (and close) a TCP connection, without nc or PowerShell
 * @returns true if something accepted the connection within timeoutMs
 */
export function canConnect(
  host: string,
  port: number,
  timeoutMs = 2000,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

/** The reason shown when the speed test server doesn't answer. */
export function unreachableReason(
  address: string,
  defaultPort = DEFAULT_IPERF_PORT,
): string {
  const parsed = parseServerAddress(address);
  const where = parsed
    ? formatServerAddress({ ...parsed, port: parsed.port ?? defaultPort })
    : address;
  return `Can't reach the speed test server at ${where}. Check that iperf3 -s is running there and that no firewall blocks the port.`;
}

/** The reason shown for an empty or malformed server address. */
export function badAddressReason(address: string): string {
  return address?.trim()
    ? `"${address.trim()}" is not a valid speed test server address. Use a host name or IP address, optionally followed by :port.`
    : "No speed test server is set.";
}

/**
 * checkIperfServerReachable() - shared by every OS's checkIperfServer()
 * @param settings includes the iperfServerAdrs: host, host:port,
 *   [IPv6]:port or a bare IPv6 address
 * @param defaultPort used when the address names no port
 * @returns empty array of SSIDs, plus "" or error string
 */
export async function checkIperfServerReachable(
  settings: PartialHeatmapSettings,
  defaultPort = DEFAULT_IPERF_PORT,
): Promise<WifiScanResults> {
  const parsed = parseServerAddress(settings.iperfServerAdrs);
  if (!parsed) {
    return { SSIDs: [], reason: badAddressReason(settings.iperfServerAdrs) };
  }
  const ok = await canConnect(parsed.host, parsed.port ?? defaultPort);
  return {
    SSIDs: [],
    reason: ok ? "" : unreachableReason(settings.iperfServerAdrs, defaultPort),
  };
}
