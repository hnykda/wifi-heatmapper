"use client";
import { useEffect } from "react";
import { Check, CircleAlert, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MeasurementFields } from "@/lib/types";
import type { MeasurementPhase } from "@/hooks/useMeasurement";
import { cn } from "@/lib/utils";
import { openReport } from "@/components/help/report-store";

interface MeasurementPanelProps {
  phase: Exclude<MeasurementPhase, "idle">;
  header: string;
  fields: MeasurementFields | null;
  /** set when the point is (being) saved without speed, and why */
  warning: string;
  /** why it failed or was cancelled */
  message: string;
  /** Called when the panel wants to go away (done, cancelled, dismissed). */
  onClose: () => void;
  /** Called when the user cancels. */
  onCancel: () => void;
  /** The survey's choice, shown until the server confirms it. */
  measureSpeed?: boolean;
}

const DONE_AUTOCLOSE_MS = 2500;
const NO_FIELDS = { strength: "-", tcp: "-", udp: "-" };

/**
 * Progress of one measurement, anchored to the bottom-right corner.
 * The measurement itself (and its event stream) is useMeasurement's.
 */
export default function MeasurementPanel({
  phase,
  header,
  fields: shown,
  warning,
  message,
  onClose,
  onCancel,
  measureSpeed = false,
}: MeasurementPanelProps) {
  const fields = shown ?? NO_FIELDS;
  const mode = shown?.mode ?? (measureSpeed ? "speed" : "signal");

  // Success closes itself; a warning stays until it is dismissed
  useEffect(() => {
    if (phase !== "done" || warning) return;
    const t = setTimeout(onClose, DONE_AUTOCLOSE_MS);
    return () => clearTimeout(t);
  }, [phase, warning, onClose]);

  const cancel = onCancel;

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
        <div className="px-4 py-3 text-sm">
          <p className="whitespace-pre-line">{message}</p>
          {phase === "error" && (
            <button
              type="button"
              onClick={() => openReport(message)}
              className="mt-2 text-xs text-brand underline-offset-4 hover:underline"
              data-testid="measurement-report"
            >
              Report this
            </button>
          )}
        </div>
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
                {fields.udp !== "Off" && (
                  <>
                    <dt className="text-muted-foreground">Fixed rate (UDP)</dt>
                    <dd className="truncate text-right font-medium">
                      {fields.udp}
                    </dd>
                  </>
                )}
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
              <button
                type="button"
                onClick={() => openReport(`Saved without speed: ${warning}`)}
                className="mt-2 block text-xs text-brand underline-offset-4 hover:underline"
                data-testid="measurement-warning-report"
              >
                Report this
              </button>
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
