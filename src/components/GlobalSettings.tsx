import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { readSettingsFromFile, writeSettingsToFile } from "../lib/fileHandler";
import { Database } from "../lib/types";
import { getDefaults } from "../lib/utils";

// Define the shape of the settings object
interface HeatmapSettings {
  savedSettings: Database;
  sudoerPassword: string; // separate because it should never be saved
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
    sudoerPassword: "",
  });

  // Load settings from file on mount
  useEffect(() => {
    async function loadSettings() {
      const savedSettings = await readSettingsFromFile();
      setSettings(savedSettings);
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
