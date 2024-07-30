import fs from "fs/promises";
import path from "path";

export interface SurveyPoint {
  x: number;
  y: number;
  wifiData: WifiNetwork;
  iperfResults: IperfResults;
  timestamp: string;
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

export interface Database {
  surveyPoints: SurveyPoint[];
  floorplanImage: string;
  iperfServer: string;
  testDuration: number;
  apMapping: { apName: string; macAddress: string }[];
}

export async function readDatabase(dbPath: string): Promise<Database> {
  try {
    const data = await fs.readFile(dbPath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading database:", error);
    return {
      surveyPoints: [],
      floorplanImage: "",
      iperfServer: "",
      apMapping: [],
      testDuration: 10,
    };
  }
}

export async function writeDatabase(
  dbPath: string,
  data: Database
): Promise<void> {
  try {
    await fs.writeFile(dbPath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error writing database:", error);
  }
}

export async function addSurveyPoint(
  dbPath: string,
  point: SurveyPoint
): Promise<void> {
  console.debug("Adding survey point", point);
  const db = await readDatabase(dbPath);
  db.surveyPoints.push(point);
  await writeDatabase(dbPath, db);
}

export async function updateDatabaseField<K extends keyof Database>(
  dbPath: string,
  field: K,
  value: Database[K]
): Promise<void> {
  console.debug("Writing to database", field, value);
  const db = await readDatabase(dbPath);
  db[field] = value;
  await writeDatabase(dbPath, db);
}
