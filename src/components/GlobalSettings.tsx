import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import {
  readSettingsFromFile,
  writeSettingsToFile,
} from "../utils/fileHandler";

// Define the shape of the settings object
interface Settings {
  theme: "light" | "dark";
  autoSave: boolean;
  fontSize: number;
  filePath: string;
}

// Define the context type
interface SettingsContextType {
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => void;
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
  const [settings, setSettings] = useState<Settings>({
    theme: "light",
    autoSave: true,
    fontSize: 14,
    filePath: "/default/path",
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
  const updateSettings = (newSettings: Partial<Settings>) => {
    setSettings((prev) => {
      const updatedSettings = { ...prev, ...newSettings };
      writeSettingsToFile(updatedSettings); // Save to file
      return updatedSettings;
    });
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}
