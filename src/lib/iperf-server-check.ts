import net from "node:net";
import { PartialHeatmapSettings, WifiScanResults } from "./types";

const IPERF_PORT = 5201;

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

/**
 * checkIperfServerReachable() - shared by every OS's checkIperfServer()
 * @param settings includes the iperfServerAddress
 * @returns empty array of SSIDs, plus "" or error string
 */
export async function checkIperfServerReachable(
  settings: PartialHeatmapSettings,
  port = IPERF_PORT,
): Promise<WifiScanResults> {
  const ok = await canConnect(settings.iperfServerAdrs, port);
  return { SSIDs: [], reason: ok ? "" : "Cannot connect to iperf3 server." };
}
