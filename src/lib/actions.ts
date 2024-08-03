"use server";
import path from "path";
import fs from "fs/promises";
import { nanoid } from "nanoid";

import { scanWifi } from "./wifiScanner";
import { runIperfTest } from "./iperfRunner";
import {
  readDatabase,
  addSurveyPoint,
  updateDatabaseField,
  SurveyPoint,
  Database,
} from "./database";

export async function startSurvey(
  dbPath: string,
  x: number,
  y: number,
  testConfig: {
    testDuration: number;
    sudoerPassword: string;
  }
): Promise<SurveyPoint> {
  const db = await readDatabase(dbPath);
  const iperfServer = db.iperfServer;

  const wifiData = await scanWifi(testConfig.sudoerPassword);

  const iperfResults = await runIperfTest(iperfServer, testConfig.testDuration);

  const newPoint: SurveyPoint = {
    x,
    y,
    wifiData,
    iperfResults,
    timestamp: new Date().toISOString(),
    id: nanoid(3),
  };

  await addSurveyPoint(dbPath, newPoint);

  return newPoint;
}

export async function getSurveyData(dbPath: string): Promise<Database> {
  return await readDatabase(dbPath);
}

export async function updateIperfServer(
  dbPath: string,
  server: string
): Promise<void> {
  await updateDatabaseField(dbPath, "iperfServer", server);
}

export async function updateFloorplanImage(
  dbPath: string,
  imagePath: string
): Promise<void> {
  await updateDatabaseField(dbPath, "floorplanImage", imagePath);
}

export async function updateDbField(
  dbPath: string,
  fieldName: keyof Database,
  value: Database[keyof Database]
): Promise<void> {
  return await updateDatabaseField(dbPath, fieldName, value);
}

export const uploadImage = async (dbPath: string, formData: FormData) => {
  const file = formData.get("file") as File;
  const fileName = file.name;
  const uploadDir = path.join(process.cwd(), "public", "media");
  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(
    path.join(uploadDir, fileName),
    Buffer.from(await file.arrayBuffer())
  );
};
