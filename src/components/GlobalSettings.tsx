"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { readSettingsFromFile, writeSettingsToFile } from "../lib/fileHandler";
import { HeatmapSettings, SurveyPoint, SurveyPointActions } from "../lib/types";

/**
 * getDefaults()
 * @returns Set of default settings
 */
const getDefaults = (): HeatmapSettings => {
  return {
    surveyPoints: [],
    floorplanImagePath: "media/EmptyFloor.png",
    iperfServerAdrs: "127.0.0.1",
    apMapping: [],
    testDuration: 1,
    sudoerPassword: "",
    grumble: "grumble",
  };
};

// Define the context type
interface SettingsContextType {
  settings: HeatmapSettings;
  updateSettings: (newSettings: Partial<HeatmapSettings>) => void;
  surveyPointActions: SurveyPointActions;
}

// Create the context
const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined,
);

// Custom hook to use the settings context
export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context)
    throw new Error("useSettings must be used within a SettingsProvider");
  return context;
}

// Context provider component
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<HeatmapSettings>(getDefaults());

  // Load settings from file on mount
  useEffect(() => {
    async function loadSettings() {
      let newHeatmapSettings: HeatmapSettings | null =
        await readSettingsFromFile();
      if (!newHeatmapSettings) {
        newHeatmapSettings = getDefaults();
      }
      setSettings(newHeatmapSettings);
    }
    loadSettings();
  }, []);

  // Function to update settings (only allows partial updates)
  const updateSettings = (newSettings: Partial<HeatmapSettings>) => {
    setSettings((prev) => {
      const updatedSettings = { ...prev, ...newSettings };
      writeSettingsToFile(updatedSettings); // Save to file
      console.log(`Writing to settings`);
      return updatedSettings;
    });
  };

  // SurveyPoint actions
  // pass add, update, and delete grouped into an object
  const surveyPointActions: SurveyPointActions = {
    add: (newPoint: SurveyPoint) => {
      const newPoints = [...settings.surveyPoints, newPoint];
      updateSettings({ surveyPoints: newPoints });
    },

    update: (id: string, updatedData: object) => {
      const newPoints = settings.surveyPoints.map((point) =>
        point.id === id ? { ...point, ...updatedData } : point,
      );
      updateSettings({ surveyPoints: newPoints });
    },

    delete: (id: string) => {
      const newPoints = settings.surveyPoints.filter(
        (point) => point.id !== id,
      );
      updateSettings({ surveyPoints: newPoints });
    },
  };

  return (
    <SettingsContext.Provider
      value={{ settings, updateSettings, surveyPointActions }}
    >
      {children}
    </SettingsContext.Provider>
  );
}
