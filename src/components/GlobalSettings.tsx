"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { readSettingsFromFile, writeSettingsToFile } from "../lib/fileHandler";
import { Database } from "../lib/types";
import { getDefaults } from "../lib/fileHandler";

const getPlatform = (): string => {
  return process.platform === "darwin"
    ? "macos"
    : process.platform === "win32"
      ? "windows"
      : "linux";
};

// Define the shape of the settings object
export interface HeatmapSettings {
  savedSettings: Database;
  sudoerPassword: string; // separate because it should never be saved to the database file
  platform: string; // separate because it is determined at run-time
}

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
  const [settings, setSettings] = useState<HeatmapSettings>({
    savedSettings: getDefaults(),
    // determined at runtime
    platform: getPlatform(),
    sudoerPassword: "", // never saved
  });

  // Load settings from file on mount
  useEffect(() => {
    async function loadSettings() {
      // const savedSettings: Database = await readSettingsFromFile();
      const newHeatmapSettings: HeatmapSettings = {
        savedSettings: await readSettingsFromFile(),
        sudoerPassword: "",
        platform: getPlatform(),
      };
      setSettings(newHeatmapSettings);
    }
    loadSettings();
  }, []);

  // Function to update settings (only allows partial updates)
  const updateSettings = (newSettings: Partial<HeatmapSettings>) => {
    setSettings((prev) => {
      const updatedSettings = { ...prev, ...newSettings };
      // writeSettingsToFile(updatedSettings); // Save to file
      writeSettingsToFile(updatedSettings.savedSettings); // Save to file
      return updatedSettings;
    });
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}
