import { exec } from "child_process";
import util from "util";
import {
  IperfResults,
  IperfTestProperty,
  WifiNetwork,
  ScannerSettings,
} from "./types";
import { scanWifi } from "./wifiScanner";
import { getLogger } from "./logger";

const logger = getLogger("iperfRunner");

const execAsync = (command: string) => {
  logger.trace("Executing command:", command);
  const result = util.promisify(exec)(command);
  return result;
};

const validateWifiDataConsistency = (
  wifiDataBefore: WifiNetwork,
  wifiDataAfter: WifiNetwork,
) => {
  return (
    wifiDataBefore.bssid === wifiDataAfter.bssid &&
    wifiDataBefore.ssid === wifiDataAfter.ssid &&
    wifiDataBefore.frequency === wifiDataAfter.frequency &&
    wifiDataBefore.channel === wifiDataAfter.channel
  );
};

export async function runIperfTest(
  server: string,
  duration: number,
  settings: ScannerSettings,
): Promise<{ iperfResults: IperfResults; wifiData: WifiNetwork }> {
  try {
    const maxRetries = 3;
    let attempts = 0;
    let results: IperfResults | null = null;
    let wifiData: WifiNetwork | null = null;

    // TODO: only retry the one that failed
    while (attempts < maxRetries && !results) {
      try {
        const wifiDataBefore = await scanWifi(settings);
        const tcpDownload = await runSingleTest(server, duration, true, false);
        const tcpUpload = await runSingleTest(server, duration, false, false);
        const udpDownload = await runSingleTest(server, duration, true, true);
        const udpUpload = await runSingleTest(server, duration, false, true);
        const wifiDataAfter = await scanWifi(settings);

        if (!validateWifiDataConsistency(wifiDataBefore, wifiDataAfter)) {
          throw new Error(
            "Wifi data inconsistency between scans! Cancelling instead of giving wrong results.",
          );
        }

        results = {
          tcpDownload,
          tcpUpload,
          udpDownload,
          udpUpload,
        };
        wifiData = {
          ...wifiDataBefore,
          // be more precise by averaging
          rssi: Math.round((wifiDataAfter.rssi + wifiDataBefore.rssi) / 2),
        };
      } catch (error) {
        logger.error(`Attempt ${attempts + 1} failed:`, error);
        attempts++;
        if (attempts >= maxRetries) {
          throw error;
        }
        // wait 2 secs to recover
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    return { iperfResults: results!, wifiData: wifiData! };
  } catch (error) {
    logger.error("Error running iperf3 test:", error);
    throw error;
  }
}

async function runSingleTest(
  server: string,
  duration: number,
  isDownload: boolean,
  isUdp: boolean,
): Promise<IperfTestProperty> {
  let port = "";
  if (server.includes(":")) {
    const [host, serverPort] = server.split(":");
    server = host;
    port = serverPort;
  }
  const command = `iperf3 -c ${server} ${
    port ? `-p ${port}` : ""
  } -t ${duration} ${isDownload ? "-R" : ""} ${isUdp ? "-u -b 0" : ""} -J`;
  const { stdout } = await execAsync(command);
  const result = JSON.parse(stdout);
  logger.trace("Iperf JSON-parsed result:", result);
  const extracted = extractIperfResults(result);
  logger.trace("Iperf extracted results:", extracted);
  return extracted;
}

function extractIperfResults(result: {
  end: {
    sum_received: { bits_per_second: number };
    sum_sent: { retransmits: number };
    sum?: { jitter_ms: number; lost_packets: number; packets: number };
  };
}): IperfTestProperty {
  const end = result.end;
  return {
    bitsPerSecond: end.sum_received.bits_per_second,
    retransmits: end.sum_sent.retransmits,
    jitterMs: end.sum?.jitter_ms,
    lostPackets: end.sum?.lost_packets,
    packetsReceived: end.sum?.packets,
  };
}
