"use server";
import os from "os";
import { WifiActions, WifiScanResults, WifiResults } from "./types";
import { execAsync, runDetached, delay } from "./server-utils";
import { getLogger } from "./logger";
import { MacOSWifiActions } from "./wifiScanner-macos";
import { WindowsWifiActions } from "./wifiScanner-windows";
import { LinuxWifiActions } from "./wifiScanner-linux";
/**
 * wifiScanner.ts is a factory module that returns the proper set of
 * functions for the underlying OS
 */

const logger = getLogger("wifiScanner");

export async function createWifiActions(): Promise<WifiActions> {
  const platform = os.platform();
  switch (platform) {
    case "darwin":
      return new MacOSWifiActions();
    case "win32":
      return new WindowsWifiActions();
    case "linux":
      return new LinuxWifiActions();
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * loopUntilCondition - execute the command every `interval` msec
 *    and exit when the command's return code matches the condition
 * @param cmd - command to be executed
 * @param testCmd - command to determine if it has completed
 * @param condition
 *   - 0 means "loop until success" (noErr returned)
 *   - 1 means "loop until failure" (error condition returned)
 * @param timeout - number of seconds
 *
 * Example usage:
 * - issue the cmd to start an action (say, bring up the wifi)
 * - continually execute testCmd and wait for its success or failure
 *   to indicate that it has succeeded (or times out)
 */
export async function loopUntilCondition(
  cmd: string,
  testCmd: string,
  condition: number, // 0 = loop until no error; 1 = loop until error
  timeout: number, // seconds
) {
  // logger.info(`loopUntilCondition: ${cmd} ${testcmd} ${condition} ${timeout}`);

  const interval = 200; // msec
  const count = (timeout * 1000) / interval;
  let i;

  runDetached(cmd); // issue the specified command "detached"

  // Start to loop on testcmd until the desired condition
  for (i = 0; i < count; i++) {
    // let exit = "";
    let outcome;
    try {
      await execAsync(`${testCmd}`); // run the testcmd
      // const resp = await execAsync(`${testcmd}`); // run the testcmd
      // exit = resp.stdout;
      // console.log(`${testcmd} is OK: ${i} ${Date.now()} "${exit}"`);
      outcome = 0; // no error
    } catch {
      // } catch (error) {
      // console.log(`${testcmd} gives error: ${i} ${Date.now()} "${error}"`);
      outcome = 1; // some kind of error that caused the catch()
    }
    if (outcome == condition) break; // we got the result we were looking for
    await delay(interval);
  }
  if (i == count) {
    logger.info(`loopUntilCondition timed out: ${cmd} ${condition} ${timeout}`);
  }
}

export async function logWifiResults(results: WifiScanResults): Promise<void> {
  logger.info(`===== WifiResults =====`);
  results.SSIDs.forEach(logWifiResult);
  // logger.info(`==============`);
}

export async function logWifiResult(result: WifiResults) {
  logger.info(
    `active: signalStrength: ${result.signalStrength}; channel: ${result.channel}; ssid: ${result.ssid}`,
  );
}
