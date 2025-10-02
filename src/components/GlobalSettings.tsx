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
import { join } from "path";

/**
 * getDefaults()
 * @param floorPlan - desired floor plan, or "" if unknown
 * @returns Set of default settings for that floor plan
 */
export const getDefaults = (floorPlan: string): HeatmapSettings => {
  return {
    surveyPoints: [],
    floorplanImageName: floorPlan,
    floorplanImagePath: join("/media", floorPlan),
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
      0.5: "rgba(0, 0, 255, 0.6)", // 40%, -76 dBm
      0.6: "rgba(0, 255, 255, 0.6)", // 60%, -64 dBm
      0.75: "rgba(0, 255, 0, 0.6)", // 75%, -55 dBm
      0.9: "rgba(0, 255, 0, 0.6)", // 90%, -46 dBm
      1.0: "rgba(0, 255, 0, 0.6)", // 100%, -40 dBm
    },
    // these two props were used for the "scan wifi" effort
    // that has been (temporarily?) abandoned
    // sameSSID: "same",
    // ignoredSSIDs: ["AP-WH4E-C0BFBE6ACDA3", "LochLymeLodge-UB"],
  };
};

interface SettingsContextType {
  settings: HeatmapSettings;
  updateSettings: (newSettings: Partial<HeatmapSettings>) => void;
  surveyPointActions: SurveyPointActions;
  readNewSettingsFromFile: (theFile: string) => void;
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
  const [settings, setSettings] = useState<HeatmapSettings>(getDefaults(""));
  const [floorplanImage, setFloorplanImage] = useState<string>("");
  const defaultFloorPlan = "EmptyFloorPlan.png";

  async function loadSettings(floorplanImage: string) {
    let newHeatmapSettings: HeatmapSettings | null =
      await readSettingsFromFile(floorplanImage);
    if (newHeatmapSettings) {
      // we read from a file, but that won't contain the password
      newHeatmapSettings.sudoerPassword = "";
      setSettings(newHeatmapSettings);
    } else {
      // use the provided floor plan image or the default
      const floorPlanUsed =
        floorplanImage == "" ? defaultFloorPlan : floorplanImage;
      newHeatmapSettings = getDefaults(floorPlanUsed);
      writeSettingsToFile(newHeatmapSettings);
      setSettings(newHeatmapSettings);
    }
  }

  // Load settings from file on mount, or whenever the floorplanImage changes
  useEffect(() => {
    loadSettings(floorplanImage);
  }, [floorplanImage]);

  const readNewSettingsFromFile = (fileName: string) => {
    setFloorplanImage(fileName); // set the new floorplanImage, and let useEffect() do the work
  };

  // Function to update settings (only allows partial updates)
  const updateSettings = (newSettings: Partial<HeatmapSettings>) => {
    setSettings((prev) => {
      const updatedSettings = { ...prev, ...newSettings };
      writeSettingsToFile(updatedSettings); // Save to file
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
      value={{
        settings,
        updateSettings,
        surveyPointActions,
        readNewSettingsFromFile,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}
