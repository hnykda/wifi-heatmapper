// app/api/media/route.ts
/**
 * /media API
 * GET /media returns a list of the files in the /public/media directory
 * POST /media ... uploads a file
 */
import { NextResponse } from "next/server";
import { readdir, writeFile } from "fs/promises";
import path from "path";
// import { IncomingForm } from 'formidable';

// Ensure body parsing is disabled so we can handle file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

// function streamToBuffer(stream: Readable): Promise<Buffer> {
//   return new Promise((resolve, reject) => {
//     const chunks: Uint8Array[] = [];
//     stream.on("data", (chunk) => chunks.push(chunk));
//     stream.on("end", () => resolve(Buffer.concat(chunks)));
//     stream.on("error", reject);
//   });
// }

export async function GET() {
  try {
    const mediaDir = path.join(process.cwd(), "public", "media");
    const files = await readdir(mediaDir);
    return NextResponse.json({ files });
  } catch (err) {
    return NextResponse.json(
      { error: `Unable to list files ${err}` },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file") as File;

  if (!file || typeof file.name !== "string") {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const filePath = path.join(process.cwd(), "public", "media", file.name);

  await writeFile(filePath, buffer);
  return NextResponse.json({ status: "success", name: file.name });
}
