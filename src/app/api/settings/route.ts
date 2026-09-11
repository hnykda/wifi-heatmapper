/**
 * /api/settings - survey files, stored in <data dir>/surveys
 *
 * GET    /api/settings?list=true       -> { surveys: string[] }
 * GET    /api/settings?name=<floorplan> -> the HeatmapSettings for that floor plan
 * POST   /api/settings                  -> write settings (body: HeatmapSettings)
 * DELETE /api/settings?name=<floorplan> -> remove the survey file
 *
 * The sudo password is never written to disk. The server stamps every
 * saved file with `meta` (app version, OS, timestamp).
 */
import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir, readdir, unlink } from "fs/promises";
import path from "path";
import { sanitizeFilename } from "@/lib/utils";
import { getSurveysDir } from "@/lib/server-paths";
import { APP_VERSION, describeOS } from "@/lib/app-info";
import os from "os";
import { SurveyFileMeta } from "@/lib/types";

export const dynamic = "force-dynamic";

const SURVEY_SCHEMA_VERSION = 1;

function getSurveyPath(floorplanName: string): string {
  return path.join(getSurveysDir(), `${sanitizeFilename(floorplanName)}.json`);
}

function isNotFound(err: unknown): boolean {
  return err instanceof Error && "code" in err && err.code === "ENOENT";
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const listAll = searchParams.get("list");
  const name = searchParams.get("name");

  if (listAll === "true") {
    try {
      const dir = getSurveysDir();
      await mkdir(dir, { recursive: true });
      const surveys = (await readdir(dir))
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.replace(/\.json$/, ""));
      return NextResponse.json({ surveys });
    } catch (err) {
      return NextResponse.json(
        { error: `Unable to list surveys: ${err}` },
        { status: 500 },
      );
    }
  }

  if (!name) {
    return NextResponse.json(
      { error: "Missing 'name' query parameter" },
      { status: 400 },
    );
  }

  try {
    const data = await readFile(getSurveyPath(name), "utf-8");
    return NextResponse.json(JSON.parse(data));
  } catch (err: unknown) {
    if (isNotFound(err)) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: `Unable to read survey: ${err}` },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const settings = await request.json();

    if (
      !settings ||
      typeof settings.floorplanImageName !== "string" ||
      settings.floorplanImageName === ""
    ) {
      return NextResponse.json(
        { error: "Missing floorplanImageName in settings" },
        { status: 400 },
      );
    }

    await mkdir(getSurveysDir(), { recursive: true });

    // Never persist the sudo password
    const { sudoerPassword: _, ...safeSettings } = settings;

    const meta: SurveyFileMeta = {
      schemaVersion: SURVEY_SCHEMA_VERSION,
      appVersion: APP_VERSION,
      platform: os.platform(),
      osName: describeOS(),
      savedAt: new Date().toISOString(),
    };

    const filePath = getSurveyPath(settings.floorplanImageName);
    await writeFile(
      filePath,
      JSON.stringify({ ...safeSettings, meta }, null, 2),
    );

    return NextResponse.json({ status: "success", path: filePath });
  } catch (err) {
    return NextResponse.json(
      { error: `Unable to save survey: ${err}` },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name");
  if (!name) {
    return NextResponse.json(
      { error: "Missing 'name' query parameter" },
      { status: 400 },
    );
  }
  try {
    await unlink(getSurveyPath(name));
    return NextResponse.json({ status: "deleted" });
  } catch (err: unknown) {
    if (isNotFound(err)) {
      return NextResponse.json({ status: "deleted" }); // already gone
    }
    return NextResponse.json(
      { error: `Unable to delete survey: ${err}` },
      { status: 500 },
    );
  }
}
