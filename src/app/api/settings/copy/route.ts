/**
 * POST /api/settings/copy?from=<floorplan>&to=<floorplan>&parts=speed,apNames,heatmapLook
 *
 * Copy settings from one survey to another and return the updated target
 * survey (as PATCH /api/settings does). parts (COPY_PARTS in survey-ops.ts):
 *   speed       - what to measure, the iperf3 server, test duration, commands
 *   apNames     - access point names
 *   heatmapLook - heat spot radius, opacity, blur, colours, fixed colour scales
 * Points, the floor plan, its size and the sudo password are never copied.
 * 404 if the source has no survey; the target is created if it has none.
 */
import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/survey-store";
import { copySettingsQuerySchema } from "@/lib/schema";
import { readQuery, storeErrorResponse } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const query = readQuery(request, copySettingsQuerySchema);
  if (!query.ok) return query.response;
  const { from, to, parts } = query.data;
  try {
    return NextResponse.json(await store.copyFrom(from, to, parts));
  } catch (err) {
    return storeErrorResponse(err, "Unable to copy settings");
  }
}
