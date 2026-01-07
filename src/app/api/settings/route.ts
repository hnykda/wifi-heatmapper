/**
 * /api/settings API
 * GET /api/settings?name=<floorplan-name> - reads settings for a floorplan
 * POST /api/settings - writes settings to a file
 * GET /api/settings?list=true - lists all available survey files
 */
import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir, readdir } from "fs/promises";
import path from "path";
import { sanitizeFilename } from "@/lib/utils";

const SURVEYS_DIR = path.join(process.cwd(), "data", "surveys");

/**
 * Get the full path for a survey file
 */
function getSurveyPath(floorplanName: string): string {
  const sanitized = sanitizeFilename(floorplanName);
  return path.join(SURVEYS_DIR, `${sanitized}.json`);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const listAll = searchParams.get("list");
  const name = searchParams.get("name");

  // List all survey files
  if (listAll === "true") {
    try {
      await mkdir(SURVEYS_DIR, { recursive: true });
      const files = await readdir(SURVEYS_DIR);
      const jsonFiles = files
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.replace(".json", ""));
      return NextResponse.json({ surveys: jsonFiles });
    } catch (err) {
      return NextResponse.json(
        { error: `Unable to list surveys: ${err}` },
        { status: 500 },
      );
    }
  }

  // Read a specific survey file
  if (!name) {
    return NextResponse.json(
      { error: "Missing 'name' query parameter" },
      { status: 400 },
    );
  }

  try {
    const filePath = getSurveyPath(name);
    const data = await readFile(filePath, "utf-8");
    return NextResponse.json(JSON.parse(data));
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
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

    if (!settings.floorplanImageName) {
      return NextResponse.json(
        { error: "Missing floorplanImageName in settings" },
        { status: 400 },
      );
    }

    // Ensure surveys directory exists
    await mkdir(SURVEYS_DIR, { recursive: true });

    // Remove sensitive data before saving
    const { sudoerPassword: _, ...safeSettings } = settings;

    const filePath = getSurveyPath(settings.floorplanImageName);
    await writeFile(filePath, JSON.stringify(safeSettings, null, 2));

    return NextResponse.json({ status: "success", path: filePath });
  } catch (err) {
    return NextResponse.json(
      { error: `Unable to save survey: ${err}` },
      { status: 500 },
    );
  }
}
