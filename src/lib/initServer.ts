// lib/initServer.ts
import { copyToMediaFolder } from "../lib/actions";

console.log("✅ Server-side init logic ran");

let initialized = false;

export async function initServer() {
  if (!initialized) {
    copyToMediaFolder("EmptyFloorPlan.png"); // seed with empty image

    // one-time setup (e.g., DB pool, metrics, cache)
    console.log("🔧 Initializing server...");
    initialized = true;
  }
}
