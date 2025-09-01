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
    const nodeVersion = process.version;

    logger.info("=== System Information ===");
    logger.info(`wifi-heatmapper: ${data.version}`);
    logger.info(`Node version: ${nodeVersion}`);
    if (platform == "darwin") {
      logger.info(`OS: ${getMacOSNameAndVersion()}`);
    } else {
      logger.info(`OS: ${platform} ${release}`);
    }
    logger.info(`OS Details: ${version}`);

    try {
      const { stdout } = await execAsync("iperf3 --version");
      logger.info(`iperf3 version: ${stdout.trim()}`);
    } catch (error) {
      logger.warn("Could not determine iperf3 version:", error);
    }
    logger.info("");
    logger.info("=== End System Information ===");
    logger.info("");
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

import { execFileSync } from "node:child_process";

const NAME_FOR_MAJOR: Record<number, string> = {
  11: "Big Sur",
  12: "Monterey",
  13: "Ventura",
  14: "Sonoma",
  15: "Sequoia",
};

const NAME_FOR_10: Record<number, string> = {
  0: "Cheetah",
  1: "Puma",
  2: "Jaguar",
  3: "Panther",
  4: "Tiger",
  5: "Leopard",
  6: "Snow Leopard",
  7: "Lion",
  8: "Mountain Lion",
  9: "Mavericks",
  10: "Yosemite",
  11: "El Capitan",
  12: "Sierra",
  13: "High Sierra",
  14: "Mojave",
  15: "Catalina",
  16: "Big Sur", // some early 11.0 reported as 10.16
};

/**
 * getMacOSNameAndVersion() - Return a string with OS name and version
 * example: // console.log(getMacOSNameAndVersion()); // "Sequoia 15.5"
 * @returns string
 */
export function getMacOSNameAndVersion(): string | null {
  if (process.platform !== "darwin") return null;

  let version = "";
  try {
    version = execFileSync("sw_vers", ["-productVersion"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }

  const [majS, minS] = version.split(".");
  const major = Number(majS);
  const minor = Number(minS ?? "0");

  let name = "macOS";
  if (major === 10) name = NAME_FOR_10[minor] ?? "Mac OS X";
  else if (major >= 11) name = NAME_FOR_MAJOR[major] ?? "macOS";

  return `${name} ${version}`;
}
