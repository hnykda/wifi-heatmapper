"use client";
import { TriangleAlert } from "lucide-react";
import { useSettings } from "@/components/GlobalSettings";
import { hasSpeedData, parseServerAddress } from "@/lib/measurement-mode";
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
  const speed = settings.measureSpeed;
  const mode = speed
    ? parseServerAddress(settings.iperfServerAdrs)
      ? `Signal and speed (${settings.iperfServerAdrs})`
      : "Signal and speed"
    : "Signal only";
  // A survey that wants speed but whose newest point has none: say so, or
  // a whole survey can end up without speed data.
  const newest = points.reduce<(typeof points)[number] | null>(
    (m, p) => (!m || p.timestamp > m.timestamp ? p : m),
    null,
  );
  const speedProblem = !speed
    ? null
    : !parseServerAddress(settings.iperfServerAdrs)
      ? "No speed test server set"
      : newest && !hasSpeedData(newest)
        ? "Newest point has no speed"
        : null;

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
        {item("Measuring", mode, "settings", "summary-iperf")}
        {speedProblem && (
          <button
            type="button"
            onClick={() => onNavigate("settings")}
            className="flex items-center gap-1.5 rounded-md py-1 text-sm font-medium text-warning hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="summary-speed-warning"
          >
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
            {speedProblem}
          </button>
        )}
        {last > 0 && item("Last measured", relativeTime(last), "floorplan")}
      </div>
    </div>
  );
}
