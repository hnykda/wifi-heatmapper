/**
 * GET /api/events - server-sent events with the progress of measurements.
 *
 * Every open stream (every tab) gets every event; each event names its
 * job (see MeasurementEvent in lib/types.ts). Connecting changes nothing
 * about a running measurement. A stream that connects while a job runs
 * gets that job's latest progress at once.
 */
import { NextRequest } from "next/server";
import { currentJob, subscribe } from "@/lib/measurement-job";
import type { MeasurementEvent } from "@/lib/types";
import { getLogger } from "@/lib/logger";
const logger = getLogger("api-events");

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  let open = true;

  const write = (text: string) => {
    if (!open) return;
    writer.write(encoder.encode(text)).catch(() => close());
  };
  const send = (msg: MeasurementEvent) =>
    write(`data: ${JSON.stringify(msg)}\r\n\r\n`);

  // Safari buffering hack: pad with 2KB of comment lines
  write(": ".padEnd(2049, " ") + "\r\n");
  write(": connected\r\n\r\n");

  logger.debug("SSE client connected");
  send({ type: "ready", header: "", status: "SSE connection established" });
  const running = currentJob();
  if (running?.progress) send(running.progress);
  const unsubscribe = subscribe(send);

  // Heartbeat every 5 seconds, for this stream only
  const heartbeat = setInterval(() => {
    send({ type: "heartbeat", header: "", status: new Date().toISOString() });
  }, 5000);

  function close() {
    if (!open) return;
    open = false;
    clearInterval(heartbeat);
    unsubscribe();
    writer.close().catch(() => {});
  }

  // A client that goes away is normal: stop sending, drop the listener.
  // It may have gone already, before this handler got here.
  const onDisconnect = () => {
    close();
    logger.debug("SSE client disconnected");
  };
  if (req.signal.aborted) onDisconnect();
  else req.signal.addEventListener("abort", onDisconnect, { once: true });

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform, must-revalidate",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Content-Encoding": "none",
    },
  });
}
