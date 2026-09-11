/**
 * GET    /api/media/<name> - serve a floor plan image from <data dir>/media
 * DELETE /api/media/<name> - remove a floor plan image (its survey file is
 *                            removed by the client via /api/settings)
 */
import { NextRequest, NextResponse } from "next/server";
import { readFile, unlink } from "fs/promises";
import path from "path";
import {
  contentTypeFor,
  getMediaDir,
  isImageFileName,
  safeFileName,
} from "@/lib/server-paths";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ name: string }> };

function resolveName(raw: string): string | null {
  const name = safeFileName(decodeURIComponent(raw));
  return name && isImageFileName(name) ? name : null;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const name = resolveName((await params).name);
  if (!name) {
    return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
  }
  try {
    const data = await readFile(path.join(getMediaDir(), name));
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": contentTypeFor(name),
        "Content-Length": String(data.byteLength),
        "Cache-Control": "no-cache",
      },
    });
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const name = resolveName((await params).name);
  if (!name) {
    return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
  }
  try {
    await unlink(path.join(getMediaDir(), name));
    return NextResponse.json({ status: "deleted", name });
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
