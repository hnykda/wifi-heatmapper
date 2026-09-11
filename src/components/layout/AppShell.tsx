"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { useCallback, useEffect, useState } from "react";
import { FlaskConical, Github } from "lucide-react";

import { useSettings } from "@/components/GlobalSettings";
import { useAppStatus } from "@/hooks/useAppStatus";
import { BrandMark } from "./BrandMark";
import { AboutDialog } from "./AboutDialog";
import { SurveySummary } from "./SurveySummary";
import { WelcomePanel } from "./WelcomePanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import SettingsEditor from "@/components/SettingsEditor";
import ClickableFloorplan from "@/components/Floorplan";
import { Heatmaps } from "@/components/Heatmaps";
import PointsTable from "@/components/PointsTable";
import { cn } from "@/lib/utils";

export const TABS = [
  { id: "settings", label: "Settings" },
  { id: "floorplan", label: "Floor plan" },
  { id: "heatmaps", label: "Heat maps" },
  { id: "points", label: "Survey points" },
] as const;
export type TabId = (typeof TABS)[number]["id"];

const isTabId = (v: string): v is TabId => TABS.some((t) => t.id === v);

/** The active tab lives in the URL hash so reload and back/forward keep it. */
function useHashTab(defaultTab: TabId): [TabId, (t: TabId) => void] {
  const [tab, setTab] = useState<TabId>(defaultTab);

  useEffect(() => {
    const read = () => {
      const h = window.location.hash.replace(/^#/, "");
      if (isTabId(h)) setTab(h);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const select = useCallback((t: TabId) => {
    setTab(t);
    if (window.location.hash !== `#${t}`) {
      history.replaceState(null, "", `#${t}`);
    }
  }, []);

  return [tab, select];
}

export default function AppShell() {
  const [tab, setTab] = useHashTab("settings");
  const { settings, surveyPointActions } = useSettings();
  const status = useAppStatus();

  return (
    <Tabs.Root
      value={tab}
      onValueChange={(v) => isTabId(v) && setTab(v)}
      className="flex min-h-screen flex-col"
    >
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 px-4 sm:h-14 sm:flex-nowrap sm:px-6">
          <a
            href="#settings"
            onClick={() => setTab("settings")}
            className="order-1 flex h-14 shrink-0 items-center gap-2 rounded-md text-[15px] font-semibold tracking-tight"
          >
            <BrandMark className="h-6 w-6" />
            <span>Wi-Fi Heatmapper</span>
          </a>

          <Tabs.List
            aria-label="Sections"
            className="order-3 -mx-4 flex h-11 basis-full items-stretch gap-1 overflow-x-auto px-3 sm:order-2 sm:mx-0 sm:h-14 sm:basis-auto sm:px-0"
          >
            {TABS.map((t) => (
              <Tabs.Trigger
                key={t.id}
                value={t.id}
                data-testid={`tab-${t.id}`}
                className={cn(
                  "relative flex items-center whitespace-nowrap px-3 text-sm text-muted-foreground transition-colors",
                  "hover:text-foreground data-[state=active]:text-foreground",
                  "after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand after:opacity-0 after:transition-opacity",
                  "data-[state=active]:after:opacity-100",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset rounded-md",
                )}
              >
                {t.label}
                {t.id === "points" && settings.surveyPoints.length > 0 && (
                  <span className="tabular ml-1.5 rounded-full bg-secondary px-1.5 py-px text-xs text-secondary-foreground">
                    {settings.surveyPoints.length}
                  </span>
                )}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          <div className="order-2 ml-auto flex items-center gap-1 sm:order-3">
            {status?.mockMode && (
              <span
                className="mr-2 hidden items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning sm:inline-flex"
                title="WIFI_HEATMAPPER_MOCK is set: measurements are synthetic"
                data-testid="mock-badge"
              >
                <FlaskConical className="h-3.5 w-3.5" />
                Mock data
              </span>
            )}
            <ThemeToggle />
            <AboutDialog />
            <a
              href="https://github.com/hnykda/wifi-heatmapper"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Source code on GitHub"
              title="GitHub"
            >
              <Github className="h-4 w-4" />
            </a>
          </div>
        </div>
      </header>

      <SurveySummary onNavigate={setTab} />

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6">
        <WelcomePanel />
        <Tabs.Content value="settings" className="outline-none">
          <SettingsEditor />
        </Tabs.Content>
        <Tabs.Content value="floorplan" className="outline-none">
          <ClickableFloorplan />
        </Tabs.Content>
        <Tabs.Content value="heatmaps" className="outline-none">
          <Heatmaps />
        </Tabs.Content>
        <Tabs.Content value="points" className="outline-none">
          <PointsTable
            data={settings.surveyPoints}
            surveyPointActions={surveyPointActions}
            apMapping={settings.apMapping}
          />
        </Tabs.Content>
      </main>
    </Tabs.Root>
  );
}
