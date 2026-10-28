/**
 * /api/e2e/scenario - how the mock backend behaves (lib/mock-scenario.ts).
 * e2e tests only: 404 unless the server runs for them (isTestApiEnabled:
 * mock mode, WIFI_HEATMAPPER_E2E and a data dir of its own).
 *
 * - GET    -> the scenario in effect
 * - PUT    { wifi?, noise?, iperf?, delayMs?, ... } -> replaces it
 * - DELETE -> back to the normal mock
 */
import { NextRequest, NextResponse } from "next/server";
import { jsonError, readBody } from "@/lib/api-helpers";
import { mockScenarioSchema } from "@/lib/schema";
import {
  isTestApiEnabled,
  mockScenario,
  resetMockScenario,
  setMockScenario,
} from "@/lib/mock-scenario";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isTestApiEnabled()) return jsonError(404, "Not found");
  return NextResponse.json(mockScenario());
}

export async function PUT(req: NextRequest) {
  if (!isTestApiEnabled()) return jsonError(404, "Not found");
  const body = await readBody(req, mockScenarioSchema);
  if (!body.ok) return body.response;
  setMockScenario(body.data);
  return NextResponse.json(mockScenario());
}

export async function DELETE() {
  if (!isTestApiEnabled()) return jsonError(404, "Not found");
  resetMockScenario();
  return NextResponse.json(mockScenario());
}
