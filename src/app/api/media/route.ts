/**
 * /api/media - floor plan images, stored in <data dir>/media
 *
 * GET  /api/media           -> { files: string[] } (image files, sorted)
 * POST /api/media           -> multipart upload (field "file")
 *                              409 if a file with that name already exists
 * GET  /api/media/<name>    -> the image bytes (see [name]/route.ts)
 * DELETE /api/media/<name>  -> remove the image (see [name]/route.ts)
 */
import { NextResponse } from "next/server";
import { mkdir, readdir, writeFile, access } from "fs/promises";
import path from "path";
import {
  getMediaDir,
  isImageFileName,
  normalizeUploadName,
} from "@/lib/server-paths";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const mediaDir = getMediaDir();
    await mkdir(mediaDir, { recursive: true });
    const files = (await readdir(mediaDir))
      .filter(isImageFileName)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    return NextResponse.json({ files });
  } catch (err) {
    return NextResponse.json(
      { error: `Unable to list floor plans: ${err}` },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || typeof file.name !== "string") {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const name = normalizeUploadName(file.name);
  if (!name || !isImageFileName(name)) {
    return NextResponse.json(
      { error: "Only PNG, JPEG or WebP images can be used as floor plans." },
      { status: 400 },
    );
  }

  const mediaDir = getMediaDir();
  await mkdir(mediaDir, { recursive: true });
  const filePath = path.join(mediaDir, name);

  try {
    await access(filePath);
    return NextResponse.json(
      { error: `A floor plan named "${name}" already exists.`, name },
      { status: 409 },
    );
  } catch {
    // does not exist yet - good
  }

  await writeFile(filePath, Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ status: "success", name });
}
