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

// handle a "status" request
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");
  if (action === "status") {
    return NextResponse.json(getGlobalStatus());
  } else if (action === "results") {
    return NextResponse.json(getSurveyResults());
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
    const { settings } = await req.json();
    // console.log(`action=start: ${JSON.stringify(settings)}`);
    setSurveyResults({ state: "pending" });

    // Start off the survey process immediately
    // this IIFE runs independently and uses setSurveyResults for the client
    void (async () => {
      try {
        const { iperfData, wifiData, status } = await runSurveyTests(settings);
        // status that isn't "" means preflight went wrong
        if (status != "") {
          setSurveyResults({
            explanation: status,
            state: "error",
          });
          return;
        }
        if (!wifiData || !iperfData) {
          setSurveyResults({
            state: "error",
            explanation: "wifi or iperf data is null",
          });
          return;
        }
        setSurveyResults({ state: "done", results: { wifiData, iperfData } });
      } catch (err) {
        setSurveyResults({ state: "error", explanation: String(err) });
      }
    })();

    // and immediately retun an OK status
    return NextResponse.json("OK");

    // const result = await startSurvey(settings);
    // console.log(`startSurvey results: ${JSON.stringify(result)}`);
    // const safe = JSON.parse(JSON.stringify(result));

    // Stop
  } else if (action === "stop") {
    setCancelFlag(true); // in sseGlobal.ts
    return NextResponse.json({ message: "Task stopped" });
  }

  // console.log(`Unexpected action received: ${action}`);
  return NextResponse.json(
    { error: `Invalid action "${action}"` },
    { status: 400 },
  );
}
