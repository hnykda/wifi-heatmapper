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
import { execAsync } from "./server-utils";

const logger = getLogger("iperfRunner");

const validateWifiDataConsistency = (
  wifiDataBefore: WifiNetwork,
  wifiDataAfter: WifiNetwork
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
  settings: ScannerSettings
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
            "Wifi data inconsistency between scans! Cancelling instead of giving wrong results."
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
  isUdp: boolean
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
  const extracted = extractIperfResults(result, isUdp);
  logger.trace("Iperf extracted results:", extracted);
  return extracted;
}

/**
 * Extracts TCP test results from iperf3 output
 */
export function extractTcpResults(result: any): Partial<IperfTestProperty> {
  return {
    bitsPerSecond: result.end?.sum_received?.bits_per_second,
    retransmits: result.end?.sum_sent?.retransmits,
  };
}

/**
 * Attempts to extract UDP results from the streams[0].udp path
 * This seemed to happen on the ubuntu
 */
export function extractUdpFromStreamPath(
  result: any
): Partial<IperfTestProperty> | null {
  if (!result.end?.streams?.[0]?.udp) {
    return null;
  }

  const udpResult = result.end.streams[0].udp;
  return {
    bitsPerSecond: udpResult.bits_per_second,
    jitterMs: udpResult.jitter_ms,
    lostPackets: udpResult.lost_packets,
    packetsReceived: udpResult.packets,
  };
}

/**
 * Attempts to extract UDP results from the sum path
 */
export function extractUdpFromSumPath(
  result: any
): Partial<IperfTestProperty> | null {
  if (!result.end?.sum) {
    return null;
  }

  return {
    bitsPerSecond: result.end.sum.bits_per_second,
    jitterMs: result.end.sum.jitter_ms,
    lostPackets: result.end.sum.lost_packets,
    packetsReceived: result.end.sum.packets,
  };
}

/**
 * Attempts to extract UDP results from the sum_received path
 */
export function extractUdpFromSumReceivedPath(
  result: any
): Partial<IperfTestProperty> | null {
  if (!result.end?.sum_received?.bits_per_second) {
    return null;
  }

  return {
    bitsPerSecond: result.end.sum_received.bits_per_second,
  };
}

/**
 * Extracts UDP test results from iperf3 output by trying multiple paths
 */
export function extractUdpResults(result: any): Partial<IperfTestProperty> {
  try {
    // Try each extraction path in order
    const fromStream = extractUdpFromStreamPath(result);
    if (fromStream?.bitsPerSecond) {
      logger.trace("UDP results extracted from streams[0].udp path");
      return fromStream;
    }

    const fromSum = extractUdpFromSumPath(result);
    if (fromSum?.bitsPerSecond) {
      logger.trace("UDP results extracted from sum path");
      return fromSum;
    }

    const fromSumReceived = extractUdpFromSumReceivedPath(result);
    if (fromSumReceived?.bitsPerSecond) {
      logger.trace("UDP results extracted from sum_received path");
      return fromSumReceived;
    }

    logger.warn("Failed to extract UDP results from any path");
    return {};
  } catch (error) {
    logger.error("Error extracting UDP test results:", error);
    logger.debug(
      "UDP test result structure:",
      JSON.stringify(result.end, null, 2)
    );
    return {};
  }
}

export function extractIperfResults(
  result: any,
  isUdp: boolean
): IperfTestProperty {
  // Extract results based on test type
  const extractedResults = isUdp
    ? extractUdpResults(result)
    : extractTcpResults(result);

  // Log the extraction results for debugging
  logger.trace(
    `${isUdp ? "UDP" : "TCP"} extraction complete, bitsPerSecond:`,
    extractedResults.bitsPerSecond
  );

  // Validate we have the minimum required data
  if (!extractedResults.bitsPerSecond) {
    throw new Error("No bits per second value found in iperf result");
  }

  // Return with all expected properties
  return {
    bitsPerSecond: extractedResults.bitsPerSecond,
    retransmits: extractedResults.retransmits,
    jitterMs: extractedResults.jitterMs,
    lostPackets: extractedResults.lostPackets,
    packetsReceived: extractedResults.packetsReceived,
  };
}
