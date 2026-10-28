/**
 * /api/e2e/data - the server state e2e tests share (lib/e2e-control.ts).
 *
 * - GET    -> { eventStreams }: how many /api/events streams are open, so
 *             tests can check that closed pages left none behind
 * - DELETE -> back to a freshly started server before each test: no
 *             surveys, only the bundled floor plans, no measurement, the
 *             normal mock
 *
 * e2e tests only: 404 unless the server runs for them (isTestApiEnabled).
 */
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-helpers";
import { isTestApiEnabled } from "@/lib/mock-scenario";
import { resetTestData } from "@/lib/e2e-control";
import { listenerCount } from "@/lib/measurement-job";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isTestApiEnabled()) return jsonError(404, "Not found");
  return NextResponse.json({ eventStreams: listenerCount() });
}

export async function DELETE() {
  if (!isTestApiEnabled()) return jsonError(404, "Not found");
  await resetTestData();
  return NextResponse.json({ reset: true });
}
