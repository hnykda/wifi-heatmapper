/**
 * start-task API call - triggered by POST to /api/start-task
 */
import { NextRequest, NextResponse } from "next/server";
// import { startTask, cancelTask } from "../../../lib/actions";
import { setCancelFlag } from "@/lib/server-globals";

export async function POST(req: NextRequest) {
  // Get the `action` parameter - /api/start-task?action=start`
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  // action=start IS CURRENTLY NOT USED

  if (action === "start") {
    // startTask();
    return NextResponse.json({ message: "Task started" });
  } else if (action === "stop") {
    // cancelTask();
    setCancelFlag(true); // in sseGlobal.ts
    return NextResponse.json({ message: "Task stopped" });
  }
  console.log(`Action received: ${action}`);

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
