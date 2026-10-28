import {
  PartialHeatmapSettings,
  WifiResults,
  WifiScanResults,
  WifiActions,
} from "./types";
import { checkSudoPassword, runWithSudo, SUDO_PASSWORD_INVALID } from "./sudo";
import { execAsync } from "./server-utils";
import {
  channelToBand,
  getDefaultWifiResults,
  percentageToRssi,
  bySignalStrength,
  normalizeMacAddress,
  isValidMacAddress,
  rssiToPercentage,
  validNoise,
} from "./utils";
import isDocker from "is-docker";
import isPodman from "is-podman";
import { getLogger } from "./logger";
import { recordWifiMethod, WIFI_METHOD } from "./diagnostics-state";
const logger = getLogger("wifi-Linux");

export class LinuxWifiActions implements WifiActions {
  currentSSIDName: string = ""; // name of the current SSID
  strongestSSID: WifiResults | null = null; // strongest SSID if not currentSSID

  /**
   * preflightSettings - check whether the Wi-Fi can be read
   * (the speed test is checked separately, in speed-test.ts)
   * Tests:
   *   * iw is installed
   *   * sudoerPassword - correct if given; required only if iw refuses
   *     to read the link as a normal user
   *
   * @param settings
   * @returns empty array of SSIDs, plus "" or error string
   */
  async preflightSettings(
    settings: PartialHeatmapSettings,
  ): Promise<WifiScanResults> {
    const response: WifiScanResults = {
      SSIDs: [],
      reason: "",
    };

    let reason: string = "";

    // Check for required Linux tools
    logger.info("Checking for required Linux tools...");
    const missingTools: string[] = [];

    try {
      await execAsync("which", ["iw"]);
      logger.info("  ✓ iw found");
    } catch {
      logger.warn("  ✗ iw not found");
      missingTools.push("iw");
    }

    if (missingTools.length > 0) {
      reason = `Missing required tools: ${missingTools.join(", ")}. Install them with your package manager (e.g., apt install iw).`;
      logger.error(reason);
    }

    // Linux may need a sudo password for `iw dev <if> link`. Docker doesn't,
    // and most desktop distributions let a normal user run it.
    if (!reason && !isDocker() && !isPodman()) {
      if (!settings.sudoerPassword || settings.sudoerPassword == "") {
        try {
          await readConnectedWifiLink("");
          logger.info("  ✓ iw reads the connected link without sudo");
        } catch (error) {
          reason = error instanceof Error ? error.message : String(error);
        }
      }

      // check that the sudo password is actually correct
      // (once per password value, see sudo.ts)
      else {
        if (!(await checkSudoPassword(settings.sudoerPassword))) {
          reason = SUDO_PASSWORD_INVALID;
        }
      }
    }
    // fill in the reason and return it
    response.reason = reason;
    return response;
  }

  /**
   * scanWifi() - return an array of available wifi SSIDs plus a reason string
   * These are sorted by the strongest RSSI
   */
  async scanWifi(_settings: PartialHeatmapSettings): Promise<WifiScanResults> {
    const response: WifiScanResults = {
      SSIDs: [],
      reason: "",
    };

    try {
      // Get the Wifi information from system_profiler
      const result = await execAsync("nmcli", ["-t", "dev", "wifi", "list"]);

      response.SSIDs = getCandidateSSIDs(result.stdout);
      logger.debug(`Local SSIDs: ${response.SSIDs.length}`);
      logger.debug(`Local SSIDs: ${JSON.stringify(response.SSIDs, null, 2)}`);
    } catch (err) {
      response.reason = `Cannot get wifi info: ${err}`;
    }
    return response; // WifiScanResults which is array of WifiResults and error code
  }

  /**
   * getWifi - return the WifiResults for the currently-associated SSID
   * @param settings
   * @returns
   */
  async getWifi(settings: PartialHeatmapSettings): Promise<WifiScanResults> {
    const response: WifiScanResults = {
      SSIDs: [],
      reason: "",
    };
    try {
      const { interfaceId, linkOutput } = await readConnectedWifiLink(
        settings.sudoerPassword,
      );
      const infoOutput = await iwDevInfo(interfaceId);

      logger.trace("IW output:", linkOutput);
      logger.trace("IW info:", infoOutput);
      const parsed = parseIwOutput(linkOutput, infoOutput);
      parsed.noise = await readNoise(interfaceId, settings.sudoerPassword);
      recordWifiMethod(
        lastLinkUsedSudo ? WIFI_METHOD.iwSudo : WIFI_METHOD.iw,
        `iw dev ${interfaceId} link; noise ${parsed.noise == null ? "not reported" : "from survey dump"}`,
      );
      logger.trace("Final WiFi data:", parsed);
      response.SSIDs.push(parsed);
    } catch (err) {
      response.reason = err instanceof Error ? err.message : String(err);
    }
    return response;
  }
}
/**
 * END OF LinuxOSWifiActions - the remainder is a set of helper functions
 */

/** Parse iw's interface blocks, not their enumeration order or SSID fields. */
export function parseIwInterfaces(output: string): string[] {
  const interfaces: string[] = [];
  let name = "";
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    const match = trimmed.match(/^Interface\s+(\S+)$/);
    if (match) name = match[1];
    else if (trimmed === "type managed" && name) interfaces.push(name);
    else if (trimmed.startsWith("phy#") || trimmed.startsWith("Unnamed/"))
      name = "";
  }
  return interfaces;
}

function hasIwConnection(output: string): boolean {
  return /^\s*Connected to\s+(?:[\da-f]{2}:){5}[\da-f]{2}\b/im.test(output);
}

async function readConnectedWifiLink(
  password: string,
): Promise<{ interfaceId: string; linkOutput: string }> {
  const { stdout } = await execAsync("iw", ["dev"]);
  const interfaces = parseIwInterfaces(stdout);
  if (!interfaces.length)
    throw new Error(
      "No managed Wi-Fi interface found. Connect a Wi-Fi adapter and try again.",
    );
  let unreadable = false;
  for (const interfaceId of interfaces) {
    let linkOutput: string;
    try {
      linkOutput = await iwDevLink(interfaceId, password);
    } catch {
      unreadable = true;
      continue;
    }
    if (hasIwConnection(linkOutput)) return { interfaceId, linkOutput };
  }
  if (unreadable) {
    throw new Error(
      "Cannot read Wi-Fi link information. Check Wi-Fi permissions or set the sudo password, then try again.",
    );
  }
  throw new Error(
    "No connected Wi-Fi interface found. Connect to a Wi-Fi network and try again.",
  );
}

/** One way to run an iw command: as this user, or with sudo. */
export interface IwCommand {
  args: string[]; // ["iw", "dev", <if>, ...]
  sudo: boolean;
}

/**
 * iwLinkCommands() - the commands that read the current link, in the order to
 * try them. `iw dev <if> link` only asks nl80211 for state (no scan), which
 * the kernel allows for any user, so it is tried without sudo first. sudo is
 * the fallback for systems that refuse it, and only with a password.
 * @param interfaceId - e.g. "wlp1s0"
 * @param pw - the sudo password ("" if none was given)
 * @param isRoot - true in Docker/Podman, where sudo is neither needed nor present
 * @returns one or two commands
 */
export function iwLinkCommands(
  interfaceId: string,
  pw: string,
  isRoot: boolean,
): IwCommand[] {
  return iwDevCommands(interfaceId, ["link"], pw, isRoot);
}

/**
 * iwDevCommands() - `iw dev <if> <subcommand>`, unprivileged first, then
 * with sudo if a password was given (see iwLinkCommands). The password is
 * never part of the command: runWithSudo() passes it on stdin.
 */
export function iwDevCommands(
  interfaceId: string,
  subcommand: string[],
  pw: string,
  isRoot: boolean,
): IwCommand[] {
  const args = ["iw", "dev", interfaceId, ...subcommand];
  if (isRoot || !pw) return [{ args, sudo: false }];
  return [
    { args, sudo: false },
    { args, sudo: true },
  ];
}

async function iwDevLink(interfaceId: string, pw: string): Promise<string> {
  return iwDevRun(interfaceId, ["link"], pw);
}

/** true when the last `iw dev <if> link` only worked with sudo */
let lastLinkUsedSudo = false;

async function iwDevRun(
  interfaceId: string,
  subcommand: string[],
  pw: string,
): Promise<string> {
  const commands = iwDevCommands(
    interfaceId,
    subcommand,
    pw,
    isDocker() || isPodman(),
  );
  let lastError: unknown;
  for (const { args, sudo } of commands) {
    try {
      const { stdout } = sudo
        ? await runWithSudo(pw, args)
        : await execAsync(args[0], args.slice(1));
      if (subcommand[0] === "link") lastLinkUsedSudo = sudo;
      return stdout;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/**
 * readNoise() - the noise floor of the channel in use, from
 * `iw dev <if> survey dump`. Not every driver reports it (Intel iwlwifi
 * often doesn't), and reading it must never fail a measurement, so any
 * error just means "unknown" (null).
 */
async function readNoise(
  interfaceId: string,
  pw: string,
): Promise<number | null> {
  try {
    return parseIwSurveyNoise(
      await iwDevRun(interfaceId, ["survey", "dump"], pw),
    );
  } catch (err) {
    logger.debug(`iw survey dump failed, noise unknown: ${err}`);
    return null;
  }
}

/**
 * parseIwSurveyNoise() - noise (dBm) of the channel marked "[in use]" in
 * `iw dev <if> survey dump` output, or null if there is no in-use entry or
 * it has no noise line.
 */
export function parseIwSurveyNoise(output: string): number | null {
  for (const block of output.split(/^Survey data from /m)) {
    if (!/frequency:.*\[in use\]/.test(block)) continue;
    const match = block.match(/^\s*noise:\s*(-?\d+)\s*dBm/m);
    return match ? validNoise(parseInt(match[1])) : null;
  }
  return null;
}

async function iwDevInfo(interfaceId: string): Promise<string> {
  const { stdout } = await execAsync("iw", ["dev", interfaceId, "info"]);
  return stdout;
}

/**
 * parseIwOutput from Linux host
 * @param linkOutput
 * @param infoOutput
 * @returns
 */
export function parseIwOutput(
  linkOutput: string,
  infoOutput: string,
): WifiResults {
  if (!hasIwConnection(linkOutput)) {
    throw new Error(
      "Wi-Fi is not connected. Connect to a Wi-Fi network and try again.",
    );
  }
  const networkInfo = getDefaultWifiResults();
  let hasSignal = false;
  const linkLines = linkOutput.split("\n");
  linkLines.forEach((line) => {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith("SSID:")) {
      networkInfo.ssid = trimmedLine.split("SSID:")[1]?.trim() || "";
    } else if (trimmedLine.startsWith("Connected to")) {
      networkInfo.bssid = normalizeMacAddress(
        trimmedLine.split(" ")[2]?.trim() || "",
      );
    } else if (trimmedLine.startsWith("signal:")) {
      const signalMatch = trimmedLine.match(/signal:\s*(-?\d+)\s*dBm/);
      if (signalMatch) {
        networkInfo.rssi = parseInt(signalMatch[1]);
        hasSignal = true;
      }
    } else if (trimmedLine.startsWith("freq:")) {
      const freqMatch = trimmedLine.match(/freq:\s*(\d+)/);
      if (freqMatch) {
        const freqMhz = parseInt(freqMatch[1]);
        const chan = frequencyToChannel(freqMhz);
        logger.debug(`freq/channel: ${freqMhz} ${chan}`);
        if (chan) {
          networkInfo.channel = chan;
          networkInfo.band = channelToBand(chan);
        } else {
          networkInfo.channel = 0;
          networkInfo.band = 0;
        }
        // networkInfo.band = Math.round((freqMhz / 1000) * 100) / 100; // Convert MHz to GHz with 2 decimal places
      }
    } else if (trimmedLine.startsWith("tx bitrate:")) {
      const txRate = trimmedLine.split("tx bitrate:")[1]?.trim() || "";
      networkInfo.txRate = parseFloat(txRate.split(" ")[0]);
    } else if (trimmedLine.includes("width:")) {
      const width = trimmedLine.split("width:")[1]?.trim() || "";
      networkInfo.channelWidth = parseInt(width.split(" ")[0]);
    }
  });

  const infoLines = infoOutput.split("\n");
  infoLines.forEach((line) => {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith("channel")) {
      const channelMatch = trimmedLine.match(
        /channel\s+(\d+)\s+\((\d+)\s*MHz\),\s*width:\s*(\d+)\s*MHz/,
      );
      if (channelMatch) {
        networkInfo.channel = parseInt(channelMatch[1]);
        // Update frequency band if not already set from linkOutput
        if (!networkInfo.band) {
          const freqMhz = parseInt(channelMatch[2]);
          networkInfo.band = Math.round((freqMhz / 1000) * 100) / 100;
        }
        networkInfo.channelWidth = parseInt(channelMatch[3]);
      }
    }
  });
  if (
    !isValidMacAddress(networkInfo.bssid) ||
    !hasSignal ||
    networkInfo.channel <= 0
  ) {
    throw new Error("Incomplete Wi-Fi link information. Try measuring again.");
  }
  // Always set signalStrength, too
  networkInfo.signalStrength = rssiToPercentage(networkInfo.rssi);

  return networkInfo;
}

/**
 * splitColonDelimited() - split a colon-delimited string
 * @param line - read from nmcli -t command (":" delimited)
 * @returns array of columns
 */
export function splitColonDelimited(line: string) {
  const result = [];
  let current = "";
  let i = 0;

  const str = line.trim();
  if (str.length == 0) return [];
  str.concat(":");
  while (i < str.length) {
    if (str[i] === "\\" && i + 1 < str.length) {
      // Handle escaped characters
      current += str[i + 1]; // Add the escaped character
      i += 2; // Skip both the backslash and the escaped character
    } else if (str[i] === ":") {
      // Unescaped colon - end of field
      result.push(current);
      current = "";
      i++;
    } else {
      // Regular character
      current += str[i];
      i++;
    }
  }

  // Add the last field
  result.push(current);

  return result;
}

/**
 * getCandidates(nmcliData) - pluck up the local SSIDs from nmcli output
 * @param - Object that contains output of system_profiler for Wifi
 * @returns WifiResults[] sorted by signalStrength
 */
export const getCandidateSSIDs = (nmcliData: string): WifiResults[] => {
  const candidates = [];
  const lines = nmcliData.split("\n");
  for (const line of lines) {
    if (line.startsWith("//")) continue;
    const cols = splitColonDelimited(line);
    if (cols.length == 0) continue;

    // now do something with the columns
    const candidate = getDefaultWifiResults();
    candidate.currentSSID = cols[0] == "*";
    candidate.bssid = cols[1];
    candidate.ssid = cols[2];
    candidate.channel = parseInt(cols[4]);
    candidate.txRate = stripMbps(cols[5]);
    candidate.signalStrength = parseInt(cols[6]);
    candidate.rssi = percentageToRssi(candidate.signalStrength);
    candidate.band = channelToBand(candidate.channel);
    candidate.security = cols[8];
    // skip phymode, channelWidth

    candidates.push(candidate);
  }
  // eliminate any RSSI=0 (no reading), then sort by RSSI
  const nonZeroCandidates = candidates.filter((item) => item.rssi != 0);
  // eliminate any SSIDs to be ignored
  // const nonIgnoredCandidates = nonZeroCandidates.filter(
  //   (item) => !ignoredSSIDs.includes(item.ssid),
  // );
  // sort the remainder by signal strength
  const sortedCandidates = nonZeroCandidates.sort(bySignalStrength);
  return sortedCandidates;
};

/**
 * stripMbps() - retain the number at head of a string
 * @param string - "123 Mbits/s"
 * @result numeric 123
 */
function stripMbps(str: string): number {
  const strs = str.split(" ");
  return parseInt(strs[0]);
}

/**
 * frequencyToChannel(freq)
 * @param frequency (as number)
 * @returns channel (number)
 */
export function frequencyToChannel(freqMHz: number): number | null {
  // 2.4 GHz band
  if (freqMHz >= 2412 && freqMHz <= 2472) {
    return (freqMHz - 2407) / 5; // 1–13
  }
  if (freqMHz === 2484) {
    return 14;
  }

  // 5 GHz band
  if (freqMHz >= 5180 && freqMHz <= 5895) {
    return (freqMHz - 5000) / 5; // 36–177+
  }

  // 6 GHz band (Wi-Fi 6E, 5955–7115 MHz)
  if (freqMHz >= 5955 && freqMHz <= 7115) {
    return (freqMHz - 5950) / 5; // 1–233
  }

  return null;
}
