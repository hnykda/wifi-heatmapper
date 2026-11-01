"use client";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, Settings2, TriangleAlert } from "lucide-react";
import { useSettings } from "@/components/GlobalSettings";
import FloorplanPicker from "@/components/MediaDropdown";
import { hasSpeedData, parseServerAddress } from "@/lib/measurement-mode";
import { cn } from "@/lib/utils";
import type { TabId } from "./AppShell";

/** The time today, else the date and time (the year only if not this year). */
function measuredAt(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return time;
  const date = d.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    ...(d.getFullYear() !== now.getFullYear() && { year: "numeric" }),
  });
  return `${date}, ${time}`;
}

const itemClass =
  "flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden data-highlighted:bg-accent";

/**
 * The survey you are working on, above every tab: which floor plan (pick
 * or upload one here), how many points, what a click measures, and a
 * warning when speed results are going missing.
 */
export function SurveyBar({
  onNavigate,
}: {
  onNavigate: (tab: TabId) => void;
}) {
  const { settings, updateSettings, readNewSettingsFromFile, loading } =
    useSettings();
  const points = settings.surveyPoints;
  const enabled = points.filter((p) => p.isEnabled).length;
  const last = points.reduce((m, p) => Math.max(m, p.timestamp), 0);
  const speed = settings.measureSpeed;
  const serverSet = !!parseServerAddress(settings.iperfServerAdrs);
  const mode = speed
    ? serverSet
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
    : !serverSet
      ? "No speed test server set"
      : newest && !hasSpeedData(newest)
        ? "Newest point has no speed"
        : null;

  const label = (text: string) => (
    <span className="text-sm text-muted-foreground">{text}</span>
  );

  return (
    <section
      aria-label="Current survey"
      className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3"
      data-testid="survey-bar"
    >
      <div
        className="flex min-w-0 flex-wrap items-center gap-2"
        data-testid="summary-floorplan"
      >
        {label("Floor plan")}
        {loading && !settings.floorplanImageName ? (
          <span className="text-sm">Loading</span>
        ) : (
          <FloorplanPicker
            value={settings.floorplanImageName}
            onChange={readNewSettingsFromFile}
          />
        )}
      </div>

      <div className="flex items-center gap-2">
        {label("Measuring")}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              data-testid="summary-iperf"
              className="field inline-flex h-9 w-auto max-w-[min(20rem,70vw)] items-center gap-2 text-left"
            >
              <span className="truncate">{mode}</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content
            align="start"
            sideOffset={4}
            className="z-50 w-80 max-w-[90vw] rounded-md border bg-popover p-1 text-popover-foreground shadow-float"
          >
            <DropdownMenu.Item
              className={itemClass}
              onSelect={() => updateSettings({ measureSpeed: false })}
              data-testid="bar-mode-signal"
            >
              <Check
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0 text-brand",
                  speed && "invisible",
                )}
              />
              <span className="grid gap-0.5">
                <span className="font-medium">Signal only</span>
                <span className="text-xs text-muted-foreground">
                  Nothing to set up. About 2 seconds per spot.
                </span>
              </span>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={itemClass}
              onSelect={() => {
                updateSettings({ measureSpeed: true });
                // the server address is set in Settings: go there if missing
                if (!serverSet) onNavigate("settings");
              }}
              data-testid="bar-mode-speed"
            >
              <Check
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0 text-brand",
                  !speed && "invisible",
                )}
              />
              <span className="grid gap-0.5">
                <span className="font-medium">Signal and speed</span>
                <span className="text-xs text-muted-foreground">
                  Needs a second computer running iperf3, wired to the router.
                </span>
              </span>
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <DropdownMenu.Item
              className={itemClass}
              onSelect={() => onNavigate("settings")}
            >
              <Settings2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              Speed test settings
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>

      {speedProblem && (
        <button
          type="button"
          onClick={() => onNavigate("settings")}
          className="flex items-center gap-1.5 rounded-md py-1 text-sm font-medium text-warning hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="summary-speed-warning"
        >
          <TriangleAlert className="h-4 w-4 shrink-0" />
          {speedProblem}
        </button>
      )}

      <button
        type="button"
        onClick={() => onNavigate("points")}
        className="group flex items-baseline gap-2 rounded-md py-1 text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="summary-points"
      >
        {label("Points")}
        <span className="tabular text-sm font-medium underline-offset-4 group-hover:underline">
          {points.length === 0
            ? "none yet"
            : enabled === points.length
              ? String(points.length)
              : `${enabled} of ${points.length} enabled`}
        </span>
      </button>

      {last > 0 && (
        <span className="flex items-baseline gap-2" data-testid="summary-last">
          {label("Last measured")}
          <span className="tabular text-sm">{measuredAt(last)}</span>
        </span>
      )}
    </section>
  );
}
