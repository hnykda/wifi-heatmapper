/**
 * DELETE /api/e2e/data - back to a freshly started server before each e2e
 * test: no surveys, only the bundled floor plans, no measurement, the
 * normal mock (lib/e2e-control.ts).
 * e2e tests only: 404 unless the server runs for them (isTestApiEnabled).
 */
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-helpers";
import { isTestApiEnabled } from "@/lib/mock-scenario";
import { resetTestData } from "@/lib/e2e-control";

export const dynamic = "force-dynamic";

export async function DELETE() {
  if (!isTestApiEnabled()) return jsonError(404, "Not found");
  await resetTestData();
  return NextResponse.json({ reset: true });
}
