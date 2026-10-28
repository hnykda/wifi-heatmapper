"use client";
import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SSEMessageType } from "@/app/api/events/route";
import { cn } from "@/lib/utils";

interface MeasurementPanelProps {
  /** Called once the SSE channel is open; start the measurement then. */
  onReady: () => void;
  /** Called when the panel wants to go away (done, cancelled, dismissed). */
  onClose: () => void;
  /** Called when the user cancels. */
  onCancel: () => void;
  /** Optional error from the results poll (shown instead of progress). */
  error?: string | null;
  /** The survey's choice, shown until the server confirms it. */
  measureSpeed?: boolean;
}

type Phase = "connecting" | "running" | "done" | "cancelled" | "error";

const DONE_AUTOCLOSE_MS = 2500;

/**
 * Progress of one measurement, anchored to the bottom-right corner.
 * Listens to the server's event stream (/api/events) for updates.
 */
export default function MeasurementPanel({
  onReady,
  onClose,
  onCancel,
  error,
  measureSpeed = false,
}: MeasurementPanelProps) {
  const [phase, setPhase] = useState<Phase>("connecting");
  const [header, setHeader] = useState("Connecting");
  const [fields, setFields] = useState({ strength: "-", tcp: "-", udp: "-" });
  const [mode, setMode] = useState<"signal" | "speed">(
    measureSpeed ? "speed" : "signal",
  );
  const [warning, setWarning] = useState("");
  const [message, setMessage] = useState("");
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const es = new EventSource("/api/events");

    es.onmessage = (event: MessageEvent) => {
      let data: SSEMessageType;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (data.type === "heartbeat") return;
      if (data.type === "ready") {
        setPhase("running");
        setHeader("Starting");
        onReadyRef.current();
        return;
      }
      if (data.fields) {
        setFields(data.fields);
        if (data.fields.mode) setMode(data.fields.mode);
      }
      setWarning(data.warning ?? "");
      setHeader(data.header);
      if (data.type === "update") return;
      if (data.type === "done") {
        es.close();
        const failed = /error|cancel/i.test(data.header);
        if (failed) {
          setPhase(/cancel/i.test(data.header) ? "cancelled" : "error");
          setMessage(data.status);
        } else {
          setPhase("done");
        }
      }
    };

    es.onerror = () => {
      es.close();
      setPhase((p) => (p === "connecting" ? "error" : p));
      setMessage(
        (m) => m || "Lost contact with the server. Is it still running?",
      );
    };

    return () => es.close();
  }, []);

  // An error surfaced by the results poll wins over whatever the stream said
  useEffect(() => {
    if (error) {
      setPhase("error");
      setMessage(error);
    }
  }, [error]);

  // Success closes itself; a warning stays until it is dismissed
  useEffect(() => {
    if (phase !== "done" || warning) return;
    const t = setTimeout(onClose, DONE_AUTOCLOSE_MS);
    return () => clearTimeout(t);
  }, [phase, warning, onClose]);

  const cancel = async () => {
    setPhase("cancelled");
    setHeader("Cancelled");
    onCancel();
    await fetch("/api/start-task?action=stop", { method: "POST" }).catch(
      () => {},
    );
  };

  const running = phase === "connecting" || phase === "running";
  const savedWithWarning = phase === "done" && !!warning;

  const title =
    phase === "done"
      ? warning
        ? "Saved without speed"
        : "Measurement saved"
      : phase === "error"
        ? "Could not measure"
        : phase === "cancelled"
          ? "Cancelled"
          : header;

  return (
    <aside
      role="status"
      aria-live="polite"
      data-testid="measurement-panel"
      data-phase={phase}
      data-mode={mode}
      data-warning={savedWithWarning ? "true" : undefined}
      className={cn(
        "fixed bottom-4 right-4 z-40 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-float",
        "animate-in slide-in-from-bottom-2 fade-in-0 duration-200",
      )}
    >
      <div className="flex items-center gap-2.5 border-b px-4 py-3">
        {running && (
          <span className="measuring-dot h-2.5 w-2.5 shrink-0 rounded-full bg-brand" />
        )}
        {phase === "done" && !warning && (
          <Check className="h-4 w-4 shrink-0 text-success" />
        )}
        {savedWithWarning && (
          <TriangleAlert className="h-4 w-4 shrink-0 text-warning" />
        )}
        {(phase === "error" || phase === "cancelled") && (
          <CircleAlert className="h-4 w-4 shrink-0 text-destructive" />
        )}
        <h3 className="truncate text-sm font-semibold">{title}</h3>
        {!running && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Dismiss"
            className="ml-auto rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {phase === "error" || phase === "cancelled" ? (
        <p className="whitespace-pre-line px-4 py-3 text-sm">{message}</p>
      ) : (
        <>
          <dl className="tabular grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-4 py-3 text-sm">
            <dt className="text-muted-foreground">Signal</dt>
            <dd className="text-right font-medium">{fields.strength}</dd>
            {mode === "signal" ? (
              <>
                <dt className="text-muted-foreground">Speed</dt>
                <dd
                  className="text-right text-muted-foreground"
                  data-testid="measurement-speed-off"
                >
                  Not measured (signal only)
                </dd>
              </>
            ) : (
              <>
                <dt className="text-muted-foreground">Download / upload</dt>
                <dd className="truncate text-right font-medium">
                  {fields.tcp}
                </dd>
                <dt className="text-muted-foreground">Fixed rate (UDP)</dt>
                <dd className="truncate text-right font-medium">
                  {fields.udp}
                </dd>
              </>
            )}
          </dl>
          {warning && (
            <p
              className="border-t bg-warning/10 px-4 py-3 text-sm"
              data-testid="measurement-warning"
            >
              {warning}{" "}
              <a href="#settings" className="prose-link whitespace-nowrap">
                Open Settings
              </a>
            </p>
          )}
        </>
      )}

      {running && (
        <div className="flex items-center justify-between border-t px-4 py-2.5">
          <span className="text-xs text-muted-foreground">
            Stay where you are until it finishes.
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={cancel}
            data-testid="measurement-cancel"
          >
            Cancel
          </Button>
        </div>
      )}
    </aside>
  );
}
