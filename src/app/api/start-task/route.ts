/**
 * start-task API call - triggered by POST to /api/start-task
 */
import { NextRequest, NextResponse } from "next/server";
import { startTask, cancelTask } from "../../../lib/actions";

export async function POST(req: NextRequest) {
  // ✅ Get the `action` parameter from the URL (e.g., `/api/start-task?action=start`)
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  if (action === "start") {
    startTask();
    return NextResponse.json({ message: "Task started" });
  } else if (action === "stop") {
    cancelTask();
    return NextResponse.json({ message: "Task stopped" });
  }
  console.log(`Action received: ${action}`);

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
