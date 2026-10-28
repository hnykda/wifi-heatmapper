/**
 * POST /api/speed-test  { server: "192.168.1.10:5201" }
 *   -> { iperf3: string | null, reachable: boolean, reason: string }
 *
 * The "Test connection" button in Settings: is iperf3 installed on this
 * computer, and does the speed test server answer? Runs the same checks a
 * measurement does (speed-test.ts), without measuring.
 */
import { NextRequest, NextResponse } from "next/server";
import { checkIperfServer } from "@/lib/iperf-server-check";
import { iperf3Version } from "@/lib/speed-test";
import { defaultIperfCommands } from "@/lib/iperfUtils";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const server = typeof body?.server === "string" ? body.server.trim() : "";
  const [iperf3, { reason }] = await Promise.all([
    iperf3Version(),
    checkIperfServer({
      iperfServerAdrs: server,
      measureSpeed: true,
      testDuration: 1,
      sudoerPassword: "",
      iperfCommands: defaultIperfCommands,
    }),
  ]);
  return NextResponse.json({ iperf3, reachable: reason === "", reason });
}
