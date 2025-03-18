/**
 * start-task API call - triggered by POST to /api/start-task
 */
import { NextRequest, NextResponse } from "next/server";
import { startTask } from "../../../lib/actions";

export async function POST(req: NextRequest) {
  startTask();
  return NextResponse.json({ message: "Task started" });
}
