/**
 * start-task API - /api/start-task?action=...
 * - GET  of "action=status" returns the current status
 * - POST of "action=start" begins the measurement process
 * - POST of "action=stop" sets the cancel flag to halt the process
 */
import { NextRequest, NextResponse } from "next/server";
import {
  setCancelFlag,
  getGlobalStatus,
  setSurveyResults,
  getSurveyResults,
} from "@/lib/server-globals";
import { runSurveyTests } from "@/lib/iperfRunner";
import { readBody } from "@/lib/api-helpers";
import { startTaskSchema } from "@/lib/schema";
import { getLogger, rememberSecret } from "../../../lib/logger";
import { recordMeasurement } from "@/lib/diagnostics-state";
import { measuresSpeed } from "@/lib/measurement-mode";
const logger = getLogger("start-task");

// handle a "status" request
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");
  if (action === "status") {
    return NextResponse.json(getGlobalStatus());
  } else if (action === "results") {
    return NextResponse.json(getSurveyResults() ?? { state: "pending" });
  }
  // invalid action
  return NextResponse.json(
    { error: `Invalid action "${action}"` },
    { status: 400 },
  );
}

export async function POST(req: NextRequest) {
  // Get the `action` parameter - /api/start-task?action=start`
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  // action=start: expects an object with a single property: settings
  if (action === "start") {
    const body = await readBody(req, startTaskSchema);
    if (!body.ok) return body.response;
    const { settings } = body.data;
    rememberSecret(settings.sudoerPassword);
    const { sudoerPassword: _pw, ...loggable } = settings;
    logger.debug(`action=start: ${JSON.stringify(loggable)}`);
    setSurveyResults({ state: "pending" });
    const speedTests = measuresSpeed(settings);
    const failed = (error: string) =>
      recordMeasurement({ ok: false, speedTests, error });

    // Start off the survey process immediately
    // this IIFE runs independently and uses setSurveyResults for the client
    void (async () => {
      try {
        const { iperfData, wifiData, status, warning } =
          await runSurveyTests(settings);
        // status that isn't "" means preflight went wrong
        if (status != "") {
          if (status !== "Measurement cancelled") failed(status);
          setSurveyResults({
            explanation: status,
            state: "error",
          });
          return;
        }
        if (!wifiData || !iperfData) {
          failed("The measurement returned no data.");
          setSurveyResults({
            state: "error",
            explanation: "The measurement returned no data.",
          });
          return;
        }
        recordMeasurement({
          ok: true,
          speedTests,
          ...(warning ? { note: `Saved without speed: ${warning}` } : {}),
        });
        setSurveyResults({
          state: "done",
          results: { wifiData, iperfData },
          ...(warning ? { warning } : {}),
        });
      } catch (err) {
        failed(String(err));
        setSurveyResults({ state: "error", explanation: String(err) });
      }
    })();

    // and immediately retun an OK status
    return NextResponse.json("OK");

    // Stop
  } else if (action === "stop") {
    setCancelFlag(true); // in sseGlobal.ts
    return NextResponse.json({ message: "Task stopped" });
  }

  logger.debug(`Unexpected action received: ${action}`);
  return NextResponse.json(
    { error: `Invalid action "${action}"` },
    { status: 400 },
  );
}
