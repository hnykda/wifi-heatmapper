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
  * Pct	   dBm		   dBm	Pct		   dBm  Pct
 * 0%  -100dBm	 -100dBm	0%	 -100dBm	0%
 * 10%	-94dBm		-94dBm	10%		-90dBm	17%
 * 20%	-88dBm		-88dBm	20%		-80dBm	33%
 * 25%	-85dBm		-85dBm	25%		-75dBm	42%
 * 30%	-82dBm		-82dBm	30%		-70dBm	50%
 * 40%	-76dBm		-76dBm	40%		-65dBm	58%
 * 50%	-70dBm		-70dBm	50%		-60dBm	67%
 * 60%	-64dBm		-64dBm	60%		-55dBm	75%
 * 70%	-58dBm		-58dBm	70%		-50dBm	83%
 * 75%	-55dBm		-55dBm	75%		-45dBm	92%
 * 80%	-52dBm		-52dBm	80%		-40dBm	100%
 * 90%	-46dBm		-46dBm	90%		
 * 100%	-40dBm		-40dBm	100%
 * /
   
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
    dimensions: { width: 0, height: 0 },
    radiusDivider: 1,
    maxOpacity: 0.7,
    minOpacity: 0.2,
    blur: 0.99,
    gradient: {
      0: "rgba(255, 0, 0, 0.6)", // 0%, -100 dBm
      0.35: "rgba(255, 255, 0, 0.6)", // 35%, -83 dBm
      // 0.5: "rgba(0, 0, 0, 0.6)", // -% --dBm
      0.4: "rgba(0, 0, 255, 0.6)", // 40%, -76 dBm
      0.6: "rgba(0, 255, 255, 0.6)", // 60%, -64 dBm
      0.9: "rgba(0, 255, 0, 0.6)", // 90%, -46 dBm
      1.0: "rgba(0, 255, 0, 0.6)", // 100%, -40 dBm
    },
    // Original gradient color mapping
    //  gradient: {
    //   0.05: "rgba(0, 0, 0, 0.6)", // throw some grey in there
    //   0.1: "rgba(0, 0, 255, 0.6)", // 40%, -80 dBm
    //   0.25: "rgba(0, 255, 255, 0.6)", // 60%, -70 dBm
    //   0.5: "rgba(0, 255, 0, 0.6)", // 70%, -60 dBm
    //   0.75: "rgba(255, 255, 0, 0.6)", // 85%, -50 dBm
    //   1.0: "rgba(255, 0, 0, 0.6)", // 100%, -40 dBm
    // },
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
      if (newHeatmapSettings) {
        // we read from a file, but that won't contain the password
        newHeatmapSettings.sudoerPassword = "";
      } else {
        // just use the defaults, if no settings came from file
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
  // add, update, and delete a point in the surveyPoints array
  // grouped into an object
  const surveyPointActions: SurveyPointActions = {
    add: (newPoint: SurveyPoint) => {
      const newPoints = [...settings.surveyPoints, newPoint];
      updateSettings({ surveyPoints: newPoints });
    },

    update: (thePoint: SurveyPoint, updatedData: object) => {
      const newPoints = settings.surveyPoints.map((point) =>
        point.id === thePoint.id ? { ...point, ...updatedData } : point,
      );
      updateSettings({ surveyPoints: newPoints });
    },

    //     function removePointsById(points: { id: number }[], targetArray: { id: number }[]): { id: number }[] {
    //     const idsToRemove = new Set(points.map(point => point.id));
    //     return targetArray.filter(point => !idsToRemove.has(point.id));
    // }

    delete: (points: SurveyPoint[]) => {
      const pointsToRemove = new Set(points.map((point) => point.id));
      const newPoints = settings.surveyPoints.filter(
        (point) => !pointsToRemove.has(point.id),
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
