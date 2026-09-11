/**
 * server-init.ts - one-time server start-up.
 * Called from src/instrumentation.ts when the Next.js server boots
 * (both `next dev` and `next start`).
 */
import os from "os";
import { promises as fs } from "fs";
import path from "path";
import { getLogger } from "./logger";
import { initLocalization } from "./localization";
import { getAppStatus } from "./app-info";
import {
  getBundledFloorplansDir,
  getLegacyMediaDir,
  getMediaDir,
  getSurveysDir,
  isImageFileName,
} from "./server-paths";

const logger = getLogger("initServer");

async function logSystemInfo(): Promise<void> {
  const status = await getAppStatus();
  logger.info("=== System Information ===");
  logger.info(`wifi-heatmapper: ${status.version}`);
  logger.info(`Node version: ${status.nodeVersion}`);
  logger.info(`OS: ${status.osName}`);
  logger.info(
    `OS Details: ${os.version()} (${status.platform} ${status.osRelease})`,
  );
  if (status.docker) logger.info("Running in a Docker container");
  if (status.mockMode) {
    logger.info("MOCK MODE: Wi-Fi and iperf3 results are synthetic");
  }
  logger.info(
    status.iperf3Version
      ? `iperf3 version: ${status.iperf3Version}`
      : "Could not determine iperf3 version: is it installed?",
  );
  logger.info(`Data directory: ${status.dataDir}`);
  logger.info("=== End System Information ===");
}

/**
 * copyMissing() - copy every image from `from` into `to` unless a file with
 * the same name already exists there. Returns the number copied.
 */
async function copyMissing(from: string, to: string): Promise<number> {
  let names: string[];
  try {
    names = await fs.readdir(from);
  } catch {
    return 0; // source dir doesn't exist
  }
  let copied = 0;
  for (const name of names.filter(isImageFileName)) {
    const dest = path.join(to, name);
    try {
      await fs.access(dest);
    } catch {
      await fs.copyFile(path.join(from, name), dest);
      copied++;
    }
  }
  return copied;
}

let initPromise: Promise<void> | null = null;

/**
 * initServer() - idempotent start-up work:
 * - log system information
 * - create the data directories
 * - seed the bundled floor plans
 * - migrate floor plans uploaded by versions < 0.5.0 (public/media)
 * - load Windows localization tables
 */
export function initServer(): Promise<void> {
  if (!initPromise) initPromise = doInit();
  return initPromise;
}

async function doInit(): Promise<void> {
  try {
    await logSystemInfo();

    const mediaDir = getMediaDir();
    await fs.mkdir(mediaDir, { recursive: true });
    await fs.mkdir(getSurveysDir(), { recursive: true });

    await copyMissing(getBundledFloorplansDir(), mediaDir);
    const migrated = await copyMissing(getLegacyMediaDir(), mediaDir);
    if (migrated > 0) {
      logger.info(
        `Migrated ${migrated} floor plan(s) from public/media to ${mediaDir}`,
      );
    }

    // only load the localization tables when running on Windows
    if (os.platform() == "win32") {
      await initLocalization();
    }
  } catch (error) {
    logger.error("Server initialization failed:", error);
  }
}
