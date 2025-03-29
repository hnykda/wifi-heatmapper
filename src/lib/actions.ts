/**
 * Server-Side Actions
 */

"use server";
import path from "path";
import fs from "fs/promises";

import { getLogger } from "./logger";

const logger = getLogger("actions");

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

// THIS IS A FAKE FUNCTION - ONLY USED FOR TESTING NewToast

// Simulate a long-running process with server-sent events

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
