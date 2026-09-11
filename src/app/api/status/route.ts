/**
 * GET /api/status - facts about the running server (version, OS, mock mode,
 * whether iperf3 is installed). Shown in the UI header and About dialog.
 */
import { NextResponse } from "next/server";
import { getAppStatus } from "@/lib/app-info";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getAppStatus());
}
