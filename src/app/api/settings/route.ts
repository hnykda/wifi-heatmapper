/**
 * /api/settings - survey files, stored in <data dir>/surveys
 *
 * GET    /api/settings?list=true        -> { surveys: string[] }
 * GET    /api/settings?name=<floorplan> -> the survey for that floor plan
 * PATCH  /api/settings?name=<floorplan> -> change settings (body: SettingsPatch,
 *                                          see schema.ts); creates the survey
 *                                          if there is none; returns it
 * POST   /api/settings                  -> replace a whole survey (body: a
 *                                          survey with floorplanImageName);
 *                                          kept for older clients and imports
 * DELETE /api/settings?name=<floorplan> -> remove the survey file
 *
 * Points have their own routes: /api/surveys/[name]/points.
 * All writes go through survey-store.ts (one at a time per file, meta
 * stamped, the sudo password never written).
 */
import { NextRequest } from "next/server";
import * as store from "@/lib/survey-store";
import { settingsPatchSchema, surveyImportSchema } from "@/lib/schema";
import { applySettingsPatch } from "@/lib/survey-ops";
import { jsonError, readBody, storeErrorResponse } from "@/lib/api-helpers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function nameParam(request: NextRequest) {
  return request.nextUrl.searchParams.get("name");
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("list") === "true") {
    try {
      return NextResponse.json({ surveys: await store.list() });
    } catch (err) {
      return jsonError(500, `Unable to list surveys: ${err}`);
    }
  }
  const name = nameParam(request);
  if (!name) return jsonError(400, "Missing 'name' query parameter");
  try {
    const survey = await store.read(name);
    if (!survey) return jsonError(404, "Survey not found");
    return NextResponse.json(survey);
  } catch (err) {
    return storeErrorResponse(err, "Unable to read survey");
  }
}

export async function PATCH(request: NextRequest) {
  const name = nameParam(request);
  if (!name) return jsonError(400, "Missing 'name' query parameter");
  const body = await readBody(request, settingsPatchSchema);
  if (!body.ok) return body.response;
  try {
    const survey = await store.mutate(name, (s) =>
      applySettingsPatch(s, body.data),
    );
    return NextResponse.json(survey);
  } catch (err) {
    return storeErrorResponse(err, "Unable to save survey");
  }
}

export async function POST(request: NextRequest) {
  const body = await readBody(request, surveyImportSchema);
  if (!body.ok) return body.response;
  try {
    const survey = await store.replace(body.data.floorplanImageName, body.data);
    return NextResponse.json({
      status: "success",
      path: store.surveyPath(survey.floorplanImageName),
    });
  } catch (err) {
    return storeErrorResponse(err, "Unable to save survey");
  }
}

export async function DELETE(request: NextRequest) {
  const name = nameParam(request);
  if (!name) return jsonError(400, "Missing 'name' query parameter");
  try {
    await store.remove(name);
    return NextResponse.json({ status: "deleted" });
  } catch (err) {
    return jsonError(500, `Unable to delete survey: ${err}`);
  }
}
