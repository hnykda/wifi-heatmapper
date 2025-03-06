"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { readSettingsFromFile, writeSettingsToFile } from "../lib/fileHandler";
import { HeatmapSettings } from "../lib/types";

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
    testDuration: 10,
    sudoerPassword: "",
    // addAPoint: addPoint,
    // delAPoint: deletePoint,
  };
};

// Define the context type
interface SettingsContextType {
  settings: HeatmapSettings;
  updateSettings: (newSettings: Partial<HeatmapSettings>) => void;
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
      // writeSettingsToFile(updatedSettings); // Save to file
      writeSettingsToFile(updatedSettings); // Save to file
      return updatedSettings;
    });
  };

  const [settings, setSettings] = useState<HeatmapSettings>(getDefaults());

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}
