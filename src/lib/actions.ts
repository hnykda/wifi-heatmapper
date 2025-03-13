"use server";
import path from "path";
import fs from "fs/promises";
import { nanoid } from "nanoid";

import { runIperfTest } from "./iperfRunner";
import { updateDatabaseField, writeDatabase } from "./database";
import { SurveyPoint, OS, HeatmapSettings } from "./types";
import { execAsync } from "./server-utils";
import { getLogger } from "./logger";

const logger = getLogger("actions");

export async function startSurvey(
  x: number,
  y: number,
  settings: HeatmapSettings,
): Promise<SurveyPoint> {
  // const db = await readDatabase(dbPath);
  // const iperfServer = testConfig.iperfServerAdrs;

  const { iperfResults, wifiData } = await runIperfTest(settings);
  // iperfServer,
  // testConfig.testDuration,
  // {
  //   sudoerPassword: testConfig.sudoerPassword,
  //   wlanInterfaceId: testConfig.wlanInterfaceId,
  // },
  // }

  const newPoint: SurveyPoint = {
    x,
    y,
    wifiData,
    iperfResults,
    timestamp: new Date().toISOString(),
    id: nanoid(3),
    isEnabled: true,
  };
  // console.log("Created new point: " + JSON.stringify(newPoint));
  // await addSurveyPoint(dbPath, newPoint);

  return newPoint;
}

// export async function getSurveyData(dbPath: string): Promise<Database> {
//   return await readDatabase(dbPath);
// }

export async function updateIperfServer(
  dbPath: string,
  server: string,
): Promise<void> {
  await updateDatabaseField(dbPath, "iperfServer", server);
}

export async function updateFloorplanImage(
  dbPath: string,
  imagePath: string,
): Promise<void> {
  await updateDatabaseField(dbPath, "floorplanImage", imagePath);
}

export async function updateDbField(
  dbPath: string,
  fieldName: keyof Database,
  value: Database[keyof Database],
): Promise<void> {
  return await updateDatabaseField(dbPath, fieldName, value);
}

export async function writeSurveyData(
  dbPath: string,
  data: Database,
): Promise<void> {
  logger.info("Writing survey data to database");
  await writeDatabase(dbPath, data);
}

export const uploadImage = async (dbPath: string, formData: FormData) => {
  const file = formData.get("file") as File;
  const fileName = file.name;
  const uploadDir = path.join(process.cwd(), "public", "media");
  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(
    path.join(uploadDir, fileName),
    Buffer.from(await file.arrayBuffer()),
  );
};

export async function getPlatform(): Promise<OS> {
  return process.platform === "darwin"
    ? "macos"
    : process.platform === "win32"
      ? "windows"
      : "linux";
}

export async function inferWifiDeviceIdOnLinux(): Promise<string> {
  logger.debug("Inferring WLAN interface ID on Linux");
  const { stdout } = await execAsync(
    "iw dev | awk '$1==\"Interface\"{print $2}' | head -n1",
  );
  return stdout.trim();
}

type RGB = { r: number; g: number; b: number; a: number };
type Gradient = Record<number, string>; // Maps 0-1 values to colors

/**
 * Converts a CSS color (hex, named, rgba, etc.) to an {r, g, b, a} object.
 */
function colorToRgba(color: string): RGB {
  const ctx = document.createElement("canvas").getContext("2d")!;
  ctx.fillStyle = color;
  const computedColor = ctx.fillStyle; // Convert to standardized format
  ctx.fillStyle = computedColor;

  // Extract color values from rgba() format
  const match = ctx.fillStyle.match(/\d+(\.\d+)?/g);
  if (!match) throw new Error(`Invalid color: ${color}`);

  const [r, g, b, a = "1"] = match.map(Number);
  return { r, g, b, a: parseFloat(a) };
}

/**
 * Interpolates between two RGBA colors.
 */
function interpolateColor(color1: RGB, color2: RGB, factor: number): RGB {
  return {
    r: Math.round(color1.r + (color2.r - color1.r) * factor),
    g: Math.round(color1.g + (color2.g - color1.g) * factor),
    b: Math.round(color1.b + (color2.b - color1.b) * factor),
    a: color1.a + (color2.a - color1.a) * factor,
  };
}

/**
 * Returns the interpolated RGBA color for a given value (0-1) from a gradient.
 */
export function getColorAt(value: number, gradient: Gradient): string {
  const keys = Object.keys(gradient)
    .map(Number)
    .sort((a, b) => a - b);

  for (let i = 0; i < keys.length - 1; i++) {
    const lower = keys[i];
    const upper = keys[i + 1];

    if (value >= lower && value <= upper) {
      const factor = (value - lower) / (upper - lower);
      const color1 = colorToRgba(gradient[lower]);
      const color2 = colorToRgba(gradient[upper]);

      const interpolated = interpolateColor(color1, color2, factor);
      return `rgba(${interpolated.r}, ${interpolated.g}, ${interpolated.b}, ${interpolated.a.toFixed(2)})`;
    }
  }

  // Return the last gradient color if out of bounds
  const lastColor = colorToRgba(gradient[keys[keys.length - 1]]);
  return `rgba(${lastColor.r}, ${lastColor.g}, ${lastColor.b}, ${lastColor.a.toFixed(2)})`;
}
