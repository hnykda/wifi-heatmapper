"use server";
import path from "path";
import fs from "fs/promises";
import { nanoid } from "nanoid";

import { runIperfTest } from "./iperfRunner";
import { updateDatabaseField, writeDatabase } from "./database";
import { SurveyPoint, OS, HeatmapSettings } from "./types";
import { execAsync } from "./server-utils";
import { updateSettings } from "@/components/GlobalSettings";

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
    isDisabled: false,
  };
  console.log("Created new point: " + JSON.stringify(newPoint));
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
  console.log("Writing survey data to database");
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
  console.debug("Inferring WLAN interface ID on Linux");
  const { stdout } = await execAsync(
    "iw dev | awk '$1==\"Interface\"{print $2}' | head -n1",
  );
  return stdout.trim();
}

// NOT USED HERE - Bundle them into the component (couldn't figure out how to pass
// these functions to the child components)
// (No way to call updateSettings()...)
/**
 * addPoint() - add a point to the surveyPoints
 * @param point
 * @returns
 */
const addPoint = (point: SurveyPoint) => {
  const newPoints = [...settings.surveyPoints, point];
  updateSettings({ surveyPoints: newPoints });
};

/**
 * deletePoint() - remove a point from the surveyPoints
 * @param point
 * @returns
 */
const deletePoint = (point: SurveyPoint) => {
  const newPoints = settings.surveyPoints.filter(
    (aPoint: SurveyPoint) => aPoint != point,
  );
  updateSettings({ surveyPoints: newPoints });
};
