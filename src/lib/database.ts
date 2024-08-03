import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { getDefaults } from "./utils";
import { Database, SurveyPoint } from "./types";

export async function readDatabase(dbPath: string): Promise<Database> {
  // check if the file exists
  if (!fsSync.existsSync(dbPath)) {
    console.warn("Database file does not exist, creating...");
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    await fs.writeFile(dbPath, JSON.stringify(getDefaults()));
    return getDefaults();
  }

  const data = await fs.readFile(dbPath, "utf-8");
  return JSON.parse(data);
}

export async function writeDatabase(
  dbPath: string,
  data: Database,
): Promise<void> {
  try {
    await fs.writeFile(dbPath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error writing database:", error);
  }
}

export async function addSurveyPoint(
  dbPath: string,
  point: SurveyPoint,
): Promise<void> {
  const db = await readDatabase(dbPath);
  db.surveyPoints.push(point);
  await writeDatabase(dbPath, db);
}

export async function updateDatabaseField<K extends keyof Database>(
  dbPath: string,
  field: K,
  value: Database[K],
): Promise<void> {
  const db = await readDatabase(dbPath);
  db[field] = value;
  await writeDatabase(dbPath, db);
}
