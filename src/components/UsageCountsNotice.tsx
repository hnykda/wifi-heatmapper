"use client";
import { BarChart3, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { useUsageCounts } from "@/hooks/useUsageCounts";
import { USAGE_COUNTS_PROMISE, USAGE_COUNTS_WHY } from "@/lib/usage-counts";

/** The id of the Settings section "What's sent" scrolls to. */
export const USAGE_COUNTS_SECTION_ID = "usage-counts";

/**
 * First-run notice: says that anonymous usage counts are on, why, and how
 * to turn them off. Shown while they are on until someone dismisses it on
 * this computer (shouldShowNotice in lib/usage-counts.ts). Never blocks.
 */
export function UsageCountsNotice({
  onShowDetails,
}: {
  /** open the Settings tab; the notice then scrolls to the section */
  onShowDetails: () => void;
}) {
  const { info, dismissNotice, turnOff } = useUsageCounts();
  if (!info?.showNotice) return null;

  const showDetails = () => {
    void dismissNotice();
    onShowDetails();
    // after the tab has switched
    setTimeout(() => {
      document
        .getElementById(USAGE_COUNTS_SECTION_ID)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const off = async () => {
    const ok = await turnOff();
    toast(
      ok
        ? {
            title: "Usage counts turned off",
            description: "Nothing more is sent. Turn them back on in Settings.",
          }
        : {
            variant: "destructive",
            title: "Could not turn usage counts off",
            description: "Try again in Settings.",
          },
    );
  };

  return (
    <section
      aria-label="Usage counts"
      data-testid="usage-notice"
      className="mb-4 flex items-start gap-3 rounded-lg border border-brand/30 bg-brand-soft/40 px-4 py-3 pr-2"
    >
      <BarChart3 className="mt-0.5 hidden h-4 w-4 shrink-0 text-brand sm:block" />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="max-w-[90ch] text-sm leading-relaxed">
          {USAGE_COUNTS_WHY} {USAGE_COUNTS_PROMISE}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={off}
            data-testid="usage-notice-off"
          >
            Turn off
          </Button>
          <Button
            size="sm"
            variant="link"
            className="px-1"
            onClick={showDetails}
            data-testid="usage-notice-details"
          >
            What&apos;s sent
          </Button>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void dismissNotice()}
        aria-label="Dismiss usage counts notice"
        data-testid="usage-notice-dismiss"
        className="rounded p-1 text-muted-foreground hover:bg-background/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>
    </section>
  );
}
