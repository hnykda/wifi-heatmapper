/**
 * Server-Side Actions
 */

"use server";
import path from "path";
import fs from "fs/promises";
// import { promises as fs } from 'fs';
// import path from 'path';

// import { nanoid } from "nanoid";

// import { runIperfTest } from "./iperfRunner";
// import { SurveyPoint, HeatmapSettings } from "./types";
// import { execAsync } from "./server-utils";
import { getLogger } from "./logger";

const logger = getLogger("actions");
// import { sendSSEMessage } from "@/app/api/events/route";
// import { sendSSEMessage } from "./sseGlobal";

// export async function startSurvey(
//   x: number,
//   y: number,
//   settings: HeatmapSettings,
// ): Promise<SurveyPoint | null> {
//   const { iperfResults, wifiData } = await runIperfTest(settings);

//   if (!iperfResults || !wifiData) {
//     // null indicates measurement was canceled
//     return null;
//   }

//   const newPoint: SurveyPoint = {
//     x,
//     y,
//     wifiData,
//     iperfResults,
//     timestamp: new Date().toISOString(),
//     id: nanoid(3),
//     isEnabled: true,
//   };
//   // console.log("Created new point: " + JSON.stringify(newPoint));
//   // await addSurveyPoint(dbPath, newPoint);

//   return newPoint;
// }

// export async function updateIperfServer(
//   dbPath: string,
//   server: string,
// ): Promise<void> {
//   await updateDatabaseField(dbPath, "iperfServer", server);
// }

// export async function updateFloorplanImage(
//   dbPath: string,
//   imagePath: string,
// ): Promise<void> {
//   await updateDatabaseField(dbPath, "floorplanImage", imagePath);
// }

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

export async function copyToMediaFolder(filename: string) {
  const srcPath = path.join(process.cwd(), "public", filename);
  const destPath = path.join(process.cwd(), "public", "media", filename);

  // Ensure media directory exists
  await fs.mkdir(path.dirname(destPath), { recursive: true });

  // Copy file (will overwrite if it exists)
  await fs.copyFile(srcPath, destPath);
  console.log(`Copied ${filename} to /public/media`);
}

// Simulate a long-running process with server-sent events
// THIS IS A FAKE FUNCTION - ONLY USED FOR TESTING

// let isCanceled = false;

// export async function startTask() {
//   isCanceled = false;

//   console.log("Sending Step 1");
//   sendSSEMessage({
//     type: "update",
//     status: "RSSI:\nSpeed test:",
//     header: "BOO!",
//   });
//   await delay(3000);
//   if (isCanceled)
//     return sendSSEMessage({
//       type: "done",
//       status: "Task Canceled ❌",
//       header: "BOO!",
//     });

//   console.log("Sending Step 2");
//   sendSSEMessage({
//     type: "update",
//     status: "RSSI: -72\nSpeed test:",
//     header: "BOO!",
//   });
//   await delay(3000);
//   if (isCanceled)
//     return sendSSEMessage({
//       type: "done",
//       status: "Task Canceled ❌",
//       header: "BOO!",
//     });

//   console.log("Sending Step 3");
//   sendSSEMessage({
//     type: "update",
//     status: "RSSI: -72\nSpeed test: ...",
//     header: "BOO!",
//   });
//   await delay(3000);
//   if (isCanceled)
//     return sendSSEMessage({
//       type: "done",
//       status: "Task Canceled ❌",
//       header: "BOO!",
//     });

//   console.log("Sending Done!");
//   sendSSEMessage({
//     type: "done",
//     status: "RSSI: -72\nSpeed test:100/100",
//     header: "BOO!",
//   });
// }

// // Cancel the running task
// export async function cancelTask() {
//   console.log(`Received cancelTask`);
//   sendSSEMessage({ status: "Task Canceled ❌", type: "error", header: "BOO!" });
//   isCanceled = true;
// }

// // Helper function for delays
// export async function delay(ms: number) {
//   return new Promise((resolve) => setTimeout(resolve, ms));
// }
