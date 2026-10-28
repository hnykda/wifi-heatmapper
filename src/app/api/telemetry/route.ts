/**
 * GET   /api/telemetry - usage counts on this computer: on or off and why,
 *                        the last event sent, a sample event (exactly what
 *                        is sent, the install id replaced by a placeholder).
 * PATCH /api/telemetry - { enabled: boolean }
 *
 * See lib/telemetry.ts and docs/guide/privacy.md.
 */
import { NextRequest, NextResponse } from "next/server";
import { readBody } from "@/lib/api-helpers";
import { usageCountsPatchSchema } from "@/lib/schema";
import { setEnabled, usageCountsInfo } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await usageCountsInfo());
}

export async function PATCH(request: NextRequest) {
  const body = await readBody(request, usageCountsPatchSchema);
  if (!body.ok) return body.response;
  await setEnabled(body.data.enabled);
  return NextResponse.json(await usageCountsInfo());
}
