"use client";
import { useEffect, useState } from "react";
import { FlaskConical, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "./BrandMark";
import { useAppStatus } from "@/hooks/useAppStatus";

const STORAGE_KEY = "wifi-heatmapper-welcome-dismissed";
/** Dispatch this on `window` to show the panel again (used by About). */
export const SHOW_WELCOME_EVENT = "wifi-heatmapper:show-welcome";

export function showWelcomeAgain() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(SHOW_WELCOME_EVENT));
}

/**
 * One paragraph for first-time users, shown until dismissed.
 * The choice is remembered per browser.
 */
export function WelcomePanel() {
  const [open, setOpen] = useState(false);
  const status = useAppStatus();

  useEffect(() => {
    const read = () => {
      try {
        setOpen(localStorage.getItem(STORAGE_KEY) === null);
      } catch {
        setOpen(true);
      }
    };
    read();
    window.addEventListener(SHOW_WELCOME_EVENT, read);
    return () => window.removeEventListener(SHOW_WELCOME_EVENT, read);
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
      // ignore
    }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <section
      aria-label="Welcome"
      data-testid="welcome-panel"
      className="mb-6 flex items-start gap-4 rounded-lg border border-brand/30 bg-brand-soft/60 p-4 pr-3 sm:p-5 sm:pr-4"
    >
      <BrandMark className="mt-0.5 hidden h-7 w-7 shrink-0 sm:block" />
      <div className="min-w-0 flex-1 space-y-3">
        <p className="max-w-[78ch] text-sm leading-relaxed">
          <strong className="font-semibold">Wi-Fi Heatmapper</strong> shows you
          where your Wi-Fi is strong and where it is not. Pick or upload a floor
          plan in Settings, then walk around with this laptop and, on the Floor
          plan tab, click the spot where you are standing: each click measures
          the signal there. To measure speed as well, run{" "}
          <code className="rounded bg-background/70 px-1 py-0.5 font-mono text-xs">
            iperf3 -s
          </code>{" "}
          on another computer on your network and enter its address in Settings.
          After a dozen points or so, the Heat maps tab draws the picture.
          Everything stays on this computer.
        </p>
        {status?.mockMode && (
          <p
            className="flex max-w-[78ch] items-start gap-2 text-sm leading-relaxed text-warning"
            data-testid="welcome-mock-note"
          >
            <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Mock mode is on: every measurement is made up, so you can try
              everything without a Wi-Fi card, sudo or iperf3. To measure for
              real, stop the server and start it with{" "}
              <code className="rounded bg-background/70 px-1 py-0.5 font-mono text-xs">
                npm run dev
              </code>
              . Sample points stay in the survey until you delete them on the
              Survey points tab.
            </span>
          </p>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={dismiss}
          data-testid="welcome-dismiss"
        >
          Got it
        </Button>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss welcome message"
        className="rounded p-1 text-muted-foreground hover:bg-background/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>
    </section>
  );
}
