// lib/initServer.ts
import { copyToMediaFolder } from "../lib/actions";
import { getLogger } from "./logger";
import os from "os";
import { promises as fs } from "fs";

import { execAsync } from "./server-utils";
import { initLocalization } from "./localization";

const loadJson = async (filePath: string) => {
  const contents = await fs.readFile(filePath, "utf-8");
  return JSON.parse(contents);
};

const logger = getLogger("initServer");

async function logSystemInfo(): Promise<void> {
  try {
    const platform = os.platform();
    const release = os.release();
    const version = os.version();
    const data = await loadJson("./package.json");

    logger.info("=== System Information ===");
    logger.info(`wifi-heatmapper: ${data.version}`);
    logger.info(`OS: ${platform}`);
    logger.info(`OS Version: ${release}`);
    logger.info(`OS Details: ${version}`);

    try {
      const { stdout } = await execAsync("iperf3 --version");
      logger.info(`iperf3 version: ${stdout.trim()}`);
    } catch (error) {
      logger.warn("Could not determine iperf3 version:", error);
    }

    logger.info("=========================");
  } catch (error) {
    logger.error("Error collecting system information:", error);
  }
}

/**
 * initServer() - a grab-bag of stuff to initialize on the server
 * - Logging system information
 * - Copying the default background image to /media/ folder
 */
export async function initServer() {
  // one-time setup (e.g., DB pool, metrics, cache)
  // logger.info("Initializing server...");

  let initialized = false;

  if (!initialized) {
    // Run system info logging at module load time
    logSystemInfo().catch((error) => {
      logger.error("Failed to log system information:", error);
    });

    copyToMediaFolder("EmptyFloorPlan.png"); // seed with empty image
    await initLocalization(); // load up the localization files

    initialized = true;
    // logger.info(`Server initialization complete.`);
  }
}
