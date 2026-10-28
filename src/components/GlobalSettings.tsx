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
import * as api from "../lib/fileHandler";
import {
  hasLocalStorageData,
  hasMigrated,
  migrateLocalStorageToFiles,
} from "../lib/localStorageMigration";
import { toast } from "./ui/use-toast";
import {
  HeatmapSettings,
  NewSurveyPoint,
  SettingsPatch,
  SurveyDocument,
  SurveyPoint,
  SurveyPointActions,
  SurveyPointPatch,
} from "../lib/types";
import { defaultSurvey } from "../lib/survey-defaults";
import {
  addPoint,
  applySettingsPatch,
  deletePoints,
  keepUnchanged,
  SETTINGS_PATCH_KEYS,
  updatePoint,
} from "../lib/survey-ops";

export const DEFAULT_FLOORPLAN = "EmptyFloorPlan.png";

/** How long to wait after the last settings change before sending it. */
const SAVE_DEBOUNCE_MS = 400;

/**
 * getDefaults()
 * @param floorPlan - desired floor plan, or "" if unknown
 * @returns Set of default settings for that floor plan
 */
export const getDefaults = (floorPlan: string): HeatmapSettings => ({
  ...defaultSurvey(floorPlan),
  sudoerPassword: "",
});

type SettingsUpdate =
  | Partial<HeatmapSettings>
  | ((previous: HeatmapSettings) => Partial<HeatmapSettings>);

interface SettingsContextType {
  settings: HeatmapSettings;
  /** true until the first survey file has been read */
  loading: boolean;
  updateSettings: (newSettings: SettingsUpdate) => void;
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

/** One change to send to the server, for the survey it was made on. */
type Op = { name: string } & (
  | { kind: "load" }
  | { kind: "patch"; patch: SettingsPatch; keepalive?: boolean }
  | { kind: "add"; point: NewSurveyPoint }
  | { kind: "update"; id: string; patch: SurveyPointPatch }
  | { kind: "delete"; ids: string[] }
);

/** The change applied locally, so it shows before the server answers. */
function applyLocally(survey: SurveyDocument, op: Op): SurveyDocument {
  switch (op.kind) {
    case "patch":
      return applySettingsPatch(survey, op.patch);
    case "add":
      return addPoint(survey, op.point);
    case "update":
      return updatePoint(survey, op.id, op.patch) ?? survey;
    case "delete":
      return deletePoints(survey, op.ids);
    case "load":
      return survey;
  }
}

async function send(op: Op): Promise<SurveyDocument> {
  switch (op.kind) {
    case "load":
      return (
        (await api.getSurvey(op.name)) ??
        // none yet: an empty patch creates it with the defaults
        (await api.patchSettings(op.name, {}))
      );
    case "patch":
      return api.patchSettings(op.name, op.patch, { keepalive: op.keepalive });
    case "add":
      return api.addPoint(op.name, op.point);
    case "update":
      return api.updatePoint(op.name, op.id, op.patch);
    case "delete":
      return api.deletePoints(op.name, op.ids);
  }
}

/** Split an updateSettings() change into what is saved and the password. */
function toPatch(changes: Partial<HeatmapSettings>): {
  patch: SettingsPatch;
  sudoerPassword?: string;
} {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changes)) {
    if (key === "sudoerPassword" || value === undefined) continue;
    if ((SETTINGS_PATCH_KEYS as readonly string[]).includes(key)) {
      patch[key] = value;
    } else {
      console.error(
        `[wifi-heatmapper] updateSettings: "${key}" is not a setting`,
      );
    }
  }
  return {
    patch: patch as SettingsPatch,
    sudoerPassword: changes.sudoerPassword,
  };
}

/**
 * SettingsProvider - the current survey, as the server last returned it plus
 * the changes it hasn't answered yet.
 *
 * The server owns the file. Each change goes to the API as an operation
 * (patch settings, add/update/delete points) and the server answers with
 * the whole updated survey, which replaces the local copy. Operations are
 * sent one after another, so they reach the server in the order they were
 * made; settings changes are debounced (sliders, typing) and merged into
 * one patch. The sudo password never leaves the browser.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<HeatmapSettings>(getDefaults(""));
  const [floorplanImage, setFloorplanImage] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [reloadCounter, setReloadCounter] = useState(0);
  const migrationDone = useRef(false);

  // The survey being shown, as the server last returned it
  const serverRef = useRef<SurveyDocument>(defaultSurvey(""));
  // Its name; answers for any other survey are not shown
  const nameRef = useRef("");
  const sudoRef = useRef("");
  // Sent or queued, not answered yet (applied on top of serverRef)
  const pendingRef = useRef<Op[]>([]);
  // The debounced settings patch, not queued yet
  const draftRef = useRef<Extract<Op, { kind: "patch" }> | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Operations run one at a time (send() errors are caught, so it never breaks)
  const queue = useRef<Promise<void>>(Promise.resolve());

  /** What to show: the server's survey plus every unanswered change. */
  const current = useCallback((): HeatmapSettings => {
    const ops = [
      ...pendingRef.current,
      ...(draftRef.current ? [draftRef.current] : []),
    ];
    const survey = ops
      .filter((op) => op.name === nameRef.current)
      .reduce(applyLocally, serverRef.current);
    return { ...survey, sudoerPassword: sudoRef.current };
  }, []);

  // Parts the server answered unchanged keep their identity, so maps and
  // tables don't redraw for nothing
  const refresh = useCallback(
    () => setSettings((shown) => keepUnchanged(shown, current())),
    [current],
  );

  const enqueue = useCallback(
    (op: Op) => {
      pendingRef.current.push(op);
      queue.current = queue.current.then(async () => {
        try {
          const survey = await send(op);
          if (op.name === nameRef.current) serverRef.current = survey;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[wifi-heatmapper] ${op.kind} on "${op.name}":`, err);
          if (op.name === nameRef.current) {
            toast({
              variant: "destructive",
              title:
                op.kind === "load"
                  ? "Could not read the survey"
                  : "Change not saved",
              description: message,
            });
          }
        } finally {
          pendingRef.current = pendingRef.current.filter((o) => o !== op);
          if (op.kind === "load" && op.name === nameRef.current) {
            setLoading(false);
          }
          refresh();
        }
      });
    },
    [refresh],
  );

  /** Queue the debounced settings patch now, if there is one. */
  const flushDraft = useCallback(
    (keepalive = false) => {
      if (draftTimer.current) {
        clearTimeout(draftTimer.current);
        draftTimer.current = null;
      }
      const draft = draftRef.current;
      if (!draft) return;
      draftRef.current = null;
      enqueue(keepalive ? { ...draft, keepalive } : draft);
    },
    [enqueue],
  );

  // Send any pending change when the tab is hidden or closed
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flushDraft(true);
    };
    const onPageHide = () => flushDraft(true);
    window.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      flushDraft();
    };
  }, [flushDraft]);

  // Load the survey (and migrate on first run)
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
      if (cancelled) return;
      // Anything still unsent belongs to the previous survey: send it now
      flushDraft();
      // The previous survey stays on screen until this one has loaded
      const name = floorplanImage || DEFAULT_FLOORPLAN;
      nameRef.current = name;
      enqueue({ kind: "load", name });
    }
    loadSettings();
    return () => {
      cancelled = true;
    };
  }, [floorplanImage, reloadCounter, flushDraft, enqueue]);

  const readNewSettingsFromFile = useCallback((fileName: string) => {
    setFloorplanImage(fileName); // let useEffect() do the work
  }, []);

  const reloadSettings = useCallback(() => {
    setReloadCounter((n) => n + 1);
  }, []);

  const updateSettings = useCallback(
    (newSettings: SettingsUpdate) => {
      const changes =
        typeof newSettings === "function"
          ? newSettings(current())
          : newSettings;
      const { patch, sudoerPassword } = toPatch(changes);
      if (sudoerPassword !== undefined) sudoRef.current = sudoerPassword;
      const name = nameRef.current;
      if (name && Object.keys(patch).length > 0) {
        const draft = draftRef.current;
        if (draft && draft.name !== name) flushDraft();
        draftRef.current = {
          kind: "patch",
          name,
          patch: { ...(draftRef.current?.patch ?? {}), ...patch },
        };
        if (draftTimer.current) clearTimeout(draftTimer.current);
        draftTimer.current = setTimeout(() => flushDraft(), SAVE_DEBOUNCE_MS);
      }
      refresh();
    },
    [current, refresh, flushDraft],
  );

  /** Point changes are sent at once, after any settings change before them. */
  const sendNow = useCallback(
    (op: Op) => {
      if (!op.name) return; // no survey loaded yet
      flushDraft();
      enqueue(op);
      refresh();
    },
    [flushDraft, enqueue, refresh],
  );

  const surveyPointActions: SurveyPointActions = useMemo(
    () => ({
      // The server gives the point the next free "Point_N" id
      add: (newPoint: SurveyPoint) => {
        sendNow({ kind: "add", name: nameRef.current, point: newPoint });
      },

      update: (thePoint: SurveyPoint, updatedData: Partial<SurveyPoint>) => {
        const { id: _id, ...patch } = updatedData;
        sendNow({
          kind: "update",
          name: nameRef.current,
          id: thePoint.id,
          patch,
        });
      },

      delete: (points: SurveyPoint[]) => {
        sendNow({
          kind: "delete",
          name: nameRef.current,
          ids: points.map((point) => point.id),
        });
      },
    }),
    [sendNow],
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
