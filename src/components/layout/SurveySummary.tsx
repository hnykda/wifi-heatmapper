"use client";
import { useSettings } from "@/components/GlobalSettings";
import type { TabId } from "./AppShell";

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(ts).toLocaleDateString();
}

/**
 * One line under the header that says which survey you are working on.
 * Each value is a shortcut to where you change it.
 */
export function SurveySummary({
  onNavigate,
}: {
  onNavigate: (tab: TabId) => void;
}) {
  const { settings, loading } = useSettings();
  const points = settings.surveyPoints;
  const enabled = points.filter((p) => p.isEnabled).length;
  const last = points.reduce((m, p) => Math.max(m, p.timestamp), 0);
  const iperf =
    settings.iperfServerAdrs === "localhost" || !settings.iperfServerAdrs
      ? "off"
      : settings.iperfServerAdrs;

  const item = (label: string, value: string, tab: TabId, testid?: string) => (
    <button
      type="button"
      onClick={() => onNavigate(tab)}
      className="group flex items-baseline gap-2 rounded-md py-1 text-left hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-testid={testid}
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="tabular truncate text-sm font-medium underline-offset-4 group-hover:underline">
        {value}
      </span>
    </button>
  );

  return (
    <div className="border-b bg-surface/60">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 gap-y-0 px-4 sm:px-6">
        {item(
          "Floor plan",
          loading ? "loading" : settings.floorplanImageName || "none",
          "settings",
          "summary-floorplan",
        )}
        {item(
          "Points",
          points.length === 0
            ? "none yet"
            : enabled === points.length
              ? String(points.length)
              : `${enabled} of ${points.length} enabled`,
          "points",
          "summary-points",
        )}
        {item("Throughput tests", iperf, "settings", "summary-iperf")}
        {last > 0 && item("Last measured", relativeTime(last), "floorplan")}
      </div>
    </div>
  );
}
