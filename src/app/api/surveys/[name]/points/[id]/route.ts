/**
 * PATCH /api/surveys/[name]/points/[id] - change one point (body: any of
 * x, y, isEnabled, timestamp, wifiData, iperfData, label; not the id).
 * A label is trimmed, at most 60 characters; "" removes it. Returns the
 * survey; 404 if there is no such point.
 */
import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/survey-store";
import { pointPatchSchema } from "@/lib/schema";
import { updatePoint } from "@/lib/survey-ops";
import { readBody, storeErrorResponse } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ name: string; id: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  const { name, id } = await params;
  const body = await readBody(request, pointPatchSchema);
  if (!body.ok) return body.response;
  try {
    // throwing before anything is written: a missing survey stays missing
    const survey = await store.mutate(name, (s) => {
      const next = updatePoint(s, id, body.data);
      if (!next) throw new store.SurveyChangeError(`No point "${id}"`, 404);
      return next;
    });
    return NextResponse.json(survey);
  } catch (err) {
    return storeErrorResponse(err, "Unable to change the point");
  }
}
