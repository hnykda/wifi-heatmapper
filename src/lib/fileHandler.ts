import { HeatmapSettings } from "./types";

export const getDefaults = (): HeatmapSettings => {
  return {
    surveyPoints: [],
    floorplanImagePath: "foo.png",
    iperfServerAdrs: "127.0.0.1",
    apMapping: [],
    testDuration: 10,
    sudoerPassword: "",
    // dbPath: "",
    // platform: "",
  };
};

export async function readSettingsFromFile(): Promise<HeatmapSettings> {
  try {
    const data = localStorage.getItem("projectSettings"); // Simulating file storage
    return data ? JSON.parse(data) : getDefaults();
  } catch (error) {
    console.error("Error reading settings:", error);
    return getDefaults();
  }
}

export async function writeSettingsToFile(
  settings: HeatmapSettings,
): Promise<void> {
  try {
    // ensure the sudoerPassword is removed so it won't be written out
    const { sudoerPassword: _, ...noPWSettings } = settings;
    localStorage.setItem("projectSettings", JSON.stringify(noPWSettings)); // Simulating file storage
  } catch (error) {
    console.error("Error saving settings:", error);
  }
}
