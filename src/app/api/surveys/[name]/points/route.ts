/**
 * /api/surveys/[name]/points - the points of one survey
 *
 * POST   -> add a point (body: a point; the server assigns its id,
 *           Point_N from nextPointNum); returns the survey
 * DELETE -> remove points (body: { ids: string[] }; unknown ids are
 *           ignored); returns the survey
 *
 * PATCH /api/surveys/[name]/points/[id] changes one point.
 * A survey that doesn't exist yet is created with the defaults.
 */
import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/survey-store";
import { addPointSchema, deletePointsSchema } from "@/lib/schema";
import { addPoint, deletePoints } from "@/lib/survey-ops";
import { readBody, storeErrorResponse } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ name: string }> };

export async function POST(request: NextRequest, { params }: Context) {
  const { name } = await params;
  const body = await readBody(request, addPointSchema);
  if (!body.ok) return body.response;
  try {
    const survey = await store.mutate(name, (s) => addPoint(s, body.data));
    return NextResponse.json(survey);
  } catch (err) {
    return storeErrorResponse(err, "Unable to add the point");
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const { name } = await params;
  const body = await readBody(request, deletePointsSchema);
  if (!body.ok) return body.response;
  try {
    const survey = await store.mutate(name, (s) =>
      deletePoints(s, body.data.ids),
    );
    return NextResponse.json(survey);
  } catch (err) {
    return storeErrorResponse(err, "Unable to delete the points");
  }
}
