import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { getDefaults } from "./utils";

export interface SurveyPoint {
  x: number;
  y: number;
  wifiData: WifiNetwork;
  iperfResults: IperfResults;
  timestamp: string;
  id: string;
}

export interface WifiNetwork {
  ssid: string;
  bssid: string;
  rssi: number;
  channel: number;
  security: string;
  txRate: number;
  phyMode: string;
  channelWidth: number;
  frequency: number;
}

export interface IperfResults {
  tcpDownload: IperfTest;
  tcpUpload: IperfTest;
  udpDownload: IperfTest;
  udpUpload: IperfTest;
}

export type TestType = keyof IperfResults;

export interface IperfTest {
  bitsPerSecond: number;
  retransmits?: number;
  jitterMs?: number;
  lostPackets?: number;
  packetsReceived?: number;
}

export interface ApMapping {
  apName: string;
  macAddress: string;
}

export interface Database {
  surveyPoints: SurveyPoint[];
  floorplanImage: string;
  iperfServer: string;
  testDuration: number;
  apMapping: ApMapping[];
}

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
