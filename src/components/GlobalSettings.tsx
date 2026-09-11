"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import { readSettingsFromFile, writeSettingsToFile } from "../lib/fileHandler";
import {
  hasLocalStorageData,
  hasMigrated,
  migrateLocalStorageToFiles,
} from "../lib/localStorageMigration";
import { toast } from "./ui/use-toast";
import { HeatmapSettings, SurveyPoint, SurveyPointActions } from "../lib/types";
import { defaultIperfCommands } from "../lib/iperfUtils";
import { mediaUrlFor } from "../lib/media-url";

export const DEFAULT_FLOORPLAN = "EmptyFloorPlan.png";

/** How long to wait after the last change before writing the survey file. */
const SAVE_DEBOUNCE_MS = 400;

/**
 * getDefaults()
 * @param floorPlan - desired floor plan, or "" if unknown
 * @returns Set of default settings for that floor plan
 */
export const getDefaults = (floorPlan: string): HeatmapSettings => {
  return {
    surveyPoints: [],
    floorplanImageName: floorPlan,
    floorplanImagePath: floorPlan ? mediaUrlFor(floorPlan) : "",
    iperfServerAdrs: "localhost",
    apMapping: [],
    testDuration: 1,
    sudoerPassword: "",
    nextPointNum: 1,
    dimensions: { width: 100, height: 100 },
    radiusDivider: null,
    maxOpacity: 0.7,
    minOpacity: 0.2,
    blur: 0.99,
    gradient: {
      0: "rgba(255, 0, 0, 0.6)", // 0%, -100 dBm
      0.45: "rgba(255, 255, 0, 0.6)", // 45%, -73 dBm
      0.5: "rgba(0, 0, 255, 0.6)", // 50%, -70 dBm
      0.6: "rgba(0, 255, 255, 0.6)", // 60%, -64 dBm
      0.75: "rgba(0, 255, 0, 0.6)", // 75%, -55 dBm
      0.9: "rgba(0, 255, 0, 0.6)", // 90%, -46 dBm
      1.0: "rgba(0, 255, 0, 0.6)", // 100%, -40 dBm
    },
    iperfCommands: { ...defaultIperfCommands },
  };
};

/**
 * normalizeLoadedSettings() - merge a file read from disk with the defaults
 * so old or incomplete files still produce a complete object.
 * The image URL is always derived from the name (older files stored a
 * /media/... path that is no longer served).
 */
export function normalizeLoadedSettings(
  loaded: Partial<HeatmapSettings>,
  floorPlan: string,
): HeatmapSettings {
  const defaults = getDefaults(floorPlan);
  return {
    ...defaults,
    ...loaded,
    floorplanImageName: floorPlan,
    floorplanImagePath: mediaUrlFor(floorPlan),
    iperfCommands: {
      ...defaults.iperfCommands,
      ...(loaded.iperfCommands ?? {}),
    },
    surveyPoints: loaded.surveyPoints ?? [],
    apMapping: loaded.apMapping ?? [],
    sudoerPassword: "",
  };
}

interface SettingsContextType {
  settings: HeatmapSettings;
  /** true until the first survey file has been read */
  loading: boolean;
  updateSettings: (newSettings: Partial<HeatmapSettings>) => void;
  surveyPointActions: SurveyPointActions;
  /** Switch to another floor plan (loads or creates its survey file) */
  readNewSettingsFromFile: (theFile: string) => void;
  /** Re-read the current floor plan's survey from disk */
  reloadSettings: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined,
);

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context)
    throw new Error("useSettings must be used within a SettingsProvider");
  return context;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<HeatmapSettings>(getDefaults(""));
  const [floorplanImage, setFloorplanImage] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [reloadCounter, setReloadCounter] = useState(0);
  const migrationDone = useRef(false);

  // Pending write, debounced. We keep the latest settings in a ref so the
  // timer always writes the most recent state.
  const latestRef = useRef<HeatmapSettings>(settings);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  const flushSave = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (dirtyRef.current && latestRef.current.floorplanImageName) {
      dirtyRef.current = false;
      void writeSettingsToFile(latestRef.current);
    }
  }, []);

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  }, [flushSave]);

  // Write any pending change when the tab is hidden or closed
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flushSave();
    };
    window.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flushSave);
    return () => {
      window.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flushSave);
      flushSave();
    };
  }, [flushSave]);

  // Load settings (and migrate on first run)
  useEffect(() => {
    let cancelled = false;
    async function loadSettings() {
      // One-time migration from localStorage (versions < 0.4.0)
      if (!migrationDone.current) {
        migrationDone.current = true;
        if (hasLocalStorageData() && !hasMigrated()) {
          const count = await migrateLocalStorageToFiles();
          if (count > 0) {
            toast({
              title: "Survey data migrated",
              description: `Moved ${count} survey(s) from browser storage into data/surveys/ as JSON files.`,
            });
          }
        }
      }

      const floorPlanToLoad = floorplanImage || DEFAULT_FLOORPLAN;
      const loaded = await readSettingsFromFile(floorPlanToLoad);
      if (cancelled) return;

      // Anything still unsaved belongs to the previous floor plan: write it now
      flushSave();

      if (loaded) {
        const merged = normalizeLoadedSettings(loaded, floorPlanToLoad);
        latestRef.current = merged;
        setSettings(merged);
      } else {
        const defaults = getDefaults(floorPlanToLoad);
        latestRef.current = defaults;
        setSettings(defaults);
        void writeSettingsToFile(defaults);
      }
      setLoading(false);
    }
    loadSettings();
    return () => {
      cancelled = true;
    };
  }, [floorplanImage, reloadCounter, flushSave]);

  const readNewSettingsFromFile = useCallback((fileName: string) => {
    setFloorplanImage(fileName); // let useEffect() do the work
  }, []);

  const reloadSettings = useCallback(() => {
    setReloadCounter((n) => n + 1);
  }, []);

  /**
   * applyChange() - the single place state changes go through.
   * The updater receives the previous settings and returns the next ones.
   * Values that are not meant to be persisted (sudo password) still live
   * in state; the API strips them before writing.
   */
  const applyChange = useCallback(
    (
      updater: (prev: HeatmapSettings) => HeatmapSettings,
      { immediate = false } = {},
    ) => {
      setSettings((prev) => {
        const next = updater(prev);
        latestRef.current = next;
        return next;
      });
      if (immediate) {
        // setSettings ran synchronously above, so latestRef is current
        dirtyRef.current = true;
        flushSave();
      } else {
        scheduleSave();
      }
    },
    [scheduleSave, flushSave],
  );

  const updateSettings = useCallback(
    (newSettings: Partial<HeatmapSettings>) => {
      applyChange((prev) => ({ ...prev, ...newSettings }));
    },
    [applyChange],
  );

  const surveyPointActions: SurveyPointActions = useMemo(
    () => ({
      // Adds the point and assigns it the next free "Point_N" id in one step,
      // so two quick measurements can never share an id.
      add: (newPoint: SurveyPoint) => {
        applyChange(
          (prev) => {
            const id = newPoint.id || `Point_${prev.nextPointNum}`;
            return {
              ...prev,
              nextPointNum: prev.nextPointNum + 1,
              surveyPoints: [...prev.surveyPoints, { ...newPoint, id }],
            };
          },
          { immediate: true },
        );
      },

      update: (thePoint: SurveyPoint, updatedData: Partial<SurveyPoint>) => {
        applyChange(
          (prev) => ({
            ...prev,
            surveyPoints: prev.surveyPoints.map((point) =>
              point.id === thePoint.id ? { ...point, ...updatedData } : point,
            ),
          }),
          { immediate: true },
        );
      },

      delete: (points: SurveyPoint[]) => {
        const ids = new Set(points.map((point) => point.id));
        applyChange(
          (prev) => ({
            ...prev,
            surveyPoints: prev.surveyPoints.filter((p) => !ids.has(p.id)),
          }),
          { immediate: true },
        );
      },
    }),
    [applyChange],
  );

  const value = useMemo(
    () => ({
      settings,
      loading,
      updateSettings,
      surveyPointActions,
      readNewSettingsFromFile,
      reloadSettings,
    }),
    [
      settings,
      loading,
      updateSettings,
      surveyPointActions,
      readNewSettingsFromFile,
      reloadSettings,
    ],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}
