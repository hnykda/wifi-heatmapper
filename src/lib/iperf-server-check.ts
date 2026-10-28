import net from "node:net";
import { PartialHeatmapSettings, WifiScanResults } from "./types";
import {
  DEFAULT_IPERF_PORT,
  formatServerAddress,
  parseServerAddress,
} from "./measurement-mode";
import { isMockMode } from "./app-info";
import { delay } from "./server-utils";

const MOCK_DELAY_MS = parseInt(
  process.env.WIFI_HEATMAPPER_MOCK_DELAY_MS || "150",
  10,
);

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

/**
 * checkIperfServer() - does the speed test server answer? The same socket
 * check on every OS. In mock mode nothing is contacted: a server whose
 * name contains "unreachable" is treated as down, so tests and demos can
 * exercise that path.
 */
export async function checkIperfServer(
  settings: PartialHeatmapSettings,
): Promise<WifiScanResults> {
  if (isMockMode()) {
    await delay(MOCK_DELAY_MS);
    const address = settings.iperfServerAdrs;
    const reason = !parseServerAddress(address)
      ? badAddressReason(address)
      : /unreachable/i.test(address)
        ? unreachableReason(address)
        : "";
    return { SSIDs: [], reason };
  }
  return checkIperfServerReachable(settings);
}
