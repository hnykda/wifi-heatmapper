/**
 * GET   /api/telemetry - usage counts on this computer: on or off and why,
 *                        the last event sent, a sample event (exactly what
 *                        is sent, the install id replaced by a placeholder)
 *                        and whether to show the first-run notice.
 * PATCH /api/telemetry - { enabled?: boolean, noticeDismissed?: true }
 *
 * See lib/telemetry.ts and docs/guide/privacy.md.
 */
import { NextRequest, NextResponse } from "next/server";
import { readBody } from "@/lib/api-helpers";
import { usageCountsPatchSchema } from "@/lib/schema";
import { dismissNotice, setEnabled, usageCountsInfo } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await usageCountsInfo());
}

export async function PATCH(request: NextRequest) {
  const body = await readBody(request, usageCountsPatchSchema);
  if (!body.ok) return body.response;
  if (body.data.enabled !== undefined) await setEnabled(body.data.enabled);
  if (body.data.noticeDismissed) await dismissNotice();
  return NextResponse.json(await usageCountsInfo());
}
