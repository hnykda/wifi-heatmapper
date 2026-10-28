/**
 * start-task API - /api/start-task?action=... (see lib/measurement-job.ts)
 * - POST action=start  { survey, x, y, settings } -> { jobId, job };
 *        409 { error, jobId, job } while another measurement runs
 * - POST action=stop   { jobId? } -> { stopped }; stops that job (or the
 *        running one) at once, killing a running iperf3
 * - GET  action=status&id=<jobId> -> the job (404 if unknown);
 *        without id: { job } for the running job, or { job: null }
 * When a job finishes, the server has saved the point; the "done" event
 * and the status carry its id.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  currentJob,
  getJob,
  startMeasurement,
  stopMeasurement,
} from "@/lib/measurement-job";
import { jsonError, readBody } from "@/lib/api-helpers";
import { startTaskSchema } from "@/lib/schema";
import { getLogger, rememberSecret } from "@/lib/logger";
const logger = getLogger("start-task");

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");
  if (action !== "status") {
    return jsonError(400, `Invalid action "${action}"`);
  }
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ job: currentJob() });
  const job = getJob(id);
  return job
    ? NextResponse.json(job)
    : jsonError(404, `No measurement "${id}"`);
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  if (action === "start") {
    const body = await readBody(req, startTaskSchema);
    if (!body.ok) return body.response;
    const { settings, survey, x, y } = body.data;
    rememberSecret(settings.sudoerPassword);
    const { sudoerPassword: _pw, ...loggable } = settings;
    logger.debug(
      `action=start: ${survey} (${x}, ${y}) ${JSON.stringify(loggable)}`,
    );
    const started = await startMeasurement({ survey, x, y, settings });
    if (!started.ok) {
      return NextResponse.json(
        {
          error: "A measurement is already running. Wait for it to finish.",
          jobId: started.running.id,
          job: started.running,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ jobId: started.job.id, job: started.job });
  }

  if (action === "stop") {
    const body = await req.json().catch(() => ({}));
    const jobId =
      typeof body?.jobId === "string" && body.jobId ? body.jobId : undefined;
    return NextResponse.json({ stopped: stopMeasurement(jobId) });
  }

  logger.debug(`Unexpected action received: ${action}`);
  return jsonError(400, `Invalid action "${action}"`);
}
