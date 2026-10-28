/**
 * GET /api/diagnostics - the bug report: app version, OS, how the app runs,
 * how Wi-Fi is read, iperf3, the last measurement and the recent server log.
 *
 *   ?survey=<floor plan>  the survey open in the app (signal only, or signal and speed)
 *   ?problem=<text>       the error the app showed
 *   ?network=include      keep network names, MAC and IP addresses
 *                         (hidden by default)
 *
 * The sudo password is always removed. Nothing is sent anywhere: the app
 * shows the report and the person decides to share it.
 */
import { NextRequest, NextResponse } from "next/server";
import { collectDiagnostics } from "@/lib/diagnostics-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const report = await collectDiagnostics({
    survey: params.get("survey"),
    problem: params.get("problem"),
    hideNetwork: params.get("network") !== "include",
  });
  return NextResponse.json(report);
}
