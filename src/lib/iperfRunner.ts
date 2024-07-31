import { exec } from "child_process";
import util from "util";
import { IperfResults, IperfTest } from "./database";

const execAsync = util.promisify(exec);

export async function runIperfTest(
  server: string,
  duration: number
): Promise<IperfResults> {
  try {
    const maxRetries = 3;
    let attempts = 0;
    let results: IperfResults | null = null;

    // TODO: only retry the one that failed
    while (attempts < maxRetries && !results) {
      try {
        const tcpDownload = await runSingleTest(server, duration, true, false);
        const tcpUpload = await runSingleTest(server, duration, false, false);
        const udpDownload = await runSingleTest(server, duration, true, true);
        const udpUpload = await runSingleTest(server, duration, false, true);

        results = {
          tcpDownload,
          tcpUpload,
          udpDownload,
          udpUpload,
        };
      } catch (error) {
        console.error(`Attempt ${attempts + 1} failed:`, error);
        attempts++;
        if (attempts >= maxRetries) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return results!;
  } catch (error) {
    console.error("Error running iperf3 test:", error);
    throw error;
  }
}

async function runSingleTest(
  server: string,
  duration: number,
  isDownload: boolean,
  isUdp: boolean
): Promise<IperfTest> {
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
  return extractIperfResults(result);
}

function extractIperfResults(result: any): IperfTest {
  const end = result.end;
  return {
    bitsPerSecond: end.sum_received.bits_per_second,
    retransmits: end.sum_sent.retransmits,
    jitterMs: end.sum?.jitter_ms,
    lostPackets: end.sum?.lost_packets,
    packetsReceived: end.sum?.packets,
  };
}
