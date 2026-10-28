/**
 * /api/sudo-password - the sudo password the server holds in memory for
 * measurements started without one (by an AI agent through MCP); see
 * lib/sudo-session.ts.
 *
 * - GET    -> { held: boolean }. Never the password.
 * - PUT    { password } -> { held }. "" forgets it. Sent by the Settings
 *          tab when the field changes.
 * - DELETE -> { held: false }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readBody } from "@/lib/api-helpers";
import { hasHeldSudoPassword, holdSudoPassword } from "@/lib/sudo-session";

export const dynamic = "force-dynamic";

const bodySchema = z.strictObject({ password: z.string().max(1000) });

export async function GET() {
  return NextResponse.json({ held: hasHeldSudoPassword() });
}

export async function PUT(req: NextRequest) {
  const body = await readBody(req, bodySchema);
  if (!body.ok) return body.response;
  holdSudoPassword(body.data.password);
  return NextResponse.json({ held: hasHeldSudoPassword() });
}

export async function DELETE() {
  holdSudoPassword("");
  return NextResponse.json({ held: false });
}
